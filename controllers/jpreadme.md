# Redis Caching Implementation

## Overview
This document outlines the Redis caching implementation added to improve API performance and reliability, particularly during database connectivity issues.

## Redis Configuration
- **Host**: redis-10907.c341.af-south-1-1.ec2.redns.redis-cloud.com
- **Port**: 10907
- **Connection**: Using Redis Cloud (Free Tier)

## Implemented Caching Areas

### 1. Authentication (authController.js)
- **User Data Caching**
  - Cache Key: `user:${phoneNumber}`
  - TTL: 1 hour
  - Cached Data: User profile and authentication details
  - Fallback: Uses cached data if database is unreachable

- **Token Caching**
  - Cache Keys: 
    - `token:access:${userId}`
    - `token:refresh:${userId}`
  - TTL: 
    - Access Token: 8 hours
    - Refresh Token: 7 days

### 2. Profile Management (profileController.js)
- **Individual Profiles**
  - Cache Key: `user:id:${userId}`
  - TTL: 1 hour
  - Includes: User details, role, region info

- **Sales Rep Lists**
  - Cache Key: `sales_reps:route:${routeId}` or `sales_reps:all`
  - TTL: 30 minutes
  - Route-specific caching for better granularity

## Redis Service Features (redisService.js)

### Core Functions
```javascript
// Get cached data
await redisService.get(key)

// Set data with TTL
await redisService.set(key, value, ttlSeconds)

// Delete cached data
await redisService.del(key)

// Delete by pattern
await redisService.invalidatePattern(pattern)

// Batch operations
await redisService.mget(keys)
await redisService.mset(keyValuePairs, ttlSeconds)
```

### Error Handling
- Automatic reconnection
- Connection event logging
- Fallback mechanisms for database issues
- Proper error propagation

### Date Handling
- Automatic serialization of Date objects
- Proper deserialization of ISO date strings
- Date validation on retrieval

## Retry Service Improvements (retryService.js)

### Enhanced Error Detection
```javascript
const RETRYABLE_ERROR_CODES = [
  'P2028', // Transaction timeout
  'P2024', // Connection pool timeout
  'P2025', // Record not found
  'P2034', // Transaction failed
];

const RETRYABLE_ERROR_MESSAGES = [
  'Transaction already closed',
  'timeout',
  'connection',
  'Connection refused',
  'ECONNREFUSED',
  'read ECONNRESET',
  'Connection terminated unexpectedly',
  "Can't reach database server",
  'Connection pool timeout',
  'Failed to fetch'
];
```

### Retry Strategy
- Maximum 3 retry attempts
- Exponential backoff with jitter
- Detailed error logging
- Operation-specific naming

## Best Practices Implemented

### 1. Cache Invalidation
- TTL-based expiration
- Pattern-based invalidation for related data
- Automatic cleanup of expired entries

### 2. Error Resilience
- Graceful degradation
- Fallback to cached data
- Automatic reconnection handling

### 3. Performance Optimization
- Batch operations where possible
- Connection pooling
- Proper error handling to prevent cascading failures

## Monitoring and Debugging
- Detailed error logging
- Operation tracking
- Cache hit/miss logging
- Connection state monitoring

## Free Tier Considerations
- Monitored memory usage
- Appropriate TTL values
- Selective caching of critical data
- Efficient data serialization

## Future Improvements
1. Implement circuit breakers for database calls
2. Add cache warming mechanisms
3. Implement cache versioning
4. Add cache analytics and monitoring
5. Implement request queuing during high load

## Usage Example
```javascript
// Fetching user data with caching
const userData = await redisService.cacheWrapper(
  `user:${userId}`,
  3600,
  async () => {
    return await prisma.user.findUnique({
      where: { id: userId }
    });
  }
);
``` 