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

      // Generate access token (short-lived - 15 minutes)
      const accessToken = jwt.sign(
        { userId: salesRep.id, role: salesRep.role, type: 'access' },
        process.env.JWT_SECRET,
        { expiresIn: '15m' }
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
          expiresAt: new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
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

    // Check if user exists
    const salesRep = await prisma.salesRep.findFirst({
      where: { phoneNumber }
    });

    console.log('SalesRep found:', salesRep ? 'Yes' : 'No');

    if (!salesRep) {
      return res.status(401).json({
        success: false,
        error: 'Invalid phone number or password'
      });
    }

    // Check if account is deactivated
    if (salesRep.status === 1) {
      return res.status(403).json({
        success: false,
        error: 'Account deactivated. Please contact administrator.'
      });
    }

    const isPasswordValid = await bcrypt.compare(password, salesRep.password);
    console.log('Password valid:', isPasswordValid ? 'Yes' : 'No');

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid phone number or password'
      });
    }

    // Generate access token (short-lived - 15 minutes)
    const accessTokenPayload = {
      userId: salesRep.id,
      role: salesRep.role,
      type: 'access'
    };
    
    const accessToken = jwt.sign(accessTokenPayload, process.env.JWT_SECRET, { expiresIn: '15m' });
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
    await prisma.$transaction(async (tx) => {
      // Store access token
      await tx.token.create({
        data: {
          token: accessToken,
          salesRepId: salesRep.id,
          tokenType: 'access',
          expiresAt: new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
        }
      });

      // Store refresh token
      await tx.token.create({
        data: {
          token: refreshToken,
          salesRepId: salesRep.id,
          tokenType: 'refresh',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
        }
      });
    });

    console.log('Tokens stored in database');

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
      expiresIn: 15 * 60 // 15 minutes in seconds
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed',
      details: error.message
    });
  }
};

const logout = async (req, res) => {
  try {
    // Blacklist all tokens (both access and refresh) for the current user
    await prisma.token.updateMany({
      where: { 
        salesRepId: req.user.id,
        blacklisted: false
      },
      data: { 
        blacklisted: true 
      }
    });

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

    try {
      // Verify the refresh token
      const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
      
      // Check if it's actually a refresh token
      if (decoded.type !== 'refresh') {
        return res.status(401).json({ 
          success: false,
          error: 'Invalid token type' 
        });
      }
      
      // Get user from database
      const user = await prisma.salesRep.findUnique({
        where: { id: decoded.userId },
        include: {
          Manager: true,
          countryRelation: true
        }
      });

      if (!user) {
        return res.status(401).json({ 
          success: false,
          error: 'User not found' 
        });
      }

      // Check if refresh token exists and is not blacklisted
      const refreshTokenRecord = await prisma.token.findFirst({
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

      if (!refreshTokenRecord) {
        return res.status(401).json({ 
          success: false,
          error: 'Invalid or expired refresh token' 
        });
      }

      // Generate new access token
      const newAccessToken = jwt.sign(
        { 
          userId: user.id, 
          role: user.role,
          type: 'access'
        },
        process.env.JWT_SECRET,
        { expiresIn: '15m' }
      );

      // Calculate expiration time
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now

      // Store new access token in database
      await prisma.token.create({
        data: {
          token: newAccessToken,
          salesRepId: user.id,
          tokenType: 'access',
          expiresAt: expiresAt,
          blacklisted: false
        }
      });

      // Update refresh token last used
      await prisma.token.update({
        where: { id: refreshTokenRecord.id },
        data: { lastUsedAt: new Date() }
      });

      res.json({
        success: true,
        accessToken: newAccessToken,
        expiresIn: 15 * 60, // 15 minutes in seconds
        user: {
          id: user.id,
          name: user.name,
          phoneNumber: user.phoneNumber,
          role: user.role,
          email: user.email,
          photoUrl: user.photoUrl,
          region: user.region,
          region_id: user.region_id,
          route_id: user.route_id,
          countryId: user.countryId,
          country: user.countryRelation
        }
      });
    } catch (error) {
      console.error('Token refresh error:', error);
      return res.status(401).json({ 
        success: false,
        error: 'Invalid refresh token' 
      });
    }
  } catch (error) {
    console.error('Server error during refresh:', error);
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