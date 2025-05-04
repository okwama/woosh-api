const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    // Check if token is blacklisted
    const blacklistedToken = await prisma.token.findFirst({
      where: {
        token: token,
        blacklisted: true
      }
    });

    if (blacklistedToken) {
      return res.status(401).json({ error: 'Token has been invalidated' });
    }

    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if token exists in database and is not expired
    const tokenRecord = await prisma.token.findFirst({
      where: {
        token: token,
        salesRepId: decoded.userId,
        expiresAt: {
          gt: new Date()
        }
      }
    });

    if (!tokenRecord) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Check if token needs rotation (every 4 hours)
    const tokenAge = Date.now() - tokenRecord.createdAt.getTime();
    const fourHours = 4 * 60 * 60 * 1000;
    
    if (tokenAge > fourHours) {
      // Generate new token
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

      // Blacklist old token
      await prisma.token.update({
        where: { id: tokenRecord.id },
        data: { blacklisted: true }
      });

      // Set new token in response header
      res.setHeader('X-New-Token', newToken);
    }

    // Get user details
    const user = await prisma.salesRep.findUnique({
      where: { id: decoded.userId },
      include: {
        Manager: true
      }
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Update last used timestamp
    await prisma.token.update({
      where: { id: tokenRecord.id },
      data: { lastUsedAt: new Date() }
    });

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
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = { authenticateToken };