# Whoosh API Troubleshooting Guide

## Overview

This guide provides solutions for common issues encountered when working with the Whoosh API system. It covers authentication problems, database issues, performance problems, and deployment troubleshooting.

## 🔐 Authentication Issues

### JWT Token Problems

#### Issue: "Invalid token" or "Token expired"

**Symptoms:**
- 401 Unauthorized responses
- Users being logged out unexpectedly
- Token refresh failures

**Diagnosis:**
```bash
# Check token expiration
curl -H "Authorization: Bearer <token>" \
  https://your-api.vercel.app/auth/verify

# Check token in database
mysql -u whoosh_prod -p -e "
SELECT token, expiresAt, blacklisted, lastUsedAt 
FROM Token 
WHERE token = '<token_hash>'"
```

**Solutions:**
1. **Token Expired**: Implement automatic token refresh
2. **Token Blacklisted**: Clear blacklist or generate new token
3. **Invalid Token Format**: Check token structure

```javascript
// Token refresh implementation
const refreshToken = async (refreshToken) => {
  try {
    const response = await fetch('/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });
    
    if (response.ok) {
      const { accessToken, refreshToken: newRefreshToken } = await response.json();
      // Store new tokens
      return { accessToken, refreshToken: newRefreshToken };
    }
  } catch (error) {
    console.error('Token refresh failed:', error);
    // Redirect to login
  }
};
```

#### Issue: "Too many authentication attempts"

**Symptoms:**
- Rate limit exceeded errors
- Users locked out temporarily

**Solutions:**
1. **Wait for rate limit reset** (15 minutes)
2. **Check for automated requests**
3. **Implement exponential backoff**

```javascript
// Exponential backoff for failed auth attempts
const loginWithRetry = async (credentials, maxRetries = 3) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials)
      });
      
      if (response.ok) {
        return await response.json();
      }
      
      if (response.status === 429) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      throw new Error('Login failed');
    } catch (error) {
      if (attempt === maxRetries) throw error;
    }
  }
};
```

### Session Management Issues

#### Issue: Users logged out unexpectedly

**Symptoms:**
- Users reporting frequent logouts
- Session data lost

**Diagnosis:**
```bash
# Check Redis connection
redis-cli -h your-redis-host ping

# Check session data
redis-cli -h your-redis-host keys "session:*"

# Check auto-logout cron job
grep "auto-logout" /var/log/syslog
```

**Solutions:**
1. **Redis Connection Issues**: Restart Redis service
2. **Auto-logout Job**: Check cron job timing
3. **Session Storage**: Verify Redis persistence

```javascript
// Session health check
const checkSessionHealth = async () => {
  try {
    const redis = require('./lib/redisService');
    const ping = await redis.ping();
    
    if (ping !== 'PONG') {
      throw new Error('Redis connection failed');
    }
    
    // Check session count
    const sessionCount = await redis.keys('session:*');
    console.log(`Active sessions: ${sessionCount.length}`);
    
    return true;
  } catch (error) {
    console.error('Session health check failed:', error);
    return false;
  }
};
```

## 🗄️ Database Issues

### Connection Problems

#### Issue: "Database connection failed"

**Symptoms:**
- 500 Internal Server Error
- Database timeout errors
- Connection pool exhaustion

**Diagnosis:**
```bash
# Test database connectivity
mysql -u whoosh_prod -p -h your-db-host -e "SELECT 1"

# Check connection pool status
curl https://your-api.vercel.app/health/database

# Check database logs
tail -f /var/log/mysql/error.log
```

**Solutions:**
1. **Network Issues**: Check firewall and network connectivity
2. **Authentication**: Verify database credentials
3. **Connection Pool**: Adjust pool settings

```javascript
// Database connection monitoring
const monitorDatabaseHealth = async () => {
  try {
    const prisma = require('./lib/prisma');
    
    // Test connection
    await prisma.$queryRaw`SELECT 1`;
    
    // Check connection pool
    const poolStatus = await prisma.$metrics.json();
    console.log('Database pool status:', poolStatus);
    
    return true;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
};
```

