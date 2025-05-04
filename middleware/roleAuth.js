const { getPrismaClient } = require('../lib/prisma');
const prisma = getPrismaClient();

/**
 * Role-based authorization middleware
 * @param {string|string[]} roles - A single role or array of roles that are allowed to access the route
 * @returns {Function} Express middleware function
 */
exports.hasRole = (roles) => {
  // Convert single role to array for consistent handling
  const allowedRoles = Array.isArray(roles) ? roles : [roles];
  
  return async (req, res, next) => {
    try {
      // Check if user exists in request (auth middleware should have set this)
      if (!req.user || !req.user.id) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      // Get fresh user data with role information
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { role: true }
      });
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Check if user's role is in the allowed roles (case insensitive)
      const userRole = user.role.toUpperCase();
      const hasPermission = allowedRoles.some(role => role.toUpperCase() === userRole);
      
      if (!hasPermission) {
        return res.status(403).json({ 
          error: 'Access denied',
          message: `This action requires ${allowedRoles.length > 1 
            ? `one of these roles: ${allowedRoles.join(', ')}` 
            : `${allowedRoles[0]} role`}`
        });
      }
      
      // User has permission, proceed to the next middleware or route handler
      next();
    } catch (error) {
      console.error('Error in role authorization middleware:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
};

/**
 * Check if user is at least the specified role in hierarchy
 * Role hierarchy: ADMIN > MANAGER > USER
 * @param {string} minimumRole - Minimum role required
 * @returns {Function} Express middleware function
 */
exports.atLeastRole = (minimumRole) => {
  const roleHierarchy = {
    'ADMIN': 3,
    'MANAGER': 2,
    'USER': 1
  };
  
  const minimumRoleLevel = roleHierarchy[minimumRole.toUpperCase()] || 1;
  
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { role: true }
      });
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      const userRoleLevel = roleHierarchy[user.role.toUpperCase()] || 0;
      
      if (userRoleLevel < minimumRoleLevel) {
        return res.status(403).json({ 
          error: 'Insufficient permissions',
          message: `This action requires at least ${minimumRole} role`
        });
      }
      
      next();
    } catch (error) {
      console.error('Error in role authorization middleware:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
};

/**
 * Allow any authenticated user (regardless of role)
 */
exports.anyUser = async (req, res, next) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // If we have a user object, they're authenticated, so allow them through
  next();
};

/**
 * Admin-only middleware (convenience method)
 */
exports.isAdmin = exports.hasRole('ADMIN');

/**
 * Manager-only middleware (convenience method)
 */
exports.isManager = exports.hasRole('MANAGER');

/**
 * Standard user middleware (convenience method)
 */
exports.isUser = exports.hasRole('USER'); 