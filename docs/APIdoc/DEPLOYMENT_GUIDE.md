# Whoosh API Deployment & Operations Guide

## Overview

This guide provides comprehensive instructions for deploying, monitoring, and maintaining the Whoosh API in various environments. The system is designed to run on Vercel with MySQL database and Redis caching.

## 🚀 Pre-Deployment Checklist

### Prerequisites
- [ ] Node.js v16+ installed
- [ ] MySQL database instance configured
- [ ] Redis server instance configured
- [ ] Cloudinary account for file uploads
- [ ] Vercel account for deployment
- [ ] Environment variables prepared

### Environment Setup
- [ ] Database migrations ready
- [ ] SSL certificates configured
- [ ] Domain and DNS configured
- [ ] Monitoring tools configured
- [ ] Backup strategy implemented

## 🛠️ Local Development Setup

### 1. Clone and Install

```bash
# Clone the repository
git clone <repository-url>
cd api

# Install dependencies
npm install

# Generate Prisma client
npx prisma generate
```

### 2. Environment Configuration

Create a `.env` file in the root directory:

```env
# Database Configuration
DATABASE_URL="mysql://username:password@localhost:3306/whoosh_db"
SHADOW_DATABASE_URL="mysql://username:password@localhost:3306/whoosh_shadow"

# Redis Configuration
REDIS_URL="redis://localhost:6379"

# JWT Configuration
JWT_SECRET="your-super-secret-jwt-key-here"
JWT_REFRESH_SECRET="your-super-secret-refresh-key-here"

# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME="your-cloud-name"
CLOUDINARY_API_KEY="your-api-key"
CLOUDINARY_API_SECRET="your-api-secret"

# Admin Configuration
ADMIN_SECRET="your-admin-secret-key"

# Application Configuration
NODE_ENV="development"
PORT=3000
```

### 3. Database Setup

```bash
# Run database migrations
npx prisma migrate deploy

# Seed initial data (if available)
npx prisma db seed

# Verify database connection
npx prisma studio
```

### 4. Start Development Server

```bash
# Start with nodemon for development
npm run dev

# Or start production build
npm start
```

## 🌐 Production Deployment

### Vercel Deployment

#### 1. Vercel Configuration

Create `vercel.json` in the root directory:

```json
{
  "version": 2,
  "builds": [
    {
      "src": "index.js",
      "use": "@vercel/node"
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

#### 2. Environment Variables Setup

Configure environment variables in Vercel dashboard:

```env
# Production Database
DATABASE_URL="mysql://prod_user:prod_password@prod_host:3306/whoosh_prod"
SHADOW_DATABASE_URL="mysql://prod_user:prod_password@prod_host:3306/whoosh_shadow"

# Production Redis
REDIS_URL="redis://prod_redis_host:6379"

# Production JWT Keys (use strong, unique keys)
JWT_SECRET="production-jwt-secret-key"
JWT_REFRESH_SECRET="production-refresh-secret-key"

# Production Cloudinary
CLOUDINARY_CLOUD_NAME="prod-cloud-name"
CLOUDINARY_API_KEY="prod-api-key"
CLOUDINARY_API_SECRET="prod-api-secret"

# Production Admin
ADMIN_SECRET="production-admin-secret"

# Production Settings
NODE_ENV="production"
```

#### 3. Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy
vercel --prod
```

### Database Deployment

#### 1. Production Database Setup

```sql
-- Create production database
CREATE DATABASE whoosh_prod CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create production user
CREATE USER 'whoosh_prod'@'%' IDENTIFIED BY 'strong_password_here';
GRANT ALL PRIVILEGES ON whoosh_prod.* TO 'whoosh_prod'@'%';
FLUSH PRIVILEGES;
```

#### 2. Run Production Migrations

```bash
# Set production environment
export NODE_ENV=production

# Run migrations
npx prisma migrate deploy

# Verify schema
npx prisma db pull
```

### Redis Deployment

#### 1. Production Redis Setup

```bash
# Install Redis (Ubuntu/Debian)
sudo apt update
sudo apt install redis-server

# Configure Redis for production
sudo nano /etc/redis/redis.conf

# Key configurations:
# bind 127.0.0.1
# requirepass your_redis_password
# maxmemory 256mb
# maxmemory-policy allkeys-lru

# Restart Redis
sudo systemctl restart redis
sudo systemctl enable redis
```

