// Response helpers for optimistic UI patterns

// Optimistic response wrapper
const optimisticResponse = (res, operation, fallbackData = null) => {
  return async (req, res, next) => {
    try {
      const result = await operation(req, res, next);
      
      // Add optimistic headers
      res.setHeader('X-Optimistic-Update', 'true');
      res.setHeader('X-Update-Status', 'success');
      
      return result;
    } catch (error) {
      // Log the error but return fallback data
      console.warn('Optimistic operation failed, using fallback:', error.message);
      
      res.setHeader('X-Optimistic-Update', 'true');
      res.setHeader('X-Update-Status', 'fallback');
      res.setHeader('X-Error-Message', error.message);
      
      if (fallbackData) {
        return res.json(fallbackData);
      }
      
      // Continue with error handling
      next(error);
    }
  };
};

// Stale-while-revalidate response
const staleWhileRevalidate = (res, data, fetchFreshData) => {
  // Return stale data immediately
  res.json(data);
  
  // Fetch fresh data in background
  setImmediate(async () => {
    try {
      await fetchFreshData();
    } catch (error) {
      console.warn('Background refresh failed:', error.message);
    }
  });
};

// Graceful error response
const gracefulError = (res, error, fallbackData = null) => {
  console.error('Operation failed:', error);
  
  if (fallbackData) {
    res.setHeader('X-Error-Recovered', 'true');
    res.setHeader('X-Error-Message', error.message);
    return res.json(fallbackData);
  }
  
  res.status(500).json({
    error: 'Internal server error',
    message: 'The operation failed, but the system is still functional',
    timestamp: new Date().toISOString()
  });
};

// Partial success response
const partialSuccess = (res, successfulData, failedOperations = []) => {
  res.status(207).json({
    status: 'partial_success',
    data: successfulData,
    failed_operations: failedOperations,
    message: 'Some operations completed successfully',
    timestamp: new Date().toISOString()
  });
};

// Retry-after response
const retryAfter = (res, retrySeconds = 60) => {
  res.setHeader('Retry-After', retrySeconds);
  res.status(503).json({
    error: 'Service temporarily unavailable',
    message: 'Please retry after the specified time',
    retry_after: retrySeconds
  });
};

// Circuit breaker response
const circuitBreakerResponse = (res) => {
  res.status(503).json({
    error: 'Service temporarily unavailable',
    message: 'The service is experiencing high load. Please try again later.',
    code: 'CIRCUIT_BREAKER_OPEN'
  });
};

module.exports = {
  optimisticResponse,
  staleWhileRevalidate,
  gracefulError,
  partialSuccess,
  retryAfter,
  circuitBreakerResponse
}; 