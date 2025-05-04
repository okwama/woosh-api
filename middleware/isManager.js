const { hasRole } = require('./roleAuth');

// Export the middleware directly
module.exports = { isManager: hasRole('MANAGER') }; 