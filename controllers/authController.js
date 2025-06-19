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

      // Generate token
      const token = jwt.sign(
        { userId: salesRep.id, role: salesRep.role },
        process.env.JWT_SECRET,
        { expiresIn: '9h' }
      );

      // Store token
      await tx.token.create({
        data: {
          token,
          user: {
            connect: { id: salesRep.id }
          },
          expiresAt: new Date(Date.now() + 9 * 60 * 60 * 1000) // 9 hours
        }
      });
      
      return { salesRep, token };
    });

    res.status(201).json({
      message: 'Registration successful',
      salesRep: result.salesRep,
      token: result.token
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

    // Generate JWT token
    const tokenPayload = {
      userId: salesRep.id,
      role: salesRep.role
    };
    console.log('Token payload:', tokenPayload);
    
    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '9h' });
    console.log('Token generated successfully');

    // Store token in database
    await prisma.token.create({
      data: {
        token,
        user: {
          connect: { id: salesRep.id }
        },
        expiresAt: new Date(Date.now() + 9 * 60 * 60 * 1000) // 9 hours
      }
    });
        console.log('Token stored in database');

    // Return user and token with role
    res.json({
      success: true,
      salesRep: {
        id: salesRep.id,
        name: salesRep.name,
        phoneNumber: salesRep.phoneNumber,
        role: salesRep.role,
        email: salesRep.email,
        photoUrl: salesRep.photoUrl,
        // department: salesRep.Manager?.department,
        region: salesRep.region,
        region_id: salesRep.region_id,
        route_id: salesRep.route_id,
        countryId: salesRep.countryId,
        country: salesRep.countryRelation
      },
      token
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
    await prisma.token.deleteMany({
      where: { token: req.token },
    });
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Logout failed' });
  }
};

const refresh = async (req, res) => {
  try {
    const oldToken = req.headers.authorization?.replace('Bearer ', '');
    
    if (!oldToken) {
      return res.status(401).json({ error: 'No token provided' });
    }

    try {
      // Verify the old token
      const decoded = jwt.verify(oldToken, process.env.JWT_SECRET);
      
      // Get user from database
      const user = await prisma.salesRep.findUnique({
        where: { id: decoded.userId },
        include: {
          Manager: true,
          country: true
        }
      });

      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      // Generate new token
      const newToken = jwt.sign(
        { userId: user.id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '9h' }
      );

      // Calculate expiration time
      const expiresAt = new Date(Date.now() + 9 * 60 * 60 * 1000); // 9 hours from now

      // Store new token in database
      await prisma.token.create({
        data: {
          token: newToken,
          salesRepId: user.id,
          expiresAt: expiresAt,
          blacklisted: false
        }
      });

      // Blacklist old token instead of deleting it
      await prisma.token.updateMany({
        where: { token: oldToken },
        data: { blacklisted: true }
      });

      res.json({
        success: true,
        token: newToken,
        expiresAt: expiresAt
      });
    } catch (error) {
      console.error('Token refresh error:', error);
      return res.status(401).json({ error: 'Invalid token' });
    }
  } catch (error) {
    console.error('Server error during refresh:', error);
    res.status(500).json({ error: 'Server error' });
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