#### Issue: "Query timeout" or slow queries

**Symptoms:**
- Slow response times
- Database timeout errors
- High CPU usage

**Diagnosis:**
```sql
-- Check slow queries
SELECT 
    query,
    COUNT(*) as execution_count,
    AVG(duration) as avg_duration,
    MAX(duration) as max_duration
FROM mysql.slow_log 
WHERE start_time > DATE_SUB(NOW(), INTERVAL 1 HOUR)
GROUP BY query
ORDER BY avg_duration DESC;

-- Check table sizes
SELECT 
    table_name,
    ROUND(((data_length + index_length) / 1024 / 1024), 2) AS 'Size (MB)'
FROM information_schema.tables 
WHERE table_schema = 'whoosh_prod'
ORDER BY (data_length + index_length) DESC;
```

**Solutions:**
1. **Add Missing Indexes**: Analyze query patterns
2. **Optimize Queries**: Use query optimization
3. **Database Tuning**: Adjust MySQL configuration

```sql
-- Add common indexes
CREATE INDEX idx_order_date_status ON MyOrder(createdAt, status);
CREATE INDEX idx_user_country_role ON SalesRep(countryId, role);
CREATE INDEX idx_token_lookup ON Token(salesRepId, tokenType, blacklisted, expiresAt);

-- Optimize tables
OPTIMIZE TABLE SalesRep, MyOrder, Product, Token;
```

### Data Integrity Issues

#### Issue: "Foreign key constraint failed"

**Symptoms:**
- 500 errors on data operations
- Inconsistent data relationships

**Diagnosis:**
```sql
-- Check for orphaned records
SELECT COUNT(*) as orphaned_orders
FROM MyOrder o
LEFT JOIN SalesRep s ON o.salesRepId = s.id
WHERE s.id IS NULL;

SELECT COUNT(*) as orphaned_tokens
FROM Token t
LEFT JOIN SalesRep s ON t.salesRepId = s.id
WHERE s.id IS NULL;
```

**Solutions:**
1. **Clean Orphaned Data**: Remove invalid references
2. **Fix Data Relationships**: Update foreign keys
3. **Add Constraints**: Prevent future issues

```sql
-- Clean orphaned data
DELETE FROM MyOrder WHERE salesRepId NOT IN (SELECT id FROM SalesRep);
DELETE FROM Token WHERE salesRepId NOT IN (SELECT id FROM SalesRep);

-- Add foreign key constraints
ALTER TABLE MyOrder 
ADD CONSTRAINT fk_order_salesrep 
FOREIGN KEY (salesRepId) REFERENCES SalesRep(id) ON DELETE CASCADE;
```

## 🚀 Performance Issues

### High Response Times

#### Issue: "Request timeout" or slow API responses

**Symptoms:**
- API responses taking >30 seconds
- Client timeout errors
- High server load

**Diagnosis:**
```bash
# Check response times
curl -w "@curl-format.txt" https://your-api.vercel.app/health

# Monitor server resources
htop
iostat -x 1
```

**Solutions:**
1. **Database Optimization**: Add indexes and optimize queries
2. **Caching**: Implement Redis caching
3. **Connection Pooling**: Optimize database connections

```javascript
// Performance monitoring middleware
const performanceMonitor = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    
    if (duration > 5000) { // Log slow requests
      console.warn(`Slow request: ${req.method} ${req.path} - ${duration}ms`);
    }
    
    // Send to monitoring service
    if (duration > 10000) {
      // Alert for very slow requests
      console.error(`Very slow request: ${req.method} ${req.path} - ${duration}ms`);
    }
  });
  
  next();
};
```

### Memory Issues

#### Issue: "Out of memory" or high memory usage

**Symptoms:**
- Application crashes
- High memory consumption
- Slow performance

**Diagnosis:**
```bash
# Check memory usage
free -h
ps aux --sort=-%mem | head -10

# Check Node.js memory
node --max-old-space-size=4096 index.js
```

