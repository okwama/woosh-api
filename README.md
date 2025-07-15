# Whoosh API Server Documentation

## Overview

The Whoosh API is a comprehensive Node.js/Express.js backend system designed for sales management, inventory tracking, and business operations. It provides a robust REST API with authentication, role-based access control, and extensive business logic for managing sales representatives, products, orders, and analytics.

## 🏗️ System Architecture

### Technology Stack
- **Runtime**: Node.js with Express.js
- **Database**: MySQL with Prisma ORM
- **Authentication**: JWT tokens with refresh mechanism
- **Caching**: Redis for session management and caching
- **File Storage**: Cloudinary for image uploads
- **Monitoring**: Custom performance and health monitoring
- **Scheduling**: Node-cron for automated tasks
- **Deployment**: Vercel-ready configuration

### Core Components

```
api/
├── index.js                 # Main application entry point
├── controllers/            # Business logic handlers
├── routes/                 # API route definitions
├── middleware/             # Authentication and request processing
├── lib/                    # Core services and utilities
├── prisma/                 # Database schema and migrations
├── scripts/                # Maintenance and utility scripts
└── docs/                   # API documentation
```

## 🚀 Getting Started

### Prerequisites
- Node.js (v16 or higher)
- MySQL database
- Redis server
- Cloudinary account (for file uploads)

### Installation

1. **Clone and install dependencies**
   ```bash
   npm install
   ```

2. **Environment Setup**
   Create a `.env` file with the following variables:
   ```env
   # Database
   DATABASE_URL="mysql://user:password@localhost:3306/whoosh_db"
   SHADOW_DATABASE_URL="mysql://user:password@localhost:3306/whoosh_shadow"
   
   # Redis
   REDIS_URL="redis://localhost:6379"
   
   # JWT
   JWT_SECRET="your-jwt-secret"
   JWT_REFRESH_SECRET="your-refresh-secret"
   
   # Cloudinary
   CLOUDINARY_CLOUD_NAME="your-cloud-name"
   CLOUDINARY_API_KEY="your-api-key"
   CLOUDINARY_API_SECRET="your-api-secret"
   
   # Admin
   ADMIN_SECRET="your-admin-secret"
   ```

3. **Database Setup**
   ```bash
   npx prisma generate
   npx prisma migrate deploy
   ```

4. **Start the server**
   ```bash
   npm run dev    # Development mode
   npm start      # Production mode
   ```

## 📊 Database Schema

### Core Entities

#### SalesRep
- Primary user entity representing sales representatives
- Contains personal info, location data, and role assignments
- Manages targets, orders, and activity tracking

#### Product
- Product catalog with pricing and inventory management
- Supports multiple price options and categories
- Tracks stock levels across stores

#### MyOrder
- Order management system with status tracking
- Supports multiple order items and payment processing
- Integrates with inventory management

#### JourneyPlan
- Route planning and visit scheduling
- Tracks planned vs actual visits
- Manages location-based activities

### Key Relationships
- SalesRep → Manager (hierarchical structure)
- SalesRep → Orders (one-to-many)
- Product → StoreQuantity (inventory tracking)
- JourneyPlan → SalesRep (assignment)

## 🔐 Authentication & Authorization

### JWT Token System
- **Access Tokens**: Short-lived (15 minutes) for API access
- **Refresh Tokens**: Long-lived (7 days) for token renewal
- **Blacklisting**: Automatic cleanup of expired/compromised tokens

### Role-Based Access Control
- **USER**: Basic sales representative access
- **MANAGER**: Supervisory and reporting access
- **ADMIN**: Full system administration

### Security Features
- Rate limiting on all endpoints
- Request timeout protection (30 seconds)
- Performance monitoring and logging
- Emergency mode for critical situations

## 🛣️ API Endpoints

### Authentication (`/auth`)
- `POST /auth/login` - User login
- `POST /auth/refresh` - Token refresh
- `POST /auth/logout` - User logout
- `POST /auth/register` - User registration