## 📊 Monitoring and Observability

### Health Checks

#### 1. Basic Health Check

```bash
# Test basic health
curl https://your-api.vercel.app/health

# Expected response:
{
  "status": "healthy",
  "timestamp": "2025-01-15T10:30:00Z",
  "uptime": 3600
}
```

#### 2. Database Health Check

```bash
# Test database connectivity
curl https://your-api.vercel.app/health/database

# Expected response:
{
  "database": {
    "status": "connected",
    "responseTime": 15
  },
  "timestamp": "2025-01-15T10:30:00Z"
}
```

### Logging Configuration

#### 1. Application Logging

```javascript
// Configure logging levels
const logLevel = process.env.LOG_LEVEL || 'info';

// Log format
{
  "timestamp": "2025-01-15T10:30:00Z",
  "level": "INFO",
  "message": "User login successful",
  "userId": 123,
  "ip": "192.168.1.1",
  "userAgent": "Mobile App v1.0",
  "requestId": "req_123456"
}
```

#### 2. Error Monitoring

```javascript
// Error tracking setup
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Send to monitoring service
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Send to monitoring service
});
```

### Performance Monitoring

#### 1. Response Time Monitoring

```javascript
// Middleware for response time tracking
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} - ${duration}ms`);
  });
  next();
});
```

#### 2. Database Query Monitoring

```javascript
// Prisma query logging
const prisma = new PrismaClient({
  log: [
    {
      emit: 'event',
      level: 'query',
    },
    {
      emit: 'stdout',
      level: 'error',
    },
  ],
});

prisma.$on('query', (e) => {
  console.log('Query: ' + e.query);
  console.log('Params: ' + e.params);
  console.log('Duration: ' + e.duration + 'ms');
});
```

## 🔧 Maintenance Procedures

### Database Maintenance

#### 1. Regular Backups

```bash
#!/bin/bash
# backup.sh - Database backup script

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups"
DB_NAME="whoosh_prod"

# Create backup
mysqldump -u whoosh_prod -p$DB_PASSWORD $DB_NAME > $BACKUP_DIR/backup_$DATE.sql

# Compress backup
gzip $BACKUP_DIR/backup_$DATE.sql

# Keep only last 7 days of backups
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +7 -delete

echo "Backup completed: backup_$DATE.sql.gz"
```

#### 2. Database Optimization

```sql
-- Analyze table statistics
ANALYZE TABLE SalesRep, MyOrder, Product, Token;

-- Optimize tables
OPTIMIZE TABLE SalesRep, MyOrder, Product, Token;

-- Check table sizes
SELECT 
    table_name,
    ROUND(((data_length + index_length) / 1024 / 1024), 2) AS 'Size (MB)'
FROM information_schema.tables 
WHERE table_schema = 'whoosh_prod'
ORDER BY (data_length + index_length) DESC;
```

### Token Cleanup

#### 1. Automated Cleanup

The system includes automated token cleanup via cron jobs:

```javascript
// Token cleanup job (runs daily at 2 AM)
const tokenCleanupJob = cron.schedule(
  '0 2 * * *',
  async () => {
    const { tokenService } = require('./lib/tokenService');
    const deletedCount = await tokenService.cleanupExpiredTokens(50);
    console.log(`Token cleanup completed: ${deletedCount} tokens removed`);
  },
  { timezone: 'Africa/Nairobi' }
);
```

#### 2. Manual Cleanup

```bash
# Run manual token cleanup
node scripts/cleanup-tokens.js

# Check token statistics
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://your-api.vercel.app/admin/token-stats
```

### Cache Management

#### 1. Redis Cache Monitoring

```bash
# Connect to Redis
redis-cli -h your-redis-host -p 6379 -a your-password

# Check memory usage
INFO memory

# Check key statistics
INFO keyspace

# Monitor cache hits/misses
INFO stats
```

#### 2. Cache Invalidation

```javascript
// Manual cache clearing
const redis = require('./lib/redisService');

// Clear all cache
await redis.flushall();

// Clear specific patterns
await redis.del('user:*');
await redis.del('product:*');
```

## 🔒 Security Hardening

### SSL/TLS Configuration

#### 1. Vercel SSL

Vercel automatically provides SSL certificates. Ensure custom domain is configured:

```bash
# Add custom domain in Vercel dashboard
# Domain: api.yourcompany.com
# SSL: Automatic (provided by Vercel)
```

#### 2. Security Headers

```javascript
// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));
```

### Rate Limiting

#### 1. API Rate Limits

```javascript
// Rate limiting configuration
const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.'
  }
});

