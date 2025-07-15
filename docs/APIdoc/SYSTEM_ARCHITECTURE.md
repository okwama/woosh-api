# Whoosh API System Architecture

## Overview

The Whoosh API is a microservices-inspired monolithic Node.js application designed for sales force automation and business management. The system follows a layered architecture pattern with clear separation of concerns, robust error handling, and comprehensive monitoring.

## 🏗️ Architecture Layers

### 1. Presentation Layer (Routes)
**Location**: `routes/`

The presentation layer handles HTTP requests and responses, providing a RESTful API interface.

**Key Components**:
- Route definitions with middleware integration
- Request validation and sanitization
- Response formatting and error handling
- Rate limiting and security headers

**Pattern**: RESTful API with consistent response formats

### 2. Business Logic Layer (Controllers)
**Location**: `controllers/`

Controllers contain the core business logic and orchestrate data operations.

**Key Components**:
- `authController.js` - Authentication and user management
- `orderController.js` - Order processing and workflow
- `productController.js` - Product catalog and inventory
- `journeyPlanController.js` - Route planning and visit management
- `analyticsController.js` - Reporting and business intelligence

**Pattern**: Service-oriented with clear domain boundaries

### 3. Data Access Layer (Services)
**Location**: `lib/services/`

Services handle data persistence, external API integrations, and complex business operations.

**Key Components**:
- `tokenService.js` - JWT token management
- `redisService.js` - Caching and session management
- `uploadService.js` - File upload and storage
- `connectionManager.js` - Database connection management

**Pattern**: Repository pattern with dependency injection

### 4. Infrastructure Layer (Middleware & Utilities)
**Location**: `middleware/` and `lib/`

Infrastructure components provide cross-cutting concerns and system utilities.

**Key Components**:
- `authMiddleware.js` - JWT authentication and authorization
- `resilienceMiddleware.js` - Performance monitoring and error handling
- `roleAuth.js` - Role-based access control
- `prisma.js` - Database ORM configuration

## 🔄 Data Flow Architecture

### Request Processing Pipeline

```
Client Request
    ↓
Rate Limiting (resilienceMiddleware)
    ↓
Authentication (authMiddleware)
    ↓
Authorization (roleAuth)
    ↓
Request Validation
    ↓
Business Logic (Controller)
    ↓
Data Access (Service)
    ↓
Database/External APIs
    ↓
Response Formatting
    ↓
Client Response
```

### Authentication Flow

```
Login Request
    ↓
Credential Validation
    ↓
JWT Token Generation
    ↓
Redis Session Storage
    ↓
Token Response
    ↓
Subsequent Requests
    ↓
Token Validation
    ↓
Session Verification
    ↓
Request Processing
```

## 🗄️ Database Architecture

### Schema Design Principles

1. **Normalization**: Proper 3NF normalization for data integrity
2. **Indexing**: Strategic indexes for performance optimization
3. **Relationships**: Clear foreign key relationships with cascading
4. **Audit Trail**: Timestamp fields for tracking changes
5. **Soft Deletes**: Status fields instead of hard deletes

### Core Entity Relationships

```
SalesRep (1) ←→ (N) MyOrder
SalesRep (1) ←→ (N) JourneyPlan
SalesRep (1) ←→ (N) Token
SalesRep (1) ←→ (1) Manager

Product (1) ←→ (N) OrderItem
Product (1) ←→ (N) StoreQuantity
Product (1) ←→ (N) PriceOption

Store (1) ←→ (N) StoreQuantity
Store (1) ←→ (N) JourneyPlan

Country (1) ←→ (N) SalesRep
Country (1) ←→ (N) Store
```

### Database Optimization

- **Connection Pooling**: Managed by Prisma with configurable pool size
- **Query Optimization**: Strategic indexing on frequently queried fields
- **Migration Strategy**: Version-controlled schema changes
- **Backup Strategy**: Automated database backups

## 🔐 Security Architecture

### Authentication System

**JWT Token Strategy**:
- **Access Tokens**: Short-lived (15 minutes) for API access
- **Refresh Tokens**: Long-lived (7 days) for token renewal
- **Token Blacklisting**: Automatic cleanup of compromised tokens
- **Token Rotation**: Refresh tokens are rotated on each use

**Security Features**:
- Password hashing with bcrypt
- Rate limiting on authentication endpoints
- Session management with Redis
- Automatic logout on token expiration

### Authorization System

**Role-Based Access Control (RBAC)**:
- **USER**: Basic sales representative permissions
- **MANAGER**: Supervisory and reporting access
- **ADMIN**: Full system administration

**Permission Matrix**:
```
Endpoint          | USER | MANAGER | ADMIN
------------------|------|---------|-------
GET /orders       | ✓    | ✓       | ✓
POST /orders      | ✓    | ✓       | ✓
DELETE /orders    | ✗    | ✓       | ✓
GET /analytics    | ✗    | ✓       | ✓
POST /users       | ✗    | ✗       | ✓
```

## 🚀 Performance Architecture

### Caching Strategy

**Redis Caching Layers**:
1. **Session Cache**: User sessions and authentication state
2. **Data Cache**: Frequently accessed business data
3. **Rate Limiting**: Request throttling data
4. **Performance Metrics**: System monitoring data

**Cache Invalidation**:
- Time-based expiration
- Event-driven invalidation
- Manual cache clearing

### Database Optimization

