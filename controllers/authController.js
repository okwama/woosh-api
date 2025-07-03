const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { redisService } = require('../lib/redisService');
const { tokenMonitoring } = require('../lib/monitoring');

// Rate limiting configuration
const RATE_LIMIT_WINDOW = 15 * 60; // 15 minutes in seconds
const MAX_REQUESTS = 100; // Maximum requests per window
const LOGIN_RATE_LIMIT_WINDOW = 5 * 60; // 5 minutes for login
const MAX_LOGIN_ATTEMPTS = 5; // Maximum login attempts
const TOKEN_CLEANUP_BATCH_SIZE = 1000; // Batch size for token cleanup

// Helper function for rate limiting with Redis fallback
async function checkRateLimit(key, limit, window) {
  try {
    const current = (await redisService.get(key)) || 0;
    if (current >= limit) {
      return false;
    }
    await redisService.set(key, current + 1, window);
    return true;
  } catch (error) {
    console.warn('Redis rate limiting failed, allowing operation:', error.message);
    // Fallback: allow operation when Redis fails
    return true;
  }
}

// Optimized token cleanup function with monitoring
async function cleanupTokens(salesRepId, transaction) {
  const startTime = Date.now();
  try {
    const now = new Date();
    const result = await transaction.token.deleteMany({
      where: {
        salesRepId,
        OR: [
          { expiresAt: { lt: now } },
          { blacklisted: true }
        ]
      }
    });
    
    const duration = Date.now() - startTime;
    tokenMonitoring.trackCleanup(result.count, duration);
    return result;
  } catch (error) {
    tokenMonitoring.trackError('databaseErrors');
    throw error;
  }
}

// Optimized token invalidation function with monitoring
async function invalidateUserTokens(salesRepId, transaction) {
  try {
    const result = await transaction.token.updateMany({
      where: {
        salesRepId,
        blacklisted: false,
        tokenType: 'access'
      },
      data: { 
        blacklisted: true,
        lastUsedAt: new Date()
      }
    });
    
    tokenMonitoring.trackTokenOperation('invalidated', result.count);
    return result;
  } catch (error) {
    tokenMonitoring.trackError('databaseErrors');
    throw error;
  }
}

// Helper function for token management with Redis fallback (non-blocking)
async function storeTokenInRedis(userId, token, type, expiresIn, retryCount = 0) {
  const MAX_RETRIES = 2; // Reduced retries for faster fallback
  try {
    const key = `token:${type}:${userId}:${token}`;
    await redisService.set(
      key,
      {
        userId,
        type,
        token,
        createdAt: Date.now(),
      },
      expiresIn
    );

    await redisService.client.sadd(`user:${userId}:tokens`, key);
    tokenMonitoring.trackTokenOperation('created');
  } catch (error) {
    tokenMonitoring.trackError('redisErrors');
    if (retryCount < MAX_RETRIES) {
      await new Promise(resolve => setTimeout(resolve, 500 * (retryCount + 1))); // Faster retry
      return storeTokenInRedis(userId, token, type, expiresIn, retryCount + 1);
    }
    // Don't throw error - just log and continue
    console.warn(`Redis token storage failed after ${MAX_RETRIES} retries for user ${userId}:`, error.message);
    console.warn('Authentication will continue, but token caching is degraded');
  }
}

// Background token cleanup job
async function backgroundTokenCleanup() {
  try {
    const now = new Date();
    let deletedCount;
    do {
      deletedCount = await prisma.token.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: now } },
            { blacklisted: true }
          ]
        },
        take: TOKEN_CLEANUP_BATCH_SIZE
      });
    } while (deletedCount === TOKEN_CLEANUP_BATCH_SIZE);
  } catch (error) {
    console.error('Background token cleanup error:', error);
  }
}

// Schedule background cleanup every hour
setInterval(backgroundTokenCleanup, 60 * 60 * 1000);

