const { hasRole } = require('./roleAuth');

// Export the middleware directly
module.exports = { isAdmin: hasRole('ADMIN') }; 