**Query Optimization**:
- Strategic indexing on foreign keys and search fields
- Query result caching for read-heavy operations
- Connection pooling for efficient resource usage
- Prepared statements for security and performance

**Performance Monitoring**:
- Query execution time tracking
- Database connection monitoring
- Slow query identification and optimization

## 🔄 Event-Driven Architecture

### Cron Jobs and Scheduled Tasks

**Automated Operations**:
- **Daily Auto-logout**: Midnight cleanup of user sessions
- **Token Cleanup**: 2 AM cleanup of expired tokens
- **Balance Monitoring**: Periodic aged balance checks
- **Performance Metrics**: Regular system health checks

**Event Handling**:
- Order status changes trigger notifications
- Target achievements trigger celebrations
- System errors trigger alerts

## 📊 Monitoring and Observability

### Health Monitoring

**Health Check Endpoints**:
- `/health` - Basic system health
- `/health/database` - Database connectivity
- `/emergency/status` - Emergency mode status

**Monitoring Metrics**:
- Request/response times
- Error rates and types
- Database performance
- Memory and CPU usage
- Active user sessions

### Logging Strategy

**Log Levels**:
- **ERROR**: System errors and failures
- **WARN**: Potential issues and warnings
- **INFO**: General operational information
- **DEBUG**: Detailed debugging information

**Log Format**:
```json
{
  "timestamp": "2025-01-15T10:30:00Z",
  "level": "INFO",
  "message": "User login successful",
  "userId": 123,
  "ip": "192.168.1.1",
  "userAgent": "Mobile App v1.0"
}
```

## 🛡️ Resilience and Fault Tolerance

### Error Handling Strategy

**Error Categories**:
1. **Validation Errors**: Invalid input data
2. **Authentication Errors**: Invalid credentials or tokens
3. **Authorization Errors**: Insufficient permissions
4. **Business Logic Errors**: Rule violations
5. **System Errors**: Infrastructure failures

**Error Response Format**:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": [...],
    "timestamp": "2025-01-15T10:30:00Z"
  }
}
```

### Circuit Breaker Pattern

**Implementation**:
- Database connection failures
- External API failures
- Redis connection issues
- File upload failures

**Fallback Strategies**:
- Graceful degradation
- Cached responses
- Default values
- User-friendly error messages

## 🔧 Configuration Management

### Environment Configuration

**Configuration Sources**:
1. **Environment Variables**: Runtime configuration
2. **Database**: Dynamic configuration storage
3. **Redis**: Cached configuration values
4. **Default Values**: Application defaults

**Configuration Categories**:
- Database connection settings
- Authentication parameters
- File upload limits
- Rate limiting rules
- Feature flags

### Feature Flags

**Implementation**:
- Database-stored feature flags
- Environment-based feature toggles
- User role-based feature access
- A/B testing capabilities

## 📱 API Design Patterns

### RESTful Design Principles

**Resource Naming**:
- Nouns instead of verbs
- Plural resource names
- Hierarchical relationships
- Consistent URL patterns

**HTTP Methods**:
- GET: Retrieve resources
- POST: Create resources
- PUT: Update resources
- DELETE: Remove resources

### Response Format Standards

**Success Response**:
```json
{
  "success": true,
  "data": {...},
  "pagination": {...},
  "timestamp": "2025-01-15T10:30:00Z"
}
```

**Error Response**:
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": [...]
  }
}
```

## 🔄 Deployment Architecture

### Vercel Deployment

**Configuration**:
- Serverless function deployment
- Automatic scaling
- Global CDN distribution
- Environment variable management

**Build Process**:
1. Code compilation
2. Prisma client generation
3. Environment configuration
4. Deployment to Vercel

### Environment Management

**Environment Types**:
- **Development**: Local development environment
- **Staging**: Pre-production testing
- **Production**: Live application environment

**Environment Variables**:
- Database connection strings
- API keys and secrets
- Feature flags
- Performance settings

## 🔍 Testing Strategy

### Testing Layers

**Unit Tests**:
- Individual function testing
- Service layer testing
- Utility function testing

**Integration Tests**:
- API endpoint testing
- Database integration testing
- External service testing

**End-to-End Tests**:
- Complete user workflow testing
- Cross-browser compatibility
- Performance testing

### Test Data Management

**Test Data Strategy**:
- Isolated test databases
- Fixture data for consistent testing
- Data cleanup after tests
- Mock external services

## 📈 Scalability Considerations

### Horizontal Scaling

**Scaling Strategies**:
- Stateless application design
- Database connection pooling
- Redis for session sharing
- Load balancer support

### Performance Optimization

**Optimization Techniques**:
- Database query optimization
- Caching strategies
- CDN for static assets
- Image optimization
- Code splitting and lazy loading

## 🔮 Future Architecture Considerations

### Microservices Migration

**Potential Benefits**:
- Independent service scaling
- Technology diversity
- Team autonomy
- Fault isolation

**Migration Strategy**:
- Domain-driven design
- API gateway implementation
- Service mesh adoption
- Gradual migration approach

### Event Sourcing

**Implementation Benefits**:
- Complete audit trail
- Temporal queries
- Event replay capabilities
- Better scalability

**Considerations**:
- Increased complexity
- Storage requirements
- Query performance
- Learning curve

---

**Architecture Version**: 1.0  
**Last Updated**: January 2025  
**Maintainer**: Whoosh Development Team 