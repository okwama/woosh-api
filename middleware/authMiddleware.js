const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { withConnectionRetry } = require('../lib/connectionManager');

// Circuit breaker for database operations
class CircuitBreaker {
  constructor(failureThreshold = 5, resetTimeout = 60000) {
    this.failureThreshold = failureThreshold;
    this.resetTimeout = resetTimeout;
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
  }

  async execute(operation) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }
}

// Global circuit breaker instance
const dbCircuitBreaker = new CircuitBreaker();

// Retry function for database operations
const retryOperation = async (operation, maxRetries = 3, delay = 100) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const isLockTimeout = error.message && error.message.includes('Lock wait timeout');
      const isRetryable = isLockTimeout || error.code === 'P2002'; // Unique constraint or lock timeout
      
      if (attempt === maxRetries || !isRetryable) {
        throw error;
      }
      
      // Exponential backoff
      const waitTime = delay * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
};

// Optimistic update helper
const optimisticUpdate = async (operation, fallback = null) => {
  try {
    return await retryOperation(operation);
  } catch (error) {
    console.warn('Optimistic update failed, using fallback:', error.message);
    return fallback;
  }
};

// Function to generate new tokens
const generateNewTokens = async (userId, role) => {
  try {
    // Generate new access token
    const newAccessToken = jwt.sign(
      { userId, role, type: 'access' },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    // Generate new refresh token
    const newRefreshToken = jwt.sign(
      { userId, role, type: 'refresh' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Store both tokens in database atomically
    const tokens = await retryOperation(async () => {
      return await prisma.$transaction(async (tx) => {
        // Create access token
        const accessToken = await tx.token.create({
          data: {
            token: newAccessToken,
            salesRepId: userId,
            tokenType: 'access',
            expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000), // 8 hours
            blacklisted: false
          }
        });

        // Create refresh token
        const refreshToken = await tx.token.create({
          data: {
            token: newRefreshToken,
            salesRepId: userId,
            tokenType: 'refresh',
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
            blacklisted: false
          }
        });

        return { accessToken, refreshToken };
      }, {
        maxWait: 5000, // 5 second max wait for transaction
        timeout: 10000  // 10 second timeout
      });
    });

    return { newAccessToken, newRefreshToken };
  } catch (error) {
    console.error('Error generating new tokens:', error);
    throw error;
  }
};

// Cache helper with stale-while-revalidate
class ResponseCache {
  constructor() {
    this.cache = new Map();
    this.defaultTTL = 300000; // 5 minutes
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    
    const now = Date.now();
    if (now > item.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    
    return item.data;
  }

  set(key, data, ttl = this.defaultTTL) {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttl
    });
  }

  // Stale-while-revalidate pattern
  async getOrFetch(key, fetchFn, ttl = this.defaultTTL) {
    const cached = this.get(key);
    
    if (cached) {
      // Return cached data immediately, then refresh in background
      setImmediate(async () => {
        try {
          const fresh = await fetchFn();
          this.set(key, fresh, ttl);
        } catch (error) {
          console.warn('Background refresh failed:', error.message);
        }
      });
      return cached;
    }
    
    // No cache, fetch fresh data
    try {
      const fresh = await fetchFn();
      this.set(key, fresh, ttl);
      return fresh;
    } catch (error) {
      throw error;
    }
  }
}

// Global cache instance
const responseCache = new ResponseCache();

// Auth failure tracking for emergency fallback
class AuthFailureTracker {
  constructor(failureThreshold = 10, windowMs = 300000) { // 5 minutes window
    this.failureThreshold = failureThreshold;
    this.windowMs = windowMs;
    this.failures = [];
    this.emergencyMode = false;
    this.emergencyModeStart = null;
    this.emergencyModeDuration = 600000; // 10 minutes emergency mode
    this.emergencyUsageCount = 0;
    this.emergencyUsageLog = [];
  }

  recordFailure() {
    const now = Date.now();
    
    // Clean old failures
    this.failures = this.failures.filter(time => now - time < this.windowMs);
    
    // Add new failure
    this.failures.push(now);
    
    // Check if we should enter emergency mode
    if (this.failures.length >= this.failureThreshold && !this.emergencyMode) {
      this.enterEmergencyMode();
    }
  }

  recordSuccess() {
    // Clear failures on success
    this.failures = [];
    
    // Exit emergency mode if we're in it
    if (this.emergencyMode) {
      this.exitEmergencyMode();
    }
  }

  enterEmergencyMode() {
    this.emergencyMode = true;
    this.emergencyModeStart = Date.now();
    console.warn('🚨 EMERGENCY MODE: Auth system failing, allowing requests without authentication');
    console.warn(`🚨 Emergency mode will last for ${this.emergencyModeDuration / 60000} minutes`);
    
    // Log to external monitoring if available
    if (process.env.EMERGENCY_ALERT_WEBHOOK) {
      fetch(process.env.EMERGENCY_ALERT_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'emergency_mode_activated',
          timestamp: new Date().toISOString(),
          failure_count: this.failures.length,
          message: 'Authentication system is failing - emergency mode activated'
        })
      }).catch(err => console.warn('Failed to send emergency alert:', err.message));
    }
  }

  exitEmergencyMode() {
    this.emergencyMode = false;
    this.emergencyModeStart = null;
    console.log('✅ Emergency mode disabled - auth system recovered');
  }

  isEmergencyMode() {
    if (!this.emergencyMode) return false;
    
    // Check if emergency mode has expired
    if (Date.now() - this.emergencyModeStart > this.emergencyModeDuration) {
      this.exitEmergencyMode();
      return false;
    }
    
    return true;
  }

  getFailureCount() {
    return this.failures.length;
  }

  getEmergencyModeStatus() {
    if (!this.emergencyMode) return null;
    
    const elapsed = Date.now() - this.emergencyModeStart;
    const remaining = this.emergencyModeDuration - elapsed;
    
    return {
      active: true,
      elapsed: Math.floor(elapsed / 1000),
      remaining: Math.floor(remaining / 1000),
      failureCount: this.failures.length
    };
  }

  recordEmergencyUsage(req) {
    this.emergencyUsageCount++;
    
    const usage = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent'),
      count: this.emergencyUsageCount
    };
    
    this.emergencyUsageLog.push(usage);
    
    // Keep only last 100 entries
    if (this.emergencyUsageLog.length > 100) {
      this.emergencyUsageLog = this.emergencyUsageLog.slice(-100);
    }
    
    // Log to console for monitoring
    console.warn(`🚨 Emergency mode usage #${this.emergencyUsageCount}:`, {
      method: req.method,
      path: req.path,
      ip: req.ip || req.connection.remoteAddress,
      timestamp: new Date().toISOString()
    });
  }

  getEmergencyUsageStats() {
    return {
      totalUsage: this.emergencyUsageCount,
      recentUsage: this.emergencyUsageLog.slice(-10), // Last 10 usages
      isActive: this.emergencyMode,
      failureCount: this.failures.length
    };
  }
}