const register = async (req, res) => {
  try {
    const {
      name,
      email,
      phoneNumber,
      password,
      country,
      route,
      route_id,
      countryId,
      region_id,
      region,
      role = 'SALES_REP', // Default to SALES_REP if not provided
      department, // Required for MANAGER
    } = req.body;

    // Rate limiting check
    const ipKey = `ratelimit:register:${req.ip}`;
    if (!(await checkRateLimit(ipKey, 10, 3600))) {
      // 10 registrations per hour per IP
      return res.status(429).json({
        message: 'Too many registration attempts. Please try again later.',
      });
    }

    // Validate required fields
    if (!name || !email || !phoneNumber || !password || !countryId || !region_id || !region) {
      return res.status(400).json({
        message:
          'All fields are required: name, email, phoneNumber, password, countryId, region_id, and region',
      });
    }

    // If role is MANAGER, ensure department is provided
    if (role === 'MANAGER' && !department) {
      return res.status(400).json({
        message: 'Department is required for manager registration',
      });
    }

    // Run parallel checks for existing user
    const [emailExists, phoneExists] = await Promise.all([
      prisma.salesRep.findFirst({ where: { email } }),
      prisma.salesRep.findFirst({ where: { phoneNumber } }),
    ]);

    if (emailExists || phoneExists) {
      return res.status(400).json({
        message: 'User already exists with this email or phone number',
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Normalize role
    const normalizedRole = role.toUpperCase();

    // Create user with transaction and parallel Redis operations
    const result = await prisma.$transaction(async (tx) => {
      // Create the user
      const salesRep = await tx.salesRep.create({
        data: {
          name,
          email,
          phoneNumber,
          password: hashedPassword,
          country,
          countryId,
          region_id,
          region,
          role: normalizedRole, // Use normalized role
          createdAt: new Date(),
          updatedAt: new Date(),
          route_id: route_id || 1,
          route: route || 'Kilimani',
          route_id_update: 1, // hardcoded default value
          route_name_update: 'Kilimani', // hardcoded default value
          visits_targets: 0, // hardcoded default value
          new_clients: 0, // hardcoded default value
          manager_type: 0, // hardcoded default value
          retail_manager: 0, // hardcoded default value
          key_channel_manager: 0, // hardcoded default value
          distribution_manager: 0, // hardcoded default value
        },
        include: {
          countryRelation: true,
        },
      });

      // If role is MANAGER, create manager record
      if (normalizedRole === 'MANAGER') {
        await tx.Manager.create({
          data: {
            userId: salesRep.id,
            department,
          },
        });
      }

      // Generate tokens
      const [accessToken, refreshToken] = await Promise.all([
        jwt.sign(
          { userId: salesRep.id, role: salesRep.role, type: 'access' },
          process.env.JWT_SECRET,
          { expiresIn: '8h' }
        ),
        jwt.sign(
          { userId: salesRep.id, role: salesRep.role, type: 'refresh' },
          process.env.JWT_SECRET,
          { expiresIn: '7d' }
        ),
      ]);

      // Store tokens in database (within transaction)
      await tx.token.createMany({
        data: [
          {
            token: accessToken,
            salesRepId: salesRep.id,
            tokenType: 'access',
            expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
          },
          {
            token: refreshToken,
            salesRepId: salesRep.id,
            tokenType: 'refresh',
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        ],
      });

      return { salesRep, accessToken, refreshToken };
    });

    // Store tokens in Redis after successful DB transaction (non-blocking)
    Promise.all([
      storeTokenInRedis(result.salesRep.id, result.accessToken, 'access', 8 * 60 * 60),
      storeTokenInRedis(result.salesRep.id, result.refreshToken, 'refresh', 7 * 24 * 60 * 60),
    ]).catch(error => {
      console.warn('Redis token storage failed during registration:', error.message);
    });

    res.status(201).json({
      message: 'Registration successful',
      salesRep: result.salesRep,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });

    // Reset rate limit counters on successful registration (non-blocking)
    try {
      await redisService.del(ipKey);
    } catch (error) {
      console.warn('Redis rate limit reset failed after registration:', error.message);
      // Continue - this doesn't affect registration success
    }
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Failed to register user', error: error.message });
  }
};


const login = async (req, res) => {
  try {
    const { phoneNumber, password } = req.body;

    // Basic validation
    if (!phoneNumber || !password) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and password are required'
      });
    }

    // Find user
    const salesRep = await prisma.salesRep.findFirst({
      where: { phoneNumber },
      include: { countryRelation: true },
    });

    // Validate user exists and password matches
    if (!salesRep || !(await bcrypt.compare(password, salesRep.password))) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid phone number or password' 
      });
    }

    // Generate simple tokens
    const accessToken = jwt.sign(
      { userId: salesRep.id, role: salesRep.role, type: 'access' },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    const refreshToken = jwt.sign(
      { userId: salesRep.id, role: salesRep.role, type: 'refresh' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Store tokens in database (simple, no cleanup)
    await prisma.token.createMany({
      data: [
        {
          token: accessToken,
          salesRepId: salesRep.id,
          tokenType: 'access',
          expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
        },
        {
          token: refreshToken,
          salesRepId: salesRep.id,
          tokenType: 'refresh',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      ],
    });

    // Return success response
    res.json({
      success: true,
      salesRep: {
        id: salesRep.id,
        name: salesRep.name,
        phoneNumber: salesRep.phoneNumber,
        role: salesRep.role,
        email: salesRep.email,
        photoUrl: salesRep.photoUrl,
        region: salesRep.region,
        region_id: salesRep.region_id,
        route_id: salesRep.route_id,
        countryId: salesRep.countryId,
        country: salesRep.countryRelation,
      },
      accessToken,
      refreshToken,
      expiresIn: 8 * 60 * 60,
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

const logout = async (req, res) => {
  try {
    const { userId } = req.user;
    const token = req.token;

    // Priority 1: Always update database first (most important)
    await prisma.token.updateMany({
      where: {
        salesRepId: userId,
        token,
        blacklisted: false,
      },
      data: { blacklisted: true },
    });

    // Priority 2: Redis cleanup (non-blocking fallback)
    Promise.all([
      // Invalidate token in Redis
      redisService.del(`token:access:${userId}:${token}`).catch(err => 
        console.warn('Failed to delete access token from Redis:', err.message)
      ),
      redisService.del(`token:refresh:${userId}:${token}`).catch(err => 
        console.warn('Failed to delete refresh token from Redis:', err.message)
      ),

      // Remove from user's token set
      redisService.client.srem(`user:${userId}:tokens`, `token:access:${userId}:${token}`).catch(err => 
        console.warn('Failed to remove access token from user set:', err.message)
      ),
      redisService.client.srem(`user:${userId}:tokens`, `token:refresh:${userId}:${token}`).catch(err => 
        console.warn('Failed to remove refresh token from user set:', err.message)
      ),
    ]).catch(() => {
      // All Redis operations failed, but logout already succeeded via DB
      console.warn(`Redis cleanup failed for user ${userId}, but logout succeeded via database`);
    });

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ message: 'Logout failed', error: error.message });
  }
};

const refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        error: 'Refresh token required',
      });
    }

    // Use a single transaction with retry logic
    const MAX_RETRIES = 3;
    let retryCount = 0;
    let result;

    while (retryCount < MAX_RETRIES) {
      try {
        result = await prisma.$transaction(async (tx) => {
          // Verify the refresh token
          const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);

          // Check if it's actually a refresh token
          if (decoded.type !== 'refresh') {
            throw new Error('Invalid token type');
          }

          // Get user from database
          const user = await tx.salesRep.findUnique({
            where: { id: decoded.userId },
            include: {
              Manager: true,
              countryRelation: true,
            },
          });

          if (!user) {
            throw new Error('User not found');
          }

          // Check if refresh token exists and is not blacklisted
          const refreshTokenRecord = await tx.token.findFirst({
            where: {
              token: refreshToken,
              salesRepId: decoded.userId,
              tokenType: 'refresh',
              blacklisted: false,
              expiresAt: {
                gt: new Date(),
              },
            },
          });

          // Clean up old tokens
          await cleanupTokens(user.id, tx);

          // If refresh token is invalid or expired, generate new tokens
          if (!refreshTokenRecord) {
            // Generate new tokens
            const [newAccessToken, newRefreshToken] = await Promise.all([
              jwt.sign(
                { userId: user.id, role: user.role, type: 'access' },
                process.env.JWT_SECRET,
                { expiresIn: '8h' }
              ),
              jwt.sign(
                { userId: user.id, role: user.role, type: 'refresh' },
                process.env.JWT_SECRET,
                { expiresIn: '7d' }
              ),
            ]);

            // Store new tokens
            await Promise.all([
              invalidateUserTokens(user.id, tx),
              tx.token.createMany({
                data: [
                  {
                    token: newAccessToken,
                    salesRepId: user.id,
                    tokenType: 'access',
                    expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
                  },
                  {
                    token: newRefreshToken,
                    salesRepId: user.id,
                    tokenType: 'refresh',
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                  },
                ],
              }),
            ]);

            return {
              accessToken: newAccessToken,
              refreshToken: newRefreshToken,
              user,
              tokensRegenerated: true,
            };
          }

          // Original flow - refresh token is valid
          const newAccessToken = jwt.sign(
            { userId: user.id, role: user.role, type: 'access' },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
          );

          // Store new access token
          await tx.token.create({
            data: {
              token: newAccessToken,
              salesRepId: user.id,
              tokenType: 'access',
              expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
            },
          });

          // Update refresh token last used
          await tx.token.update({
            where: { id: refreshTokenRecord.id },
            data: { lastUsedAt: new Date() },
          });

          return {
            accessToken: newAccessToken,
            refreshToken: refreshToken,
            user,
            tokensRegenerated: false,
          };
        });
        break;
      } catch (error) {
        retryCount++;
        if (retryCount === MAX_RETRIES || 
            error.message === 'Invalid token type' || 
            error.message === 'User not found') {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
      }
    }

    // Store tokens in Redis (non-blocking)
    const redisPromises = [
      storeTokenInRedis(result.user.id, result.accessToken, 'access', 8 * 60 * 60),
      result.tokensRegenerated && 
        storeTokenInRedis(result.user.id, result.refreshToken, 'refresh', 7 * 24 * 60 * 60),
    ].filter(Boolean);
    
    Promise.all(redisPromises).catch(error => {
      console.warn('Redis token storage failed during refresh:', error.message);
    });

    res.json({
      success: true,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: 8 * 60 * 60,
      tokensRegenerated: result.tokensRegenerated,
      user: {
        id: result.user.id,
        name: result.user.name,
        phoneNumber: result.user.phoneNumber,
        role: result.user.role,
        email: result.user.email,
        photoUrl: result.user.photoUrl,
        region: result.user.region,
        region_id: result.user.region_id,
        route_id: result.user.route_id,
        countryId: result.user.countryId,
        country: result.user.countryRelation,
      },
    });
  } catch (error) {
    console.error('Server error during refresh:', error);

    if (error.message === 'Invalid token type') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token type',
      });
    }

    if (error.message === 'User not found') {
      return res.status(401).json({
        success: false,
        error: 'User not found',
      });
    }

    if (error.message === 'Invalid refresh token') {
      return res.status(401).json({
        success: false,
        error: 'Invalid refresh token',
      });
    }

    res.status(500).json({
      success: false,
      error: 'Server error',
    });
  }
};

