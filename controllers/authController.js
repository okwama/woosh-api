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

    // Create user with transaction
    const result = await prisma.$transaction(async (prisma) => {
      // Create the user
      const salesRep = await prisma.salesRep.create({
        data: {
          name,
          email,
          phoneNumber,
          password: hashedPassword,
          countryId,
          region_id,
          region,
          role, // Use the role from request
          createdAt: new Date(),  // Explicitly set
          updatedAt: new Date(),   // Explicitly set
        },
        include: {
          country: true
        }
      });

      // If role is MANAGER, create manager record
      if (role === 'MANAGER') {
        await prisma.manager.create({
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
      await prisma.token.create({
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
      where: { phoneNumber },
      include: {
        Manager: true,
        country: true
      }
    });

    console.log('SalesRep found:', salesRep ? 'Yes' : 'No');

    if (!salesRep) {
      return res.status(401).json({
        success: false,
        error: 'Invalid phone number or password'
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
        department: salesRep.Manager?.department,
        region: salesRep.region,
        region_id: salesRep.region_id,
        countryId: salesRep.countryId,
        country: salesRep.country
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

      // Store new token in database
      await prisma.token.create({
        data: {
          token: newToken,
          user: {
            connect: { id: user.id }
          },
          expiresAt: new Date(Date.now() + 9 * 60 * 60 * 1000) // 9 hours
        }
      });

      // Delete old token
      await prisma.token.deleteMany({
        where: { token: oldToken }
      });

      res.json({
        success: true,
        token: newToken
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

module.exports = { 
  register, 
  login, 
  logout,
  refresh 
};