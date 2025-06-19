const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

// Main authentication middleware
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    // Verify the token first
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({ 
          error: 'Session expired. Please log in again.',
          code: 'TOKEN_EXPIRED'
        });
      }
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Try to check token in database, but don't fail if DB is unavailable
    let tokenRecord = null;
    let shouldRefresh = false;
    
    try {
      // Check if token exists in database and is not expired
      tokenRecord = await prisma.token.findFirst({
        where: {
          token: token,
          salesRepId: decoded.userId,
          expiresAt: {
            gt: new Date()
          }
        }
      });

      // Check if token needs rotation (every 4 hours)
      if (tokenRecord) {
        const tokenAge = Date.now() - tokenRecord.createdAt.getTime();
        const fourHours = 4 * 60 * 60 * 1000;
        shouldRefresh = tokenAge > fourHours;
      }
    } catch (dbError) {
      console.warn('Database connection issue during token validation:', dbError.message);
      // Continue with JWT-only validation if DB is unavailable
      shouldRefresh = false;
    }

    // Generate new token if needed
    if (shouldRefresh && tokenRecord) {
      try {
        const newToken = jwt.sign(
          { userId: decoded.userId, role: decoded.role },
          process.env.JWT_SECRET,
          { expiresIn: '9h' }
        );

        // Store new token
        await prisma.token.create({
          data: {
            token: newToken,
            salesRepId: decoded.userId,
            expiresAt: new Date(Date.now() + 9 * 60 * 60 * 1000)
          }
        });

        // Update old token to expired instead of blacklisting
        await prisma.token.update({
          where: { id: tokenRecord.id },
          data: { 
            expiresAt: new Date() // Set to current time to expire it
          }
        });

        // Set new token in response header
        res.setHeader('X-New-Token', newToken);
      } catch (refreshError) {
        console.warn('Token refresh failed:', refreshError.message);
        // Continue with existing token if refresh fails
      }
    }

    // Get user details
    let user;
    try {
      user = await prisma.salesRep.findUnique({
        where: { id: decoded.userId },
        include: {
          Manager: true
        }
      });
    } catch (userError) {
      console.warn('Failed to fetch user details:', userError.message);
      // If we can't fetch user details, still allow the request
      // but set minimal user info from JWT
      user = {
        id: decoded.userId,
        role: decoded.role
      };
    }

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Update last used timestamp if we have a token record
    if (tokenRecord) {
      try {
        await prisma.token.update({
          where: { id: tokenRecord.id },
          data: { lastUsedAt: new Date() }
        });
      } catch (updateError) {
        console.warn('Failed to update token last used:', updateError.message);
      }
    }

    // Set security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Function to create a manager if the role is 'manager'
const createManagerIfNeeded = async (userId, role, managerDetails) => {
  if (role === 'MANAGER') {
    try {
      await prisma.manager.create({
        data: {
          userId: userId,
          email: managerDetails.email,
          password: managerDetails.password,
          department: managerDetails.department,
        },
      });
      console.log('Manager created successfully');
    } catch (error) {
      console.error('Error creating manager:', error);
      throw new Error('Failed to create manager');
    }
  }
};

// Function to create a user and update the manager table if necessary
const createUser = async (req, res) => {
  const { name, email, phoneNumber, password, role, managerDetails } = req.body;

  try {
    // Create the user first
    const user = await prisma.salesRep.create({
      data: {
        name,
        email,
        phoneNumber,
        password, // Ensure you hash the password before saving it
        role,
      },
    });

    // Call the function to create manager if role is manager
    await createManagerIfNeeded(user.id, role, managerDetails);

    // Respond with the created user
    res.status(201).json(user);
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
};

// Export all functions
module.exports = {
  authenticateToken,
  auth: authenticateToken, // Alias for backward compatibility
  protect: authenticateToken, // Add protect middleware
  createUser,
  createManagerIfNeeded
};