app.use('/api/', apiLimiter);
```

#### 2. Authentication Rate Limits

```javascript
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: {
    error: 'Too many authentication attempts, please try again later.'
  }
});

app.use('/auth/', authLimiter);
```

## 🚨 Incident Response

### Error Handling Procedures

#### 1. Database Connection Issues

```bash
# Check database connectivity
mysql -u whoosh_prod -p -h your-db-host -e "SELECT 1"

# Check connection pool status
curl https://your-api.vercel.app/health/database

# Restart application if needed
vercel --prod
```

#### 2. Redis Connection Issues

```bash
# Check Redis connectivity
redis-cli -h your-redis-host -p 6379 -a your-password ping

# Check Redis memory usage
redis-cli -h your-redis-host -p 6379 -a your-password info memory

# Restart Redis if needed
sudo systemctl restart redis
```

#### 3. High Error Rates

```bash
# Check application logs
vercel logs --prod

# Check error endpoints
curl https://your-api.vercel.app/health

# Monitor response times
curl -w "@curl-format.txt" https://your-api.vercel.app/health
```

### Emergency Procedures

#### 1. Emergency Mode

```bash
# Enable emergency mode (bypasses authentication)
curl -H "X-Admin-Secret: $ADMIN_SECRET" \
  -X POST https://your-api.vercel.app/emergency/enable

# Check emergency status
curl https://your-api.vercel.app/emergency/status

# Disable emergency mode
curl -H "X-Admin-Secret: $ADMIN_SECRET" \
  -X POST https://your-api.vercel.app/emergency/disable
```

#### 2. Rollback Procedures

```bash
# Rollback to previous deployment
vercel rollback --prod

# Rollback database migration
npx prisma migrate resolve --rolled-back <migration_name>

# Restore from backup
mysql -u whoosh_prod -p whoosh_prod < backup_20250115_120000.sql
```

## 📈 Performance Optimization

### Database Optimization

#### 1. Query Optimization

```sql
-- Add missing indexes
CREATE INDEX idx_order_date_status ON MyOrder(createdAt, status);
CREATE INDEX idx_user_country_role ON SalesRep(countryId, role);

-- Analyze slow queries
SET profiling = 1;
-- Run your query
SHOW PROFILES;
```

#### 2. Connection Pool Tuning

```javascript
// Prisma connection pool configuration
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  // Connection pool settings
  __internal: {
    engine: {
      connectionLimit: 10,
      pool: {
        min: 2,
        max: 10,
        acquireTimeoutMillis: 30000,
        createTimeoutMillis: 30000,
        destroyTimeoutMillis: 5000,
        idleTimeoutMillis: 30000,
        reapIntervalMillis: 1000,
        createRetryIntervalMillis: 100,
      },
    },
  },
});
```

### Caching Strategy

#### 1. Redis Cache Configuration

```javascript
// Redis configuration for production
const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  maxRetriesPerRequest: null,
  lazyConnect: true,
  // Connection pool settings
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  enableOfflineQueue: false,
});
```

#### 2. Cache Warming

```javascript
// Cache warming for frequently accessed data
const warmCache = async () => {
  // Cache user profiles
  const users = await prisma.salesRep.findMany({
    select: { id: true, name: true, email: true }
  });
  
  for (const user of users) {
    await redis.setex(`user:${user.id}`, 3600, JSON.stringify(user));
  }
  
  // Cache product catalog
  const products = await prisma.product.findMany({
    where: { status: 0 }
  });
  
  await redis.setex('products:catalog', 1800, JSON.stringify(products));
};
```

## 🔄 Continuous Deployment

### GitHub Actions Workflow

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '16'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Run tests
        run: npm test
        
      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.ORG_ID }}
          vercel-project-id: ${{ secrets.PROJECT_ID }}
          vercel-args: '--prod'
```

### Environment Promotion

```bash
# Promote staging to production
vercel --prod

# Run database migrations
npx prisma migrate deploy

# Verify deployment
curl https://your-api.vercel.app/health
```

---

**Deployment Guide Version**: 1.0  
**Last Updated**: January 2025  
**Maintainer**: Whoosh Development Team 