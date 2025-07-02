const { performance } = require('perf_hooks');

// Rate limiting with sliding window
class RateLimiter {
  constructor(maxRequests = 100, windowMs = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = new Map();
  }

  isAllowed(identifier) {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    // Clean old entries
    if (this.requests.has(identifier)) {
      this.requests.set(identifier, 
        this.requests.get(identifier).filter(timestamp => timestamp > windowStart)
      );
    } else {
      this.requests.set(identifier, []);
    }
    
    const requests = this.requests.get(identifier);
    
    if (requests.length >= this.maxRequests) {
      return false;
    }
    
    requests.push(now);
    return true;
  }
}

// Request timeout middleware
const timeoutMiddleware = (timeoutMs = 30000) => {
  return (req, res, next) => {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        res.status(408).json({ 
          error: 'Request timeout',
          message: 'The request took too long to process'
        });
      }
    }, timeoutMs);

    res.on('finish', () => {
      clearTimeout(timeout);
    });

    next();
  };
};

// Performance monitoring middleware
const performanceMiddleware = () => {
  return (req, res, next) => {
    const start = performance.now();
    
    res.on('finish', () => {
      const duration = performance.now() - start;
      console.log(`${req.method} ${req.path} - ${res.statusCode} - ${duration.toFixed(2)}ms`);
      
      // Alert on slow requests
      if (duration > 5000) {
        console.warn(`Slow request detected: ${req.method} ${req.path} took ${duration.toFixed(2)}ms`);
      }
    });
    
    next();
  };
};

// Health check endpoint
const healthCheck = (req, res) => {
  const health = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development'
  };
  
  res.status(200).json(health);
};

// Bulkhead pattern for database operations
class Bulkhead {
  constructor(maxConcurrent = 10) {
    this.maxConcurrent = maxConcurrent;
    this.current = 0;
    this.queue = [];
  }

  async execute(operation) {
    if (this.current >= this.maxConcurrent) {
      return new Promise((resolve, reject) => {
        this.queue.push({ operation, resolve, reject });
      });
    }

    this.current++;
    
    try {
      const result = await operation();
      this.current--;
      this.processQueue();
      return result;
    } catch (error) {
      this.current--;
      this.processQueue();
      throw error;
    }
  }

  processQueue() {
    if (this.queue.length > 0 && this.current < this.maxConcurrent) {
      const { operation, resolve, reject } = this.queue.shift();
      this.execute(operation).then(resolve).catch(reject);
    }
  }
}

// Global instances
const rateLimiter = new RateLimiter();
const dbBulkhead = new Bulkhead(20);

// Rate limiting middleware
const rateLimitMiddleware = (req, res, next) => {
  const identifier = req.ip || req.connection.remoteAddress;
  
  if (!rateLimiter.isAllowed(identifier)) {
    return res.status(429).json({
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.'
    });
  }
  
  next();
};

// Database operation wrapper with bulkhead
const withBulkhead = async (operation) => {
  return await dbBulkhead.execute(operation);
};

module.exports = {
  timeoutMiddleware,
  performanceMiddleware,
  healthCheck,
  rateLimitMiddleware,
  withBulkhead,
  RateLimiter,
  Bulkhead
}; 