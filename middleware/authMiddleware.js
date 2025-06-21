const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

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

    // Store both tokens in database
    await prisma.token.create({
      data: {
        token: newAccessToken,
        salesRepId: userId,
        tokenType: 'access',
        expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000), // 8 hours
        blacklisted: false
      }
    });

    await prisma.token.create({
      data: {
        token: newRefreshToken,
        salesRepId: userId,
        tokenType: 'refresh',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        blacklisted: false
      }
    });

    return { newAccessToken, newRefreshToken };
  } catch (error) {
    console.error('Error generating new tokens:', error);
    throw error;
  }
};

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
      
      // Check if it's an access token
      if (decoded.type !== 'access') {
        return res.status(401).json({ 
          error: 'Invalid token type. Access token required.',
          code: 'INVALID_TOKEN_TYPE'
        });
      }
    } catch (jwtError) {
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

        // Blacklist the old token
        await prisma.token.updateMany({
          where: {
            token: token,
            salesRepId: decoded.userId,
            tokenType: 'access'
          },
          data: { blacklisted: true }
        });

        // Generate new tokens
        const { newAccessToken, newRefreshToken } = await generateNewTokens(decoded.userId, user.role);

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

    // Get user details
    let user;
    try {
      user = await prisma.salesRep.findUnique({
        where: { id: decoded.userId },
        include: {
          Manager: true,
          countryRelation: true
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

    // Update last used timestamp if we have a token record and database is available
    if (tokenRecord && dbAvailable) {
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
    req.tokensRefreshed = false;
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

// Response middleware to handle token refresh notifications
const handleTokenRefresh = (req, res, next) => {
  // Store the original send function
  const originalSend = res.send;
  
  // Override the send function
  res.send = function(data) {
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
        res.setHeader('X-Token-Refreshed', 'true');
        
        // Call the original send with modified data
        return originalSend.call(this, JSON.stringify(responseData));
      } catch (parseError) {
        // If we can't parse the response, just add headers
        res.setHeader('X-Token-Refreshed', 'true');
        res.setHeader('X-New-Access-Token', req.newTokens.accessToken);
        res.setHeader('X-New-Refresh-Token', req.newTokens.refreshToken);
        
        return originalSend.call(this, data);
      }
    }
    
    // Call the original send function
    return originalSend.call(this, data);
  };
  
  next();
};

// Export all functions
module.exports = {
  authenticateToken,
  auth: authenticateToken, // Alias for backward compatibility
  protect: authenticateToken, // Add protect middleware
  handleTokenRefresh, // Add the new middleware
  createUser,
  createManagerIfNeeded
};