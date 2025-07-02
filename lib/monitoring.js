const { redisService } = require('./redisService');

class TokenMonitoring {
  constructor() {
    this.metrics = {
      loginAttempts: new Map(),
      tokenOperations: {
        created: 0,
        invalidated: 0,
        cleaned: 0,
      },
      cleanupStats: {
        lastRun: null,
        tokensDeleted: 0,
        duration: 0,
      },
      errors: {
        loginFailures: 0,
        tokenValidationFailures: 0,
        redisErrors: 0,
        databaseErrors: 0,
      },
      performance: {
        loginTimes: [],
        tokenValidationTimes: [],
        cleanupTimes: [],
      }
    };

    // Initialize Redis metrics collection
    this.initializeRedisMetrics();
  }

  // Track login attempts
  trackLoginAttempt(userId, success, duration) {
    const userAttempts = this.metrics.loginAttempts.get(userId) || [];
    userAttempts.push({
      timestamp: Date.now(),
      success,
      duration
    });

    // Keep only last 10 attempts
    if (userAttempts.length > 10) {
      userAttempts.shift();
    }
    
    this.metrics.loginAttempts.set(userId, userAttempts);
    this.metrics.performance.loginTimes.push(duration);

    // Keep only last 100 login times for performance metrics
    if (this.metrics.performance.loginTimes.length > 100) {
      this.metrics.performance.loginTimes.shift();
    }
  }

  // Track token operations
  trackTokenOperation(operation, count = 1) {
    if (this.metrics.tokenOperations[operation] !== undefined) {
      this.metrics.tokenOperations[operation] += count;
    }
  }

  // Track cleanup operations
  trackCleanup(deletedCount, duration) {
    this.metrics.cleanupStats = {
      lastRun: new Date(),
      tokensDeleted: deletedCount,
      duration
    };
    this.metrics.performance.cleanupTimes.push(duration);

    // Keep only last 24 cleanup times
    if (this.metrics.performance.cleanupTimes.length > 24) {
      this.metrics.performance.cleanupTimes.shift();
    }
  }

  // Track errors
  trackError(type) {
    if (this.metrics.errors[type] !== undefined) {
      this.metrics.errors[type]++;
    }
  }

  // Initialize Redis metrics collection
  async initializeRedisMetrics() {
    try {
      // Monitor Redis connection status
      redisService.client.on('connect', () => {
        console.log('Redis connected');
      });

      redisService.client.on('error', (error) => {
        console.error('Redis error:', error);
        this.trackError('redisErrors');
      });

      // Start periodic Redis metrics collection
      setInterval(async () => {
        try {
          const info = await redisService.client.info();
          // Parse and store relevant Redis metrics
          // Add your specific Redis metrics here
        } catch (error) {
          console.error('Error collecting Redis metrics:', error);
        }
      }, 60000); // Collect metrics every minute
    } catch (error) {
      console.error('Error initializing Redis metrics:', error);
    }
  }

  // Get performance metrics
  getPerformanceMetrics() {
    const calculateAverage = (arr) => {
      if (!arr.length) return 0;
      return arr.reduce((a, b) => a + b, 0) / arr.length;
    };

    return {
      averageLoginTime: calculateAverage(this.metrics.performance.loginTimes),
      averageCleanupTime: calculateAverage(this.metrics.performance.cleanupTimes),
      tokenOperations: { ...this.metrics.tokenOperations },
      errors: { ...this.metrics.errors },
      lastCleanup: this.metrics.cleanupStats,
    };
  }

  // Get user-specific metrics
  getUserMetrics(userId) {
    const attempts = this.metrics.loginAttempts.get(userId) || [];
    return {
      recentAttempts: attempts,
      successRate: attempts.length ? 
        attempts.filter(a => a.success).length / attempts.length : 0,
      averageLoginTime: attempts.length ?
        attempts.reduce((sum, a) => sum + a.duration, 0) / attempts.length : 0
    };
  }

  // Reset metrics (useful for testing or periodic resets)
  resetMetrics() {
    this.metrics.loginAttempts.clear();
    this.metrics.tokenOperations = {
      created: 0,
      invalidated: 0,
      cleaned: 0,
    };
    this.metrics.errors = {
      loginFailures: 0,
      tokenValidationFailures: 0,
      redisErrors: 0,
      databaseErrors: 0,
    };
    this.metrics.performance = {
      loginTimes: [],
      tokenValidationTimes: [],
      cleanupTimes: [],
    };
  }
}

// Create and export a singleton instance
const tokenMonitoring = new TokenMonitoring();
module.exports = { tokenMonitoring }; 