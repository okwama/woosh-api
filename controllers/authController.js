const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

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
      department // Required for MANAGER
    } = req.body;

    // Validate required fields
    if (!name || !email || !phoneNumber || !password || !countryId || !region_id || !region) {
      return res.status(400).json({ 
        message: 'All fields are required: name, email, phoneNumber, password, countryId, region_id, and region' 
      });
    }

    // If role is MANAGER, ensure department is provided
    if (role === 'MANAGER' && !department) {
      return res.status(400).json({ 
        message: 'Department is required for manager registration' 
      });
    }

    // Check if user already exists
    const salesRep = await prisma.salesRep.findFirst({
      where: {
        OR: [
          { email },
          { phoneNumber }
        ]
      }
    });

    if (salesRep) {
      return res.status(400).json({ message: 'User already exists with this email or phone number' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Normalize role
    const normalizedRole = role.toUpperCase();

    // Create user with transaction
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
          route: route || "Kilimani",
          route_id_update: 1, // hardcoded default value
          route_name_update: "Kilimani", // hardcoded default value
          visits_targets: 0, // hardcoded default value
          new_clients: 0, // hardcoded default value
          manager_type: 0, // hardcoded default value
          retail_manager: 0, // hardcoded default value
          key_channel_manager: 0, // hardcoded default value
          distribution_manager: 0, // hardcoded default value
        },
        include: {
          countryRelation: true
        }
      });

      // If role is MANAGER, create manager record
      if (normalizedRole === 'MANAGER') {
        await tx.Manager.create({
          data: {
            userId: salesRep.id,
            department
          }
        });
      }

      // Generate access token (short-lived - 8 hours)
      const accessToken = jwt.sign(
        { userId: salesRep.id, role: salesRep.role, type: 'access' },
        process.env.JWT_SECRET,
        { expiresIn: '8h' }
      );

      // Generate refresh token (long-lived - 7 days)
      const refreshToken = jwt.sign(
        { userId: salesRep.id, role: salesRep.role, type: 'refresh' },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      // Store both tokens
      await tx.token.create({
        data: {
          token: accessToken,
          salesRepId: salesRep.id,
          tokenType: 'access',
          expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000) // 8 hours
        }
      });

      await tx.token.create({
        data: {
          token: refreshToken,
          salesRepId: salesRep.id,
          tokenType: 'refresh',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
        }
      });
      
      return { salesRep, accessToken, refreshToken };
    });

    res.status(201).json({
      message: 'Registration successful',
      salesRep: result.salesRep,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Failed to register user', error: error.message });
  }
};

const login = async (req, res) => {
  try {
    const { phoneNumber, password } = req.body;

    console.log('Login attempt for phoneNumber:', phoneNumber);

    // Step 1: Find the user outside of a transaction
    const salesRep = await prisma.salesRep.findFirst({
      where: { phoneNumber },
      include: {
        countryRelation: true
      }
    });

    console.log('SalesRep found:', salesRep ? 'Yes' : 'No');

    if (!salesRep) {
      return res.status(401).json({ success: false, message: 'Invalid phone number or password' });
    }

    // Step 2: Check if account is deactivated
    if (salesRep.status === 1) {
      return res.status(403).json({ success: false, message: 'Account deactivated. Please contact administrator.' });
    }

    // Step 3: Validate password
    const isPasswordValid = await bcrypt.compare(password, salesRep.password);
    console.log('Password valid:', isPasswordValid ? 'Yes' : 'No');

    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: 'Invalid phone number or password' });
    }

    // Step 4: Use a transaction only for creating tokens
    const { accessToken, refreshToken } = await prisma.$transaction(async (tx) => {
      // Generate access token (short-lived - 8 hours)
      const accessTokenPayload = {
        userId: salesRep.id,
        role: salesRep.role,
        type: 'access'
      };
      
      const accessToken = jwt.sign(accessTokenPayload, process.env.JWT_SECRET, { expiresIn: '8h' });
      console.log('Access token generated successfully');

      // Generate refresh token (long-lived - 7 days)
      const refreshTokenPayload = {
        userId: salesRep.id,
        role: salesRep.role,
        type: 'refresh'
      };
      
      const refreshToken = jwt.sign(refreshTokenPayload, process.env.JWT_SECRET, { expiresIn: '7d' });
      console.log('Refresh token generated successfully');

      // Store both tokens in database
      await tx.token.create({
        data: {
          token: accessToken,
          salesRepId: salesRep.id,
          tokenType: 'access',
          expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000) // 8 hours
        }
      });

      await tx.token.create({
        data: {
          token: refreshToken,
          salesRepId: salesRep.id,
          tokenType: 'refresh',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
        }
      });

      console.log('Tokens stored in database');

      return { accessToken, refreshToken };
    });

    // Return user and tokens
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
        country: salesRep.countryRelation
      },
      accessToken,
      refreshToken,
      expiresIn: 8 * 60 * 60 // 8 hours in seconds
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
        success: false, 
        message: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const logout = async (req, res) => {
  try {
    // Blacklist all tokens (both access and refresh) for the current user in a single operation
    const result = await prisma.token.updateMany({
      where: { 
        salesRepId: req.user.id,
        blacklisted: false
      },
      data: { 
        blacklisted: true 
      }
    });

    console.log(`Blacklisted ${result.count} tokens for user ${req.user.id}`);

    res.json({ 
      success: true,
      message: 'Logged out successfully' 
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Logout failed' 
    });
  }
};

const refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(401).json({ 
        success: false,
        error: 'Refresh token required' 
      });
    }

    // Use a single transaction for all database operations
    const result = await prisma.$transaction(async (tx) => {
      try {
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
            countryRelation: true
          }
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
              gt: new Date()
            }
          }
        });

        // If refresh token is invalid or expired, generate new tokens
        if (!refreshTokenRecord) {
          console.log('Refresh token invalid or expired, generating new tokens for user:', user.id);
          
          // Blacklist the old refresh token if it exists
          await tx.token.updateMany({
            where: {
              token: refreshToken,
              salesRepId: decoded.userId,
              tokenType: 'refresh'
            },
            data: { blacklisted: true }
          });

          // Generate new refresh token
          const newRefreshToken = jwt.sign(
            { 
              userId: user.id, 
              role: user.role,
              type: 'refresh'
            },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
          );

          // Store new refresh token
          await tx.token.create({
            data: {
              token: newRefreshToken,
              salesRepId: user.id,
              tokenType: 'refresh',
              expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
              blacklisted: false
            }
          });

          // Generate new access token
          const newAccessToken = jwt.sign(
            { 
              userId: user.id, 
              role: user.role,
              type: 'access'
            },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
          );

          // Store new access token
          await tx.token.create({
            data: {
              token: newAccessToken,
              salesRepId: user.id,
              tokenType: 'access',
              expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000), // 8 hours
              blacklisted: false
            }
          });

          return {
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
            user: user,
            tokensRegenerated: true
          };
        }

        // Original flow - refresh token is valid
        // Generate new access token
        const newAccessToken = jwt.sign(
          { 
            userId: user.id, 
            role: user.role,
            type: 'access'
          },
          process.env.JWT_SECRET,
          { expiresIn: '8h' }
        );

        // Calculate expiration time
        const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8 hours from now

        // Store new access token in database
        await tx.token.create({
          data: {
            token: newAccessToken,
            salesRepId: user.id,
            tokenType: 'access',
            expiresAt: expiresAt,
            blacklisted: false
          }
        });

        // Update refresh token last used
        await tx.token.update({
          where: { id: refreshTokenRecord.id },
          data: { lastUsedAt: new Date() }
        });

        return {
          accessToken: newAccessToken,
          refreshToken: refreshToken, // Return the same refresh token
          user: user,
          tokensRegenerated: false
        };
      } catch (error) {
        console.error('Token refresh error:', error);
        throw new Error('Invalid refresh token');
      }
    });

    res.json({
      success: true,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: 8 * 60 * 60, // 8 hours in seconds
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
        country: result.user.countryRelation
      }
    });
  } catch (error) {
    console.error('Server error during refresh:', error);
    
    if (error.message === 'Invalid token type') {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid token type' 
      });
    }
    
    if (error.message === 'User not found') {
      return res.status(401).json({ 
        success: false,
        error: 'User not found' 
      });
    }
    
    if (error.message === 'Invalid refresh token') {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid refresh token' 
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: 'Server error' 
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
    const userUpliftSales = await prisma.upliftSale.findMany({ where: { userId }, select: { id: true } });
    const upliftSaleIds = userUpliftSales.map(u => u.id);
    if (upliftSaleIds.length > 0) {
      await prisma.upliftSaleItem.deleteMany({ where: { upliftSaleId: { in: upliftSaleIds } } });
    }
    await prisma.upliftSale.deleteMany({ where: { userId } });

    // 2. ProductReturnItem -> ProductReturn
    const userProductReturns = await prisma.productReturn.findMany({ where: { userId }, select: { id: true } });
    const productReturnIds = userProductReturns.map(p => p.id);
    if (productReturnIds.length > 0) {
      await prisma.productReturnItem.deleteMany({ where: { productReturnId: { in: productReturnIds } } });
    }
    await prisma.productReturn.deleteMany({ where: { userId } });

    // 3. ProductsSampleItem -> ProductsSample
    const userProductsSamples = await prisma.productsSample.findMany({ where: { userId }, select: { id: true } });
    const productsSampleIds = userProductsSamples.map(p => p.id);
    if (productsSampleIds.length > 0) {
      await prisma.productsSampleItem.deleteMany({ where: { productsSampleId: { in: productsSampleIds } } });
    }
    await prisma.productsSample.deleteMany({ where: { userId } });

    // 4. OrderItem -> MyOrder
    const userOrders = await prisma.myOrder.findMany({ where: { userId }, select: { id: true } });
    const orderIds = userOrders.map(o => o.id);
    if (orderIds.length > 0) {
      await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    }
    await prisma.myOrder.deleteMany({ where: { userId } });

    // 5. FeedbackReport, ProductReport, VisibilityReport -> Report
    const userReports = await prisma.report.findMany({ where: { userId }, select: { id: true } });
    const reportIds = userReports.map(r => r.id);
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
  delete: deleteAccount
};