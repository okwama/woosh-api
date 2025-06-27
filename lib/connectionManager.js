const prisma = require('./prisma');

// Connection pool manager for Prisma 5.0.0+
class ConnectionManager {
  constructor() {
    this.connectionRetries = 0;
    this.maxRetries = 3;
    this.retryDelay = 1000;
    this.lastResetTime = 0;
    this.resetCooldown = 30000; // 30 seconds cooldown between resets
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
          error.message.includes('Transaction already closed') ||
          error.message.includes('Lock wait timeout') ||
          error.code === 'P1001' || // Connection error
          error.code === 'P1008' || // Connection timeout
          error.code === 'P1017';   // Connection closed

        if (attempt === this.maxRetries || !isConnectionError) {
          throw error;
        }

        console.warn(`Connection attempt ${attempt} failed for ${context}, retrying in ${this.retryDelay}ms:`, error.message);
        
        // If it's a connection pool timeout, try to reset the pool
        if (error.message.includes('Timed out fetching a new connection') && 
            Date.now() - this.lastResetTime > this.resetCooldown) {
          console.warn('Connection pool timeout detected, attempting pool reset...');
          await this.resetPool();
          this.lastResetTime = Date.now();
        }
        
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
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      await prisma.$connect();
      console.log('Connection pool reset successful');
      return true;
    } catch (error) {
      console.error('Failed to reset connection pool:', error);
      return false;
    }
  }

  // Execute with connection pool monitoring
  async executeWithMonitoring(operation, context = '') {
    const startTime = Date.now();
    try {
      const result = await this.executeWithRetry(operation, context);
      const duration = Date.now() - startTime;
      
      // Log slow operations
      if (duration > 5000) {
        console.warn(`Slow operation (${duration}ms): ${context}`);
      }
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`Operation failed after ${duration}ms: ${context}`, error.message);
      throw error;
    }
  }
}

// Global connection manager instance
const connectionManager = new ConnectionManager();

// Wrapper functions for common operations
const withConnectionRetry = async (operation, context = '') => {
  return await connectionManager.executeWithRetry(operation, context);
};

// Enhanced wrapper with monitoring
const withConnectionMonitoring = async (operation, context = '') => {
  return await connectionManager.executeWithMonitoring(operation, context);
};

// Health check endpoint helper
const checkDatabaseHealth = async () => {
  return await connectionManager.getPoolStatus();
};

module.exports = {
  connectionManager,
  withConnectionRetry,
  withConnectionMonitoring,
  checkDatabaseHealth
}; 