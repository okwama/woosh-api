const prisma = require('./prisma');

// Connection pool manager for Prisma 5.0.0+
class ConnectionManager {
  constructor() {
    this.connectionRetries = 0;
    this.maxRetries = 3;
    this.retryDelay = 1000;
  }

  // Execute operation with connection retry logic
  async executeWithRetry(operation, context = '') {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        const isConnectionError = 
          error.message.includes('connection pool') ||
          error.message.includes('Timed out fetching a new connection') ||
          error.message.includes('ECONNRESET') ||
          error.message.includes('ENOTFOUND') ||
          error.message.includes('P2028') || // Transaction timeout
          error.message.includes('Transaction already closed');

        if (attempt === this.maxRetries || !isConnectionError) {
          throw error;
        }

        console.warn(`Connection attempt ${attempt} failed for ${context}, retrying in ${this.retryDelay}ms:`, error.message);
        
        // Exponential backoff
        const waitTime = this.retryDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  // Get connection pool status
  async getPoolStatus() {
    try {
      // Simple query to test connection
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'healthy', message: 'Connection pool is working' };
    } catch (error) {
      return { 
        status: 'unhealthy', 
        message: error.message,
        error: error 
      };
    }
  }

  // Force connection pool reset (use with caution)
  async resetPool() {
    try {
      console.log('Resetting connection pool...');
      await prisma.$disconnect();
      await prisma.$connect();
      console.log('Connection pool reset successful');
      return true;
    } catch (error) {
      console.error('Failed to reset connection pool:', error);
      return false;
    }
  }
}

// Global connection manager instance
const connectionManager = new ConnectionManager();

// Wrapper functions for common operations
const withConnectionRetry = async (operation, context = '') => {
  return await connectionManager.executeWithRetry(operation, context);
};

// Health check endpoint helper
const checkDatabaseHealth = async () => {
  return await connectionManager.getPoolStatus();
};

module.exports = {
  connectionManager,
  withConnectionRetry,
  checkDatabaseHealth
}; 