**Solutions:**
1. **Memory Leaks**: Identify and fix memory leaks
2. **Garbage Collection**: Optimize GC settings
3. **Resource Management**: Close connections properly

```javascript
// Memory leak detection
const checkMemoryUsage = () => {
  const used = process.memoryUsage();
  
  console.log('Memory usage:');
  console.log(`  RSS: ${Math.round(used.rss / 1024 / 1024)} MB`);
  console.log(`  Heap Total: ${Math.round(used.heapTotal / 1024 / 1024)} MB`);
  console.log(`  Heap Used: ${Math.round(used.heapUsed / 1024 / 1024)} MB`);
  console.log(`  External: ${Math.round(used.external / 1024 / 1024)} MB`);
  
  // Alert if memory usage is high
  if (used.heapUsed > 500 * 1024 * 1024) { // 500MB
    console.warn('High memory usage detected!');
  }
};

// Run memory check periodically
setInterval(checkMemoryUsage, 300000); // Every 5 minutes
```

## 🔄 Deployment Issues

### Vercel Deployment Problems

#### Issue: "Build failed" or deployment errors

**Symptoms:**
- Failed deployments
- Build errors
- Environment variable issues

**Diagnosis:**
```bash
# Check build logs
vercel logs --prod

# Test build locally
npm run build

# Check environment variables
vercel env ls
```

**Solutions:**
1. **Environment Variables**: Verify all required variables are set
2. **Dependencies**: Check package.json and node_modules
3. **Build Configuration**: Review vercel.json

```json
// vercel.json configuration
{
  "version": 2,
  "builds": [
    {
      "src": "index.js",
      "use": "@vercel/node",
      "config": {
        "maxLambdaSize": "50mb"
      }
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "/index.js"
    }
  ],
  "env": {
    "NODE_ENV": "production"
  },
  "functions": {
    "index.js": {
      "maxDuration": 30
    }
  }
}
```

#### Issue: "Function timeout" or cold starts

**Symptoms:**
- Slow initial responses
- Timeout errors
- Poor user experience

**Solutions:**
1. **Warm Functions**: Implement function warming
2. **Optimize Cold Starts**: Reduce bundle size
3. **Connection Pooling**: Optimize database connections

```javascript
// Function warming
const warmFunction = async () => {
  try {
    // Make a request to warm up the function
    await fetch('https://your-api.vercel.app/health');
    console.log('Function warmed successfully');
  } catch (error) {
    console.error('Function warming failed:', error);
  }
};

// Warm function every 5 minutes
setInterval(warmFunction, 300000);
```

## 🔒 Security Issues

### Rate Limiting Problems

#### Issue: "Rate limit exceeded" for legitimate users

**Symptoms:**
- Users getting rate limited unexpectedly
- API calls failing due to rate limits

**Solutions:**
1. **Adjust Rate Limits**: Increase limits for authenticated users
2. **Whitelist IPs**: Add trusted IP addresses
3. **User-Specific Limits**: Implement per-user rate limiting

```javascript
// User-specific rate limiting
const userRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: (req) => {
    // Higher limits for authenticated users
    return req.user ? 200 : 50;
  },
  keyGenerator: (req) => {
    // Use user ID for authenticated users
    return req.user ? req.user.id : req.ip;
  }
});
```

### CORS Issues

#### Issue: "CORS error" or cross-origin problems

**Symptoms:**
- Browser CORS errors
- API calls failing from frontend

**Solutions:**
1. **Configure CORS**: Set up proper CORS headers
2. **Environment-Specific**: Different settings for dev/prod
3. **Credentials**: Handle credentials properly

```javascript
// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'https://your-frontend.vercel.app',
      'http://localhost:3000'
    ];
    
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
```

## 📊 Monitoring and Alerting

### Health Check Failures

#### Issue: Health checks failing

**Symptoms:**
- Monitoring alerts
- Service unavailable
- Health endpoint errors

