# Whoosh API Documentation

## Table of Contents
1. [Authentication](#authentication)
2. [User Management](#user-management)
3. [Order Management](#order-management)
4. [Product Management](#product-management)
5. [Journey Planning](#journey-planning)
6. [Analytics & Reporting](#analytics--reporting)
7. [File Management](#file-management)
8. [Target Management](#target-management)
9. [Session Management](#session-management)
10. [Error Handling](#error-handling)

## Authentication
# Database connection

# DATABASE_URL="mysql://citlogis_bryan:Daraja@2016@209.38.215.188:3306/citlogis_ws"
DATABASE_URL="mysql://citlogis_bryan:@bo9511221.qwerty@102.218.215.35/citlogis_ws"
SHADOW_DATABASE_URL="mysql://citlogis_bryan:@bo9511221.qwerty@102.218.215.35/citlogis_maashadow"
BACKUP_DATABASE_URL="mysql://citlogis_bryan:@bo9511221.qwerty@102.218.215.35/citlogis_ws"



JWT_SECRET="14d654d54283e592a412c2de2cc40b439c6d63fc9406e270650201b5aba6a73f99a345341694cc5bb5a3e09ff85ccb49ce7f49f2e89a9362ea61fc9558968c47"


IMAGEKIT_ID="bja2qwwdjjy"
IMAGEKIT_PUBLIC_KEY="public_VSmeDjIyBNYCunNXLYVbXIOzP/k="
IMAGEKIT_PRIVATE_KEY="private_53IH5urzpkD6OKAoJj1aIfmsQks="
IMAGEKIT_URL_ENDPOINT="https://ik.imagekit.io/bja2qwwdjjy"
CONVERT_TO_BASE64="true"

CLOUDINARY_CLOUD_NAME=otienobryan
CLOUDINARY_API_KEY=825231187287193
CLOUDINARY_API_SECRET=BSFpWhpwt3RrNaxnZjWv7WFNwvY

# Redis Configuration
REDIS_HOST=redis-10907.c341.af-south-1-1.ec2.redns.redis-cloud.com
REDIS_PORT=10907
REDIS_PASSWORD=Y9kMERTRRuchYLN1GGbZneBmMgScqXDX
REDIS_URL=redis://default:Y9kMERTRRuchYLN1GGbZneBmMgScqXDX@redis-10907.c341.af-south-1-1.ec2.redns.redis-cloud.com:10907



### Login
**POST** `/auth/login`

Authenticate a user and receive access tokens.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "name": "John Doe",
      "email": "user@example.com",
      "role": "USER",
      "country": "Kenya",
      "region": "Nairobi"
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  }
}
```

### Refresh Token
**POST** `/auth/refresh`

Refresh an expired access token using a valid refresh token.

**Request Body:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### Logout
**POST** `/auth/logout`

Logout user and blacklist current tokens.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

## User Management

### Get User Profile
**GET** `/profile`

Retrieve current user's profile information.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "John Doe",
    "email": "user@example.com",
    "phoneNumber": "+254700000000",
    "country": "Kenya",
    "region": "Nairobi",
    "route": "Route A",
    "role": "USER",
    "photoUrl": "https://res.cloudinary.com/...",
    "targets": {
      "visits_targets": 100,
      "new_clients": 20,
      "vapes_targets": 50,
      "pouches_targets": 30
    }
  }
}
```

### Update Profile
**PUT** `/profile`

Update user profile information.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "name": "John Doe Updated",
  "phoneNumber": "+254700000001",
  "photoUrl": "https://res.cloudinary.com/..."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "John Doe Updated",
    "email": "user@example.com",
    "phoneNumber": "+254700000001",
    "photoUrl": "https://res.cloudinary.com/..."
  }
}
```

## Order Management

### Get Orders
**GET** `/orders`

Retrieve paginated list of orders.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Query Parameters:**
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 10)
- `status` (string): Filter by order status
- `startDate` (string): Filter by start date (YYYY-MM-DD)
- `endDate` (string): Filter by end date (YYYY-MM-DD)

**Response:**
```json
{
  "success": true,
  "data": {
    "orders": [
      {
        "id": 1,
        "orderNumber": "ORD-2025-001",
        "clientName": "Store ABC",
        "totalAmount": 15000,
        "status": "PENDING",
        "createdAt": "2025-01-15T10:30:00Z",
        "items": [
          {
            "productName": "Product A",
            "quantity": 5,
            "unitPrice": 3000,
            "totalPrice": 15000
          }
        ]
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "totalItems": 50,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```

### Create Order
**POST** `/orders`

Create a new order.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "clientId": 1,
  "items": [
    {
      "productId": 1,
      "quantity": 5,
      "unitPrice": 3000
    },
    {
      "productId": 2,
      "quantity": 3,
      "unitPrice": 2000
    }
  ],
  "notes": "Urgent delivery required"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "orderNumber": "ORD-2025-001",
    "totalAmount": 21000,
    "status": "PENDING",
    "createdAt": "2025-01-15T10:30:00Z"
  }
}
```

### Update Order
**PUT** `/orders/:id`

Update an existing order.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "status": "CONFIRMED",
  "notes": "Updated delivery notes"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "status": "CONFIRMED",
    "updatedAt": "2025-01-15T11:00:00Z"
  }
}
```

## Product Management

### Get Products
**GET** `/products`

Retrieve product catalog with pagination.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Query Parameters:**
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 20)
- `category` (string): Filter by category
- `search` (string): Search by product name
- `inStock` (boolean): Filter by stock availability

**Response:**
```json
{
  "success": true,
  "data": {
    "products": [
      {
        "id": 1,
        "name": "Product A",
        "description": "High-quality product",
        "category": "Electronics",
        "priceOptions": [
          {
            "option": "Regular",
            "value": 3000
          },
          {
            "option": "Premium",
            "value": 5000
          }
        ],
        "stockLevel": 100,
        "imageUrl": "https://res.cloudinary.com/..."
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 3,
      "totalItems": 60
    }
  }
}
```

### Get Product Details
**GET** `/products/:id`

Retrieve detailed information about a specific product.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Product A",
    "description": "High-quality product description",
    "category": "Electronics",
    "priceOptions": [
      {
        "id": 1,
        "option": "Regular",
        "value": 3000,
        "value_ngn": 150000,
        "value_tzs": 7500000
      }
    ],
    "stockLevel": 100,
    "imageUrl": "https://res.cloudinary.com/...",
    "storeQuantities": [
      {
        "storeName": "Store ABC",
        "quantity": 50
      }
    ]
  }
}
```

## Journey Planning

### Get Journey Plans
**GET** `/journey-plans`

Retrieve user's journey plans.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Query Parameters:**
- `date` (string): Filter by date (YYYY-MM-DD)
- `status` (string): Filter by status (PLANNED, COMPLETED, CANCELLED)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "date": "2025-01-15",
      "status": "PLANNED",
      "visits": [
        {
          "id": 1,
          "storeName": "Store ABC",
          "plannedTime": "09:00",
          "actualTime": null,
          "status": "PLANNED",
          "location": {
            "latitude": -1.2921,
            "longitude": 36.8219
          }
        }
      ],
      "totalVisits": 5,
      "completedVisits": 0
    }
  ]
}
```

### Create Journey Plan
**POST** `/journey-plans`

Create a new journey plan.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "date": "2025-01-16",
  "visits": [
    {
      "storeId": 1,
      "plannedTime": "09:00",
      "notes": "Morning visit"
    },
    {
      "storeId": 2,
      "plannedTime": "14:00",
      "notes": "Afternoon visit"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 2,
    "date": "2025-01-16",
    "status": "PLANNED",
    "totalVisits": 2
  }
}
```

### Update Journey Plan
**PUT** `/journey-plans/:id`

Update an existing journey plan.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "status": "COMPLETED",
  "visits": [
    {
      "id": 1,
      "actualTime": "09:15",
      "status": "COMPLETED"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "status": "COMPLETED",
    "completedVisits": 1
  }
}
```

## Analytics & Reporting

### Sales Analytics
**GET** `/analytics/sales`

Retrieve sales performance analytics.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Query Parameters:**
- `period` (string): Time period (daily, weekly, monthly, yearly)
- `startDate` (string): Start date (YYYY-MM-DD)
- `endDate` (string): End date (YYYY-MM-DD)

**Response:**
```json
{
  "success": true,
  "data": {
    "totalSales": 150000,
    "totalOrders": 25,
    "averageOrderValue": 6000,
    "topProducts": [
      {
        "productName": "Product A",
        "quantity": 50,
        "revenue": 150000
      }
    ],
    "salesByDate": [
      {
        "date": "2025-01-15",
        "sales": 30000,
        "orders": 5
      }
    ]
  }
}
```

### Target Achievement
**GET** `/analytics/targets`

Retrieve target achievement analytics.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "visits": {
      "target": 100,
      "achieved": 75,
      "percentage": 75
    },
    "newClients": {
      "target": 20,
      "achieved": 15,
      "percentage": 75
    },
    "vapes": {
      "target": 50,
      "achieved": 40,
      "percentage": 80
    },
    "pouches": {
      "target": 30,
      "achieved": 25,
      "percentage": 83.33
    }
  }
}
```

## File Management

### Upload Image
**POST** `/upload/image`

Upload an image to Cloudinary.

**Headers:**
```
Authorization: Bearer <access_token>
Content-Type: multipart/form-data
```

**Form Data:**
- `image` (file): Image file to upload
- `folder` (string, optional): Cloudinary folder name

**Response:**
```json
{
  "success": true,
  "data": {
    "url": "https://res.cloudinary.com/cloud_name/image/upload/v1234567890/folder/image.jpg",
    "publicId": "folder/image",
    "format": "jpg",
    "size": 1024000
  }
}
```

### Upload Document
**POST** `/upload/document`

Upload a document file.

**Headers:**
```
Authorization: Bearer <access_token>
Content-Type: multipart/form-data
```

**Form Data:**
- `document` (file): Document file to upload
- `category` (string): Document category

**Response:**
```json
{
  "success": true,
  "data": {
    "filename": "document_1234567890.pdf",
    "url": "/uploads/documents/document_1234567890.pdf",
    "size": 2048000,
    "category": "reports"
  }
}
```

## Target Management

### Get Targets
**GET** `/targets`

Retrieve user's current targets.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "current": {
      "id": 1,
      "targetValue": 100000,
      "achievedValue": 75000,
      "achieved": false,
      "createdAt": "2025-01-01T00:00:00Z"
    },
    "history": [
      {
        "id": 2,
        "targetValue": 80000,
        "achievedValue": 85000,
        "achieved": true,
        "createdAt": "2024-12-01T00:00:00Z"
      }
    ]
  }
}
```

### Update Target
**PUT** `/targets/:id`

Update a target.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "targetValue": 120000,
  "achievedValue": 80000
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "targetValue": 120000,
    "achievedValue": 80000,
    "achieved": false,
    "updatedAt": "2025-01-15T12:00:00Z"
  }
}
```

## Session Management

### Get Session Info
**GET** `/session`

Retrieve current session information.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sessionId": "session_123",
    "loginTime": "2025-01-15T08:00:00Z",
    "lastActivity": "2025-01-15T12:00:00Z",
    "deviceInfo": "Mobile App v1.0",
    "isActive": true
  }
}
```

### End Session
**POST** `/session/end`

End current session.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "message": "Session ended successfully"
}
```

## Error Handling

### Error Response Format

All API endpoints return errors in a consistent format:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": [
      {
        "field": "email",
        "message": "Email is required"
      }
    ]
  }
}
```

### Common Error Codes

- `AUTHENTICATION_ERROR`: Invalid or missing authentication
- `AUTHORIZATION_ERROR`: Insufficient permissions
- `VALIDATION_ERROR`: Invalid request data
- `NOT_FOUND`: Resource not found
- `CONFLICT`: Resource conflict
- `RATE_LIMIT_EXCEEDED`: Too many requests
- `INTERNAL_SERVER_ERROR`: Server error

### Rate Limiting

- **Standard endpoints**: 100 requests per minute
- **Authentication endpoints**: 10 requests per minute
- **File upload endpoints**: 20 requests per minute

### Pagination

All list endpoints support pagination with the following parameters:
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10, max: 100)

Response includes pagination metadata:
```json
{
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalItems": 50,
    "hasNext": true,
    "hasPrev": false
  }
}
```

---

**Note**: All timestamps are in ISO 8601 format (UTC). Authentication tokens should be included in the `Authorization` header as `Bearer <token>`. 