### Sales Management (`/orders`)
- `GET /orders` - List orders with pagination
- `POST /orders` - Create new order
- `PUT /orders/:id` - Update order
- `DELETE /orders/:id` - Cancel order

### Product Management (`/products`)
- `GET /products` - Product catalog
- `POST /products` - Add new product
- `PUT /products/:id` - Update product
- `GET /products/inventory` - Stock levels

### Journey Planning (`/journey-plans`)
- `GET /journey-plans` - User's journey plans
- `POST /journey-plans` - Create plan
- `PUT /journey-plans/:id` - Update plan
- `DELETE /journey-plans/:id` - Delete plan

### Analytics (`/analytics`)
- `GET /analytics/sales` - Sales performance
- `GET /analytics/targets` - Target achievement
- `GET /analytics/visits` - Visit statistics

### File Management (`/upload`)
- `POST /upload/image` - Image upload to Cloudinary
- `POST /upload/document` - Document upload
- `GET /uploads/:filename` - File retrieval

## 🔧 Core Services

### TokenService (`lib/tokenService.js`)
- JWT token generation and validation
- Automatic token cleanup and blacklisting
- Refresh token management

### RedisService (`lib/redisService.js`)
- Session caching and management
- Rate limiting implementation
- Performance data storage

### ConnectionManager (`lib/connectionManager.js`)
- Database connection pooling
- Health monitoring and failover
- Connection optimization

### UploadService (`lib/uploadService.js`)
- Cloudinary integration
- Image optimization and resizing
- File type validation

## ⏰ Automated Tasks

### Cron Jobs
- **Auto-logout**: Daily at midnight (Nairobi time)
- **Token Cleanup**: Daily at 2 AM
- **Balance Checks**: Periodic aged balance monitoring

### Scheduled Operations
- Automatic session management
- Database maintenance tasks
- Performance monitoring

## 📈 Performance & Monitoring

### Health Checks
- `GET /health` - Basic system health
- `GET /health/database` - Database connectivity
- `GET /emergency/status` - Emergency mode status

### Monitoring Features
- Request/response logging with Morgan
- Performance metrics collection
- Error tracking and reporting
- Database query optimization

## 🛡️ Resilience Features

### Error Handling
- Comprehensive error middleware
- Graceful degradation
- Retry mechanisms for transient failures

### Rate Limiting
- Per-user request limiting
- Burst protection
- Configurable limits per endpoint

### Timeout Protection
- 30-second request timeout
- Database query timeouts
- Connection pool management

## 📁 File Structure Details

### Controllers
Business logic organized by domain:
- `authController.js` - Authentication and user management
- `orderController.js` - Order processing and management
- `productController.js` - Product catalog and inventory
- `journeyPlanController.js` - Route planning and visits
- `analyticsController.js` - Reporting and analytics
- `uploadController.js` - File upload handling

### Routes
API endpoint definitions:
- RESTful route organization
- Middleware integration
- Parameter validation

### Middleware
Request processing pipeline:
- `authMiddleware.js` - JWT authentication
- `roleAuth.js` - Role-based access control
- `resilienceMiddleware.js` - Performance and security

## 🔄 Development Workflow

### Code Organization
- Modular controller structure
- Service layer separation
- Consistent error handling
- Comprehensive logging

### Testing
- API endpoint testing
- Database integration tests
- Performance benchmarking

### Deployment
- Vercel-ready configuration
- Environment-specific settings
- Database migration management

## 📚 Additional Documentation

See the `docs/` directory for detailed API documentation:
- `flutter_client_requirements.md` - Client integration guide
- `error_handling.md` - Error handling patterns
- `targets.md` - Target management system
- `journey_plan_fetching.md` - Journey plan implementation

## 🤝 Contributing

1. Follow the existing code structure
2. Add comprehensive error handling
3. Include proper logging
4. Update documentation for new features
5. Test thoroughly before deployment

## 📞 Support

For technical support or questions about the API:
- Check the documentation in `docs/`
- Review error logs and monitoring data
- Contact the development team

---

**Version**: 1.0.0  
**Last Updated**: January 2025  
**Maintainer**: Whoosh Development Team 