**Diagnosis:**
```bash
# Test health endpoints
curl https://your-api.vercel.app/health
curl https://your-api.vercel.app/health/database

# Check application logs
vercel logs --prod | grep ERROR
```

**Solutions:**
1. **Database Connectivity**: Check database connection
2. **Redis Connectivity**: Verify Redis connection
3. **Application Errors**: Review error logs

```javascript
// Comprehensive health check
const comprehensiveHealthCheck = async () => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    checks: {}
  };
  
  // Database check
  try {
    const prisma = require('./lib/prisma');
    await prisma.$queryRaw`SELECT 1`;
    health.checks.database = 'healthy';
  } catch (error) {
    health.checks.database = 'unhealthy';
    health.status = 'unhealthy';
  }
  
  // Redis check
  try {
    const redis = require('./lib/redisService');
    await redis.ping();
    health.checks.redis = 'healthy';
  } catch (error) {
    health.checks.redis = 'unhealthy';
    health.status = 'unhealthy';
  }
  
  return health;
};
```

### Error Tracking

#### Issue: High error rates

**Symptoms:**
- Increased error responses
- User complaints
- Monitoring alerts

**Solutions:**
1. **Error Logging**: Implement comprehensive error logging
2. **Error Classification**: Categorize errors by type
3. **Alerting**: Set up error rate alerts

```javascript
// Error tracking middleware
const errorTracker = (err, req, res, next) => {
  // Log error details
  console.error('Error occurred:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    userId: req.user?.id,
    timestamp: new Date().toISOString()
  });
  
  // Send to error tracking service
  if (process.env.ERROR_TRACKING_URL) {
    fetch(process.env.ERROR_TRACKING_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: err.message,
        stack: err.stack,
        context: {
          url: req.url,
          method: req.method,
          userId: req.user?.id
        }
      })
    }).catch(console.error);
  }
  
  next(err);
};
```

## 🛠️ Common Error Codes and Solutions

### HTTP Status Codes

| Code | Error | Cause | Solution |
|------|-------|-------|----------|
| 400 | Bad Request | Invalid input data | Validate request data |
| 401 | Unauthorized | Invalid/missing token | Refresh or re-authenticate |
| 403 | Forbidden | Insufficient permissions | Check user role |
| 404 | Not Found | Resource doesn't exist | Verify resource ID |
| 429 | Too Many Requests | Rate limit exceeded | Implement backoff |
| 500 | Internal Server Error | Server error | Check logs and restart |
| 502 | Bad Gateway | Upstream service error | Check database/Redis |
| 503 | Service Unavailable | Service overloaded | Scale up resources |

### Database Error Codes

| Code | Error | Cause | Solution |
|------|-------|-------|----------|
| 1045 | Access denied | Wrong credentials | Check database credentials |
| 2002 | Connection refused | Database unavailable | Check database service |
| 2006 | Connection lost | Network timeout | Check network connectivity |
| 1213 | Deadlock | Concurrent transactions | Retry with backoff |
| 1205 | Lock wait timeout | Long-running transaction | Optimize queries |

### Redis Error Codes

| Code | Error | Cause | Solution |
|------|-------|-------|----------|
| ECONNREFUSED | Connection refused | Redis unavailable | Check Redis service |
| ETIMEDOUT | Connection timeout | Network issues | Check network |
| ENOTFOUND | Host not found | DNS resolution | Check Redis host |
| EACCES | Permission denied | Authentication failed | Check Redis password |

## 📞 Getting Help

### Support Channels

1. **Documentation**: Check the docs/ directory
2. **Logs**: Review application and system logs
3. **Monitoring**: Check health endpoints and metrics
4. **Team**: Contact the development team

### Information to Provide

When reporting issues, include:
- Error messages and stack traces
- Request/response data
- Environment details (dev/staging/prod)
- Steps to reproduce
- Expected vs actual behavior
- Timestamps and user IDs

---

**Troubleshooting Guide Version**: 1.0  
**Last Updated**: January 2025  
**Maintainer**: Whoosh Development Team 