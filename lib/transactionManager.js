const prisma = require('./prisma');

class TransactionManager {
  constructor() {
    this.defaultTimeout = 15000; // 15 seconds default
    this.maxRetries = 3;
    this.baseDelay = 100;
  }

  /**
   * Execute operation with enhanced transaction management
   * @param {Function} operation - The operation to execute
   * @param {Object} options - Transaction options
   * @param {number} options.timeout - Transaction timeout in ms
   * @param {number} options.maxRetries - Maximum retry attempts
   * @param {string} options.context - Context for logging
   * @param {boolean} options.retryOnTimeout - Whether to retry on timeout
   */
  async executeWithTransaction(operation, options = {}) {
    const {
      timeout = this.defaultTimeout,
      maxRetries = this.maxRetries,
      context = 'transaction',
      retryOnTimeout = true
    } = options;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      let transaction = null;
      
      try {
        console.log(`🔄 [${context}] Starting transaction attempt ${attempt}/${maxRetries}`);
        
        // Create transaction with timeout
        transaction = await prisma.$transaction(
          async (tx) => {
            // Execute the operation
            const result = await operation(tx);
            
            // Add a small delay to ensure transaction completes properly
            await new Promise(resolve => setTimeout(resolve, 50));
            
            return result;
          },
          {
            maxWait: Math.min(timeout * 0.3, 5000), // 30% of timeout, max 5s
            timeout: timeout,
          }
        );

        console.log(`✅ [${context}] Transaction completed successfully on attempt ${attempt}`);
        return transaction;

      } catch (error) {
        console.error(`❌ [${context}] Transaction attempt ${attempt} failed:`, error.message);
        
        // Determine if we should retry
        const shouldRetry = this._shouldRetry(error, attempt, maxRetries, retryOnTimeout);
        
        if (!shouldRetry) {
          console.error(`💥 [${context}] Transaction failed permanently after ${attempt} attempts`);
          throw error;
        }

        // Calculate delay with exponential backoff and jitter
        const delay = this._calculateDelay(attempt);
        console.log(`⏳ [${context}] Retrying in ${Math.round(delay)}ms...`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Execute operation with automatic rollback on error
   */
  async executeWithRollback(operation, options = {}) {
    const {
      timeout = this.defaultTimeout,
      context = 'transaction-with-rollback'
    } = options;

    try {
      return await this.executeWithTransaction(operation, {
        timeout,
        context,
        retryOnTimeout: false // Don't retry for rollback operations
      });
    } catch (error) {
      console.error(`🔄 [${context}] Rolling back transaction due to error:`, error.message);
      
      // Attempt to rollback any pending changes
      try {
        await prisma.$executeRaw`ROLLBACK`;
      } catch (rollbackError) {
        console.warn(`⚠️ [${context}] Rollback failed:`, rollbackError.message);
      }
      
      throw error;
    }
  }

  /**
   * Execute multiple operations in a single transaction
   */
  async executeBatch(operations, options = {}) {
    const {
      timeout = this.defaultTimeout * 2, // Double timeout for batch operations
      context = 'batch-transaction'
    } = options;

    return await this.executeWithTransaction(async (tx) => {
      const results = [];
      
      for (let i = 0; i < operations.length; i++) {
        const operation = operations[i];
        console.log(`📦 [${context}] Executing operation ${i + 1}/${operations.length}`);
        
        try {
          const result = await operation(tx);
          results.push({ success: true, index: i, result });
        } catch (error) {
          console.error(`❌ [${context}] Operation ${i + 1} failed:`, error.message);
          results.push({ success: false, index: i, error: error.message });
          
          // Continue with other operations unless it's critical
          if (options.failFast) {
            throw error;
          }
        }
      }
      
      return results;
    }, { timeout, context });
  }

  /**
   * Execute operation with connection retry
   */
  async executeWithConnectionRetry(operation, options = {}) {
    const {
      maxConnectionRetries = 3,
      context = 'connection-retry'
    } = options;

    for (let attempt = 1; attempt <= maxConnectionRetries; attempt++) {
      try {
        return await this.executeWithTransaction(operation, options);
      } catch (error) {
        const isConnectionError = this._isConnectionError(error);
        
        if (attempt === maxConnectionRetries || !isConnectionError) {
          throw error;
        }

        console.warn(`🔌 [${context}] Connection error on attempt ${attempt}, retrying...`);
        
        // Wait before retry
        const delay = this._calculateDelay(attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Determine if error should trigger a retry
   */
  _shouldRetry(error, attempt, maxRetries, retryOnTimeout) {
    if (attempt >= maxRetries) return false;

    const errorMessage = error.message.toLowerCase();
    
    // Always retry for these errors
    const retryableErrors = [
      'lock wait timeout',
      'deadlock found',
      'connection pool',
      'timed out fetching',
      'econnreset',
      'enotfound',
      'transaction already closed',
      'p1001', // Connection error
      'p1008', // Connection timeout
      'p1017', // Connection closed
      'p2028', // Transaction timeout
    ];

    const isRetryable = retryableErrors.some(err => 
      errorMessage.includes(err) || error.code === err
    );

    // For timeout errors, only retry if explicitly allowed
    if (errorMessage.includes('timeout') && !retryOnTimeout) {
      return false;
    }

    return isRetryable;
  }

  /**
   * Check if error is a connection error
   */
  _isConnectionError(error) {
    const errorMessage = error.message.toLowerCase();
    return errorMessage.includes('connection') ||
           errorMessage.includes('econnreset') ||
           errorMessage.includes('enotfound') ||
           error.code === 'P1001' ||
           error.code === 'P1008' ||
           error.code === 'P1017';
  }

  /**
   * Calculate delay with exponential backoff and jitter
   */
  _calculateDelay(attempt) {
    const exponentialDelay = this.baseDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 100;
    return Math.min(exponentialDelay + jitter, 5000); // Max 5 seconds
  }

  /**
   * Health check for transaction system
   */
  async healthCheck() {
    try {
      const result = await this.executeWithTransaction(
        async (tx) => {
          return await tx.$queryRaw`SELECT 1 as health_check`;
        },
        { timeout: 5000, context: 'health-check' }
      );
      
      return {
        status: 'healthy',
        message: 'Transaction system is working properly',
        result
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: 'Transaction system has issues',
        error: error.message
      };
    }
  }
}

// Create singleton instance
const transactionManager = new TransactionManager();

// Export convenience functions
const withTransaction = (operation, options = {}) => {
  return transactionManager.executeWithTransaction(operation, options);
};

const withRollback = (operation, options = {}) => {
  return transactionManager.executeWithRollback(operation, options);
};

const withBatchTransaction = (operations, options = {}) => {
  return transactionManager.executeBatch(operations, options);
};

const withConnectionRetry = (operation, options = {}) => {
  return transactionManager.executeWithConnectionRetry(operation, options);
};

module.exports = {
  TransactionManager,
  transactionManager,
  withTransaction,
  withRollback,
  withBatchTransaction,
  withConnectionRetry,
}; 