const deleteAccount = async (req, res) => {
  try {
    const userId = req.user?.id || req.body.userId || req.params.id;
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // 1. UpliftSaleItem -> UpliftSale
    const userUpliftSales = await prisma.upliftSale.findMany({
      where: { userId },
      select: { id: true },
    });
    const upliftSaleIds = userUpliftSales.map((u) => u.id);
    if (upliftSaleIds.length > 0) {
      await prisma.upliftSaleItem.deleteMany({ where: { upliftSaleId: { in: upliftSaleIds } } });
    }
    await prisma.upliftSale.deleteMany({ where: { userId } });

    // 2. ProductReturnItem -> ProductReturn
    const userProductReturns = await prisma.productReturn.findMany({
      where: { userId },
      select: { id: true },
    });
    const productReturnIds = userProductReturns.map((p) => p.id);
    if (productReturnIds.length > 0) {
      await prisma.productReturnItem.deleteMany({
        where: { productReturnId: { in: productReturnIds } },
      });
    }
    await prisma.productReturn.deleteMany({ where: { userId } });

    // 3. ProductsSampleItem -> ProductsSample
    const userProductsSamples = await prisma.productsSample.findMany({
      where: { userId },
      select: { id: true },
    });
    const productsSampleIds = userProductsSamples.map((p) => p.id);
    if (productsSampleIds.length > 0) {
      await prisma.productsSampleItem.deleteMany({
        where: { productsSampleId: { in: productsSampleIds } },
      });
    }
    await prisma.productsSample.deleteMany({ where: { userId } });

    // 4. OrderItem -> MyOrder
    const userOrders = await prisma.myOrder.findMany({ where: { userId }, select: { id: true } });
    const orderIds = userOrders.map((o) => o.id);
    if (orderIds.length > 0) {
      await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    }
    await prisma.myOrder.deleteMany({ where: { userId } });

    // 5. FeedbackReport, ProductReport, VisibilityReport -> Report
    const userReports = await prisma.report.findMany({ where: { userId }, select: { id: true } });
    const reportIds = userReports.map((r) => r.id);
    if (reportIds.length > 0) {
      await prisma.feedbackReport.deleteMany({ where: { reportId: { in: reportIds } } });
      await prisma.productReport.deleteMany({ where: { reportId: { in: reportIds } } });
      await prisma.visibilityReport.deleteMany({ where: { reportId: { in: reportIds } } });
    }
    await prisma.report.deleteMany({ where: { userId } });

    // Now delete all other related records
    await prisma.task.deleteMany({ where: { salesRepId: userId } });
    await prisma.token.deleteMany({ where: { salesRepId: userId } });
    await prisma.manager.deleteMany({ where: { userId } });
    await prisma.clientPayment.deleteMany({ where: { userId } });
    await prisma.feedbackReport.deleteMany({ where: { userId } });
    await prisma.journeyPlan.deleteMany({ where: { userId } });
    await prisma.loginHistory.deleteMany({ where: { userId } });
    await prisma.productReport.deleteMany({ where: { userId } });
    await prisma.target.deleteMany({ where: { salesRepId: userId } });
    await prisma.leave.deleteMany({ where: { userId } });

    // Finally, delete the user
    await prisma.salesRep.delete({ where: { id: userId } });

    res.json({ message: 'Account and all related data deleted successfully' });
  } catch (error) {
    console.error('Account deletion error:', error);
    res.status(500).json({ error: 'Failed to delete account', details: error.message });
  }
};

module.exports = {
  register,
  login,
  logout,
  refresh,
  delete: deleteAccount,
};
