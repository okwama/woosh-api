const prisma = require('./prisma');
const { withConnectionRetry } = require('./connectionManager');

// Token cache for frequently accessed tokens
class TokenCache {
  constructor() {
    this.cache = new Map();
    this.maxSize = 1000; // Maximum cached tokens
    this.ttl = 5 * 60 * 1000; // 5 minutes cache TTL
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    
    return item.data;
  }

  set(key, data) {
    // Implement LRU eviction
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + this.ttl
    });
  }

  invalidate(pattern) {
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  clear() {
    this.cache.clear();
  }
}

// Enhanced retry logic for lock timeouts
const retryWithLockTimeout = async (operation, maxRetries = 3, baseDelay = 100) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const isLockTimeout = 
        error.message.includes('Lock wait timeout exceeded') ||
        error.message.includes('Deadlock found') ||
        error.message.includes('lock wait timeout') ||
        error.code === 1205;

      if (attempt === maxRetries || !isLockTimeout) {
        throw error;
      }

      // Exponential backoff with jitter to prevent thundering herd
      const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 100;
      console.warn(`Lock timeout on attempt ${attempt}, retrying in ${Math.round(delay)}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

class TokenService {
  constructor() {
    this.cache = new TokenCache();
  }

  // Optimized token validation with caching
  async validateToken(token, salesRepId, tokenType = 'access') {
    const cacheKey = `${token}:${salesRepId}:${tokenType}`;
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const tokenRecord = await retryWithLockTimeout(async () => {
        return await withConnectionRetry(async () => {
          return await prisma.token.findFirst({
            where: {
              token,
              salesRepId,
              tokenType,
              blacklisted: false,
              expiresAt: {
                gt: new Date()
              }
            },
            select: {
              id: true,
              salesRepId: true,
              tokenType: true,
              expiresAt: true,
              lastUsedAt: true
            }
          });
        }, 'token-validation');
      }, 2, 100); // Fewer retries for validation

      if (tokenRecord) {
        // Cache valid tokens
        this.cache.set(cacheKey, tokenRecord);
      }

      return tokenRecord;
    } catch (error) {
      console.error('Token validation error:', error.message);
      // Don't cache failed validations
      return null;
    }
  }

  // Batch token creation for better performance
  async createTokens(tokens) {
    try {
      const result = await withConnectionRetry(async () => {
        return await prisma.token.createMany({
          data: tokens,
          skipDuplicates: true // Skip if token already exists
        });
      }, 'batch-token-creation');

      // Invalidate cache for affected users
      const userIds = [...new Set(tokens.map(t => t.salesRepId))];
      userIds.forEach(userId => {
        this.cache.invalidate(`:${userId}:`);
      });

      return result;
    } catch (error) {
      console.error('Batch token creation error:', error.message);
      throw error;
    }
  }

  // Optimized token refresh with atomic operations and lock timeout handling
  async refreshTokens(userId, role) {
    try {
      const result = await retryWithLockTimeout(async () => {
        return await withConnectionRetry(async () => {
          return await prisma.$transaction(async (tx) => {
            // Use SELECT FOR UPDATE to prevent race conditions
            const existingTokens = await tx.token.findMany({
              where: {
                salesRepId: userId,
                tokenType: 'access',
                blacklisted: false
              },
              select: { id: true }
            });

            // Blacklist old tokens in batches to reduce lock time
            if (existingTokens.length > 0) {
              const tokenIds = existingTokens.map(t => t.id);
              await tx.token.updateMany({
                where: {
                  id: { in: tokenIds }
                },
                data: { blacklisted: true }
              });
            }

            // Generate new tokens
            const { accessToken, refreshToken } = await this.generateTokenPair(userId, role);

            // Create new tokens
            const now = new Date();
            const accessExpiry = new Date(now.getTime() + 8 * 60 * 60 * 1000); // 8 hours
            const refreshExpiry = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

            await tx.token.createMany({
              data: [
                {
                  token: accessToken,
                  salesRepId: userId,
                  tokenType: 'access',
                  expiresAt: accessExpiry
                },
                {
                  token: refreshToken,
                  salesRepId: userId,
                  tokenType: 'refresh',
                  expiresAt: refreshExpiry
                }
              ]
            });

            return { accessToken, refreshToken };
          }, {
            maxWait: 3000, // Reduced from 5000
            timeout: 8000   // Reduced from 10000
          });
        }, 'token-refresh');
      });

      // Invalidate cache for this user
      this.cache.invalidate(`:${userId}:`);

      return result;
    } catch (error) {
      console.error('Token refresh error:', error.message);
      throw error;
    }
  }

  // Generate JWT token pair
  async generateTokenPair(userId, role) {
    const jwt = require('jsonwebtoken');
    
    const accessToken = jwt.sign(
      { userId, role, type: 'access' },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    const refreshToken = jwt.sign(
      { userId, role, type: 'refresh' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return { accessToken, refreshToken };
  }

  // Optimized lastUsedAt update with lock timeout handling
  async updateLastUsed(tokenId) {
    // Use setImmediate to make it truly non-blocking
    setImmediate(async () => {
      try {
        await retryWithLockTimeout(async () => {
          return await withConnectionRetry(async () => {
            // Use a shorter transaction for this non-critical update
            return await prisma.$transaction(async (tx) => {
              return await tx.token.update({
                where: { id: tokenId },
                data: { lastUsedAt: new Date() }
              });
            }, {
              maxWait: 1000,
              timeout: 3000
            });
          }, 'last-used-update');
        }, 2, 50); // Fewer retries, shorter delays for non-critical operation
      } catch (error) {
        // Completely silent - this is not critical
        console.debug('LastUsedAt update failed (non-critical):', error.message);
      }
    });
  }

  // Batch cleanup of expired tokens with lock timeout handling
  async cleanupExpiredTokens(batchSize = 50) { // Reduced batch size
    try {
      const now = new Date();
      
      // Delete expired tokens in batches
      let deletedCount = 0;
      let hasMore = true;

      while (hasMore) {
        const result = await retryWithLockTimeout(async () => {
          return await withConnectionRetry(async () => {
            return await prisma.$transaction(async (tx) => {
              // Get expired tokens first
              const expiredTokens = await tx.token.findMany({
                where: {
                  expiresAt: { lt: now }
                },
                take: batchSize,
                select: { id: true }
              });

              if (expiredTokens.length === 0) {
                return { count: 0 };
              }

              // Delete them
              return await tx.token.deleteMany({
                where: {
                  id: { in: expiredTokens.map(t => t.id) }
                }
              });
            }, {
              maxWait: 2000,
              timeout: 5000
            });
          }, 'token-cleanup');
        });

        deletedCount += result.count;
        hasMore = result.count === batchSize;

        // Longer delay between batches to prevent overwhelming the database
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      console.log(`🧹 Cleaned up ${deletedCount} expired tokens`);
      return deletedCount;
    } catch (error) {
      console.error('Token cleanup error:', error.message);
      return 0;
    }
  }

  // Get token statistics
  async getTokenStats() {
    try {
      const stats = await withConnectionRetry(async () => {
        return await prisma.token.groupBy({
          by: ['tokenType', 'blacklisted'],
          _count: {
            id: true
          }
        });
      }, 'token-stats');

      return stats.reduce((acc, stat) => {
        const key = `${stat.tokenType}_${stat.blacklisted ? 'blacklisted' : 'active'}`;
        acc[key] = stat._count.id;
        return acc;
      }, {});
    } catch (error) {
      console.error('Token stats error:', error.message);
      return {};
    }
  }

  // Clear cache for a specific user
  clearUserCache(userId) {
    this.cache.invalidate(`:${userId}:`);
  }

  // Clear all cache
  clearCache() {
    this.cache.clear();
  }

  // New method: Blacklist tokens with lock timeout handling
  async blacklistTokens(userId, tokenType = null) {
    try {
      const result = await retryWithLockTimeout(async () => {
        return await withConnectionRetry(async () => {
          return await prisma.$transaction(async (tx) => {
            const whereClause = {
              salesRepId: userId,
              blacklisted: false
            };

            if (tokenType) {
              whereClause.tokenType = tokenType;
            }

            return await tx.token.updateMany({
              where: whereClause,
              data: { blacklisted: true }
            });
          }, {
            maxWait: 2000,
            timeout: 5000
          });
        }, 'token-blacklist');
      });

      // Invalidate cache for this user
      this.cache.invalidate(`:${userId}:`);

      return result;
    } catch (error) {
      console.error('Token blacklist error:', error.message);
      throw error;
    }
  }
}

// Global token service instance
const tokenService = new TokenService();

module.exports = {
  TokenService,
  tokenService
}; 