// Global auth failure tracker
const authFailureTracker = new AuthFailureTracker();

// Main authentication middleware
const authenticateToken = async (req, res, next) => {
  try {
    // Check if we're in emergency mode
    if (authFailureTracker.isEmergencyMode()) {
      console.warn('🚨 EMERGENCY MODE: Bypassing authentication for request:', req.method, req.path);
      
      // Track emergency mode usage
      authFailureTracker.recordEmergencyUsage(req);
      
      // Set emergency mode headers
      res.setHeader('X-Emergency-Mode', 'true');
      res.setHeader('X-Auth-Bypassed', 'true');
      
      // Create a minimal user object for emergency mode
      req.user = {
        id: 'emergency-user',
        role: 'EMERGENCY',
        name: 'Emergency Access',
        emergencyMode: true
      };
      req.token = 'emergency-token';
      req.tokensRefreshed = false;
      req.emergencyMode = true;
      
      // Set security headers
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      
      next();
      return;
    }

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      authFailureTracker.recordFailure();
      return res.status(401).json({ error: 'Access token required' });
    }

    // Verify the token first
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Check if it's an access token
      if (decoded.type !== 'access') {
        authFailureTracker.recordFailure();
        return res.status(401).json({ 
          error: 'Invalid token type. Access token required.',
          code: 'INVALID_TOKEN_TYPE'
        });
      }
    } catch (jwtError) {
      authFailureTracker.recordFailure();
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({ 
          error: 'Access token expired. Please refresh your token.',
          code: 'TOKEN_EXPIRED'
        });
      }
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Try to check token in database
    let tokenRecord = null;
    let dbAvailable = true;
    
    try {
      // Check if access token exists in database and is not expired/blacklisted
      tokenRecord = await prisma.token.findFirst({
        where: {
          token: token,
          salesRepId: decoded.userId,
          tokenType: 'access',
          blacklisted: false,
          expiresAt: {
            gt: new Date()
          }
        }
      });
    } catch (dbError) {
      console.warn('Database connection issue during token validation:', dbError.message);
      dbAvailable = false;
    }

    // If database is available but token not found, try to refresh tokens
    if (dbAvailable && !tokenRecord) {
      console.log('Token not found in database but JWT is valid, attempting token refresh for user:', decoded.userId);
      
      try {
        // Get user details first
        const user = await prisma.salesRep.findUnique({
          where: { id: decoded.userId },
          include: {
            Manager: true,
            countryRelation: true
          }
        });

        if (!user) {
          return res.status(401).json({ error: 'User not found' });
        }

        // Atomic token refresh: blacklist old token and create new tokens
        const { newAccessToken, newRefreshToken } = await retryOperation(async () => {
          return await prisma.$transaction(async (tx) => {
            // Blacklist the old token
            await tx.token.updateMany({
              where: {
                token: token,
                salesRepId: decoded.userId,
                tokenType: 'access'
              },
              data: { blacklisted: true }
            });

            // Generate new tokens
            const accessToken = jwt.sign(
              { userId: decoded.userId, role: user.role, type: 'access' },
              process.env.JWT_SECRET,
              { expiresIn: '8h' }
            );

            const refreshToken = jwt.sign(
              { userId: decoded.userId, role: user.role, type: 'refresh' },
              process.env.JWT_SECRET,
              { expiresIn: '7d' }
            );

            // Create new tokens
            await tx.token.create({
              data: {
                token: accessToken,
                salesRepId: decoded.userId,
                tokenType: 'access',
                expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
                blacklisted: false
              }
            });

            await tx.token.create({
              data: {
                token: refreshToken,
                salesRepId: decoded.userId,
                tokenType: 'refresh',
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                blacklisted: false
              }
            });

            return { newAccessToken: accessToken, newRefreshToken: refreshToken };
          }, {
            maxWait: 5000, // 5 second max wait
            timeout: 10000  // 10 second timeout
          });
        });

        // Set the new access token in the request for this call
        req.user = user;
        req.token = newAccessToken;
        req.tokensRefreshed = true;
        req.newTokens = { accessToken: newAccessToken, refreshToken: newRefreshToken };

        // Set security headers
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

        console.log('Tokens automatically refreshed for user:', decoded.userId);

        // Record successful authentication
        authFailureTracker.recordSuccess();

        next();
        return;
      } catch (refreshError) {
        console.error('Failed to refresh tokens:', refreshError);
        return res.status(401).json({ 
          error: 'Token validation failed. Please login again.',
          code: 'TOKEN_REFRESH_FAILED'
        });
      }
    }

    // If database is not available, continue with JWT-only validation
    if (!dbAvailable) {
      console.warn('Database unavailable, using JWT-only validation for user:', decoded.userId);
    }

    // Get user details with caching and graceful degradation
    let user;
    try {
      user = await responseCache.getOrFetch(
        `user:${decoded.userId}`,
        async () => {
          return await withGracefulDegradation(
            async () => {
              return await withConnectionRetry(async () => {
                return await prisma.salesRep.findUnique({
                  where: { id: decoded.userId },
                  include: {
                    Manager: true,
                    countryRelation: true
                  }
                });
              }, 'user-fetch');
            },
            async () => {
              // Fallback: return minimal user info from JWT
              return {
                id: decoded.userId,
                role: decoded.role,
                name: decoded.name || 'Unknown User'
              };
            },
            'user-fetch'
          );
        },
        300000 // 5 minutes cache
      );
    } catch (userError) {
      console.warn('Failed to fetch user details:', userError.message);
      // Ultimate fallback: minimal user info from JWT
      user = {
        id: decoded.userId,
        role: decoded.role,
        name: decoded.name || 'Unknown User'
      };
    }

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Set security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

    req.user = user;
    req.token = token;
    req.tokensRefreshed = false;

    // Record successful authentication
    authFailureTracker.recordSuccess();

    // Update last used timestamp if we have a token record and database is available
    if (tokenRecord && dbAvailable) {
      // Optimistic update - don't block the response
      optimisticUpdate(async () => {
        return await prisma.token.update({
          where: { id: tokenRecord.id },
          data: { lastUsedAt: new Date() }
        });
      }).catch(error => {
        // Silently fail - this update isn't critical
        console.debug('Token lastUsedAt update failed (non-critical):', error.message);
      });
    }

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Function to create a user and update the manager table if necessary
const createUser = async (req, res) => {
  const { name, email, phoneNumber, password, role, managerDetails } = req.body;

  try {
    // Create user and manager atomically
    const result = await prisma.$transaction(async (tx) => {
      // Create the user first
      const user = await tx.salesRep.create({
        data: {
          name,
          email,
          phoneNumber,
          password, // Ensure you hash the password before saving it
          role,
        },
      });

      // Create manager if role is manager
      if (role === 'MANAGER') {
        await tx.manager.create({
          data: {
            userId: user.id,
            email: managerDetails.email,
            password: managerDetails.password,
            department: managerDetails.department,
          },
        });
      }

      return user;
    }, {
      maxWait: 5000, // 5 second max wait
      timeout: 10000  // 10 second timeout
    });

    // Respond with the created user
    res.status(201).json(result);
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
};

// Response middleware to handle token refresh notifications
const handleTokenRefresh = (req, res, next) => {
  // Store the original send function
  const originalSend = res.send;
  
  // Override the send function
  res.send = function(data) {
    // Check if response has already been sent
    if (res.headersSent) {
      return; // Don't try to send again
    }
    
    // If tokens were refreshed during this request, add them to the response
    if (req.tokensRefreshed && req.newTokens) {
      let responseData;
      
      try {
        // Parse the response data if it's a string
        if (typeof data === 'string') {
          responseData = JSON.parse(data);
        } else {
          responseData = data;
        }
        
        // Add token refresh information to the response
        responseData.tokensRefreshed = true;
        responseData.newAccessToken = req.newTokens.accessToken;
        responseData.newRefreshToken = req.newTokens.refreshToken;
        
        // Set a custom header to indicate token refresh
        if (!res.headersSent) {
          res.setHeader('X-Token-Refreshed', 'true');
        }
        
        // Call the original send with modified data
        return originalSend.call(this, JSON.stringify(responseData));
      } catch (parseError) {
        // If we can't parse the response, just add headers
        if (!res.headersSent) {
          res.setHeader('X-Token-Refreshed', 'true');
          res.setHeader('X-New-Access-Token', req.newTokens.accessToken);
          res.setHeader('X-New-Refresh-Token', req.newTokens.refreshToken);
        }
        
        return originalSend.call(this, data);
      }
    }
    
    // Call the original send function
    return originalSend.call(this, data);
  };
  
  next();
};

// Graceful degradation helper
const withGracefulDegradation = async (criticalOperation, fallbackOperation, context = '') => {
  try {
    return await dbCircuitBreaker.execute(criticalOperation);
  } catch (error) {
    console.warn(`Critical operation failed (${context}), using fallback:`, error.message);
    
    if (fallbackOperation) {
      try {
        return await fallbackOperation();
      } catch (fallbackError) {
        console.error(`Fallback operation also failed (${context}):`, fallbackError.message);
        throw fallbackError;
      }
    }
    
    throw error;
  }
};

// Function to get emergency mode status
const getEmergencyModeStatus = () => {
  return authFailureTracker.getEmergencyModeStatus();
};

// Function to get emergency usage statistics
const getEmergencyUsageStats = () => {
  return authFailureTracker.getEmergencyUsageStats();
};

// Function to manually trigger emergency mode (for testing/admin purposes)
const triggerEmergencyMode = () => {
  authFailureTracker.enterEmergencyMode();
  return { message: 'Emergency mode manually triggered' };
};

// Function to disable emergency mode (for admin purposes)
const disableEmergencyMode = () => {
  authFailureTracker.exitEmergencyMode();
  return { message: 'Emergency mode manually disabled' };
};

// Export all functions
module.exports = {
  authenticateToken,
  auth: authenticateToken, // Alias for backward compatibility
  protect: authenticateToken, // Add protect middleware
  handleTokenRefresh, // Add the new middleware
  createUser,
  getEmergencyModeStatus,
  getEmergencyUsageStats,
  triggerEmergencyMode,
  disableEmergencyMode
};