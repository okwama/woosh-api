# Whoosh API Database Schema Documentation

## Overview

The Whoosh API uses MySQL as the primary database with Prisma ORM for data access. The schema is designed to support a comprehensive sales force automation system with multi-country support, inventory management, and business analytics.

## 🗄️ Database Configuration

### Connection Details
- **Provider**: MySQL
- **ORM**: Prisma Client
- **Connection Pooling**: Managed by Prisma
- **Migrations**: Version-controlled with Prisma Migrate

### Environment Variables
```env
DATABASE_URL="mysql://user:password@localhost:3306/whoosh_db"
SHADOW_DATABASE_URL="mysql://user:password@localhost:3306/whoosh_shadow"
```

## 📊 Core Entity Models

### SalesRep (Primary User Entity)

**Purpose**: Represents sales representatives and their organizational hierarchy.

```sql
model SalesRep {
  id                   Int                  @id @default(autoincrement())
  name                 String
  email                String               @unique
  phoneNumber          String               @unique
  password             String
  countryId            Int
  country              String
  region_id            Int
  region               String
  route_id             Int
  route                String               @db.VarChar(100)
  route_id_update      Int
  route_name_update    String               @db.VarChar(100)
  visits_targets       Int
  new_clients          Int
  vapes_targets        Int
  pouches_targets      Int
  role                 String?              @default("USER")
  manager_type         Int
  status               Int?                 @default(0)
  createdAt            DateTime             @default(now())
  updatedAt            DateTime             @updatedAt
  retail_manager       Int
  key_channel_manager  Int
  distribution_manager Int
  photoUrl             String?              @default("")
  managerId            Int?
  
  // Relationships
  countryRelation      Country              @relation(fields: [countryId], references: [id])
  Manager              Manager?
  ClientPayment        ClientPayment[]
  feedbackReports      FeedbackReport[]
  journeyPlans         JourneyPlan[]
  LoginHistory         LoginHistory[]
  MyOrder              MyOrder[]
  productReports       ProductReport[]
  productReturns       ProductReturn[]
  productReturnItems   ProductReturnItem[]
  productsSamples      ProductsSample[]
  productsSampleItems  ProductsSampleItem[]
  reports              Report[]
  SalesTargets         SalesTargets[]
  targets              Target[]
  tokens               Token[]
  UpliftSale           UpliftSale[]
  visibilityReports    VisibilityReport[]
  leaves               Leave[]
  Task                 Task[]

  // Indexes
  @@index([status, role], map: "idx_status_role")
  @@index([countryId, region_id, route_id], map: "idx_location")
  @@index([managerId], map: "idx_manager")
  @@index([countryId], map: "SalesRep_countryId_fkey")
}
```

**Key Features**:
- Multi-country support with regional assignments
- Role-based access control (USER, MANAGER, ADMIN)
- Target tracking for various metrics
- Hierarchical management structure
- Comprehensive activity tracking

### Product (Inventory Management)

**Purpose**: Manages product catalog with pricing and inventory tracking.

```sql
model Product {
  id              Int               @id @default(autoincrement())
  name            String
  description     String?
  category        String?
  imageUrl        String?
  status          Int               @default(0)
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt
  
  // Relationships
  ProductDetails  ProductDetails[]
  StoreQuantity   StoreQuantity[]
  OrderItem       OrderItem[]
  priceOptions    PriceOption[]
  productReturns  ProductReturnItem[]
  productSamples  ProductsSampleItem[]
  productReports  ProductReport[]
  purchaseItems   PurchaseItem[]
  purchaseHistory PurchaseHistory[]
  stockTake       stock_take[]
  stockTransfer   stock_transfer[]
  purchaseOrders  PurchaseOrderItems[]
  
  // Indexes
  @@index([status], map: "idx_product_status")
  @@index([category], map: "idx_product_category")
}
```

**Key Features**:
- Multi-currency pricing support
- Category-based organization
- Stock level tracking across stores
- Purchase and sales history
- Return and sample management

### MyOrder (Order Management)

**Purpose**: Handles order processing and workflow management.

```sql
model MyOrder {
  id                Int         @id @default(autoincrement())
  orderNumber       String      @unique
  salesRepId        Int
  clientId          Int
  totalAmount       Decimal     @db.Decimal(10, 2)
  status            String      @default("PENDING")
  paymentStatus     String      @default("PENDING")
  deliveryDate      DateTime?
  notes             String?
  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt
  taxAmount         Decimal?    @db.Decimal(10, 2)
  discountAmount    Decimal?    @db.Decimal(10, 2)
  grandTotal        Decimal?    @db.Decimal(10, 2)
  currency          String?     @default("KES")
  exchangeRate      Decimal?    @db.Decimal(10, 4)
  localAmount       Decimal?    @db.Decimal(10, 2)
  localCurrency     String?
  taxPin            String?
  taxPinLabel       String?
  countryCode       String?
  
  // Relationships
  salesRep          SalesRep    @relation(fields: [salesRepId], references: [id], onDelete: Cascade)
  client            Clients     @relation(fields: [clientId], references: [id])
  orderItems        OrderItem[]
  
  // Indexes
  @@index([salesRepId], map: "MyOrder_salesRepId_fkey")
  @@index([clientId], map: "MyOrder_clientId_fkey")
  @@index([status], map: "idx_order_status")
  @@index([createdAt], map: "idx_order_created")
}
```

**Key Features**:
- Multi-currency support with exchange rates
- Tax calculation and PIN tracking
- Status-based workflow management
- Comprehensive order history
- Client and sales rep associations

### JourneyPlan (Route Planning)

**Purpose**: Manages sales representative route planning and visit scheduling.

```sql
model JourneyPlan {
  id          Int       @id @default(autoincrement())
  salesRepId  Int
  date        DateTime  @db.Date
  status      String    @default("PLANNED")
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  notes       String?
  
  // Relationships
  salesRep    SalesRep  @relation(fields: [salesRepId], references: [id], onDelete: Cascade)
  
  // Indexes
  @@index([salesRepId], map: "JourneyPlan_salesRepId_fkey")
  @@index([date], map: "idx_journey_date")
  @@index([status], map: "idx_journey_status")
}
```

**Key Features**:
- Date-based planning
- Status tracking (PLANNED, COMPLETED, CANCELLED)
- Sales rep assignment
- Visit scheduling and management

## 🔐 Authentication & Security Models

### Token (JWT Management)

**Purpose**: Manages JWT tokens for authentication and session management.

```sql
model Token {
  id          Int       @id @default(autoincrement())
  token       String    @db.VarChar(255)
  salesRepId  Int
  createdAt   DateTime  @default(now())
  expiresAt   DateTime
  blacklisted Boolean   @default(false)
  lastUsedAt  DateTime?
  tokenType   String    @default("access") @db.VarChar(10)
  
  // Relationships
  user        SalesRep  @relation(fields: [salesRepId], references: [id], onDelete: Cascade)
  
  // Indexes
  @@index([salesRepId, tokenType, blacklisted, expiresAt], map: "idx_token_lookup")
  @@index([expiresAt, blacklisted], map: "idx_token_cleanup")
  @@index([token(length: 64)], map: "idx_token_value")
  @@index([salesRepId], map: "Token_userId_fkey")
}
```

**Key Features**:
- Token blacklisting for security
- Automatic expiration management
- Token type differentiation (access/refresh)
- Usage tracking and cleanup

### LoginHistory (Session Tracking)

**Purpose**: Tracks user login sessions and activity.

```sql
model LoginHistory {
  id           Int       @id @default(autoincrement())
  userId       Int
  loginAt      DateTime  @default(now())
  logoutAt     DateTime?
  isLate       Boolean?  @default(false)
  isEarly      Boolean?  @default(false)
  timezone     String?   @default("UTC")
  shiftStart   DateTime?
  shiftEnd     DateTime?
  duration     Int?
  status       String?   @default("ACTIVE")
  sessionEnd   String?
  sessionStart String?
  
  // Relationships
  user         SalesRep  @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  // Indexes
  @@index([userId])
  @@index([loginAt])
  @@index([logoutAt])
}
```

**Key Features**:
- Comprehensive session tracking
- Time zone support
- Shift management
- Attendance monitoring

## 🏪 Business Entity Models

### Clients (Customer Management)

**Purpose**: Manages customer/client information and relationships.

```sql
model Clients {
  id              Int             @id @default(autoincrement())
  name            String
  email           String?
  phoneNumber     String?
  address         String?
  countryId       Int
  regionId        Int?
  status          Int             @default(0)
  clientType      Int?
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt
  taxPin          String?
  taxPinLabel     String?
  creditLimit     Decimal?        @db.Decimal(10, 2)
  balance         Decimal?        @db.Decimal(10, 2)
  currency        String?         @default("KES")
  
  // Relationships
  country         Country         @relation(fields: [countryId], references: [id])
  region          Regions?        @relation(fields: [regionId], references: [id])
  orders          MyOrder[]
  payments        ClientPayment[]
  history         clientHistory[]
  
  // Indexes
  @@index([countryId], map: "Clients_countryId_fkey")
  @@index([regionId], map: "Clients_regionId_fkey")
  @@index([status], map: "idx_client_status")
}
```

**Key Features**:
- Multi-country client support
- Tax information tracking
- Credit limit and balance management
- Regional organization
- Payment history tracking

### Stores (Location Management)

**Purpose**: Manages store locations and inventory distribution.

```sql
model Stores {
  id              Int               @id @default(autoincrement())
  name            String
  regionId        Int?
  client_type     Int?
  countryId       Int
  region_id       Int?
  status          Int               @default(0)
  
  // Relationships
  region          Regions?          @relation(fields: [regionId], references: [id])
  country         Country           @relation(fields: [countryId], references: [id])
  ProductDetails  ProductDetails[]
  purchase        Purchase[]
  purchaseHistory PurchaseHistory[]
  storeQuantities StoreQuantity[]
  transfersFrom   TransferHistory[] @relation("FromStore")
  transfersTo     TransferHistory[] @relation("ToStore")
  
  // Indexes
  @@index([regionId], map: "Stores_regionId_fkey")
  @@index([countryId], map: "Stores_countryId_fkey")
  @@index([status], map: "idx_store_status")
}
```

**Key Features**:
- Regional and country organization
- Inventory tracking
- Transfer management
- Purchase history

## 📊 Analytics & Reporting Models

### Report (General Reporting)

**Purpose**: Stores various types of business reports and analytics data.

```sql
model Report {
  id          Int        @id @default(autoincrement())
  salesRepId  Int
  reportType  ReportType
  title       String
  content     String     @db.Text
  data        Json?
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
  
  // Relationships
  salesRep    SalesRep   @relation(fields: [salesRepId], references: [id], onDelete: Cascade)
  
  // Indexes
  @@index([salesRepId], map: "Report_salesRepId_fkey")
  @@index([reportType], map: "idx_report_type")
  @@index([createdAt], map: "idx_report_created")
}

enum ReportType {
  SALES
  INVENTORY
  VISITS
  TARGETS
  PERFORMANCE
  CUSTOM
}
```

### Target (Goal Management)

**Purpose**: Manages sales targets and goal tracking.

```sql
model Target {
  id            Int      @id @default(autoincrement())
  salesRepId    Int
  isCurrent     Boolean  @default(false)
  targetValue   Int
  achievedValue Int      @default(0)
  achieved      Boolean  @default(false)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  // Relationships
  salesRep      SalesRep @relation(fields: [salesRepId], references: [id], onDelete: Cascade)
  
  // Indexes
  @@index([salesRepId], map: "Target_salesRepId_fkey")
}
```

## 🔄 Transaction Models

### OrderItem (Order Line Items)

**Purpose**: Manages individual items within orders.

```sql
model OrderItem {
  id          Int      @id @default(autoincrement())
  orderId     Int
  productId   Int
  quantity    Int
  unitPrice   Decimal  @db.Decimal(10, 2)
  totalPrice  Decimal  @db.Decimal(10, 2)
  priceOptionId Int?
  
  // Relationships
  order       MyOrder     @relation(fields: [orderId], references: [id], onDelete: Cascade)
  product     Product     @relation(fields: [productId], references: [id])
  priceOption PriceOption? @relation(fields: [priceOptionId], references: [id])
  
  // Indexes
  @@index([orderId], map: "OrderItem_orderId_fkey")
  @@index([productId], map: "OrderItem_productId_fkey")
}
```

### ClientPayment (Payment Tracking)

**Purpose**: Tracks client payments and financial transactions.

```sql
model ClientPayment {
  id          Int       @id @default(autoincrement())
  clientId    Int
  salesRepId  Int
  amount      Decimal   @db.Decimal(10, 2)
  paymentDate DateTime  @default(now())
  paymentType String?
  reference   String?
  notes       String?
  
  // Relationships
  client      Clients   @relation(fields: [clientId], references: [id])
  salesRep    SalesRep  @relation(fields: [salesRepId], references: [id])
  
  // Indexes
  @@index([clientId], map: "ClientPayment_clientId_fkey")
  @@index([salesRepId], map: "ClientPayment_salesRepId_fkey")
}
```

## 📁 File Management Models

### Leave (Document Management)

**Purpose**: Manages leave requests and document uploads.

```sql
model Leave {
  id          Int       @id @default(autoincrement())
  salesRepId  Int
  leaveType   String
  startDate   DateTime
  endDate     DateTime
  reason      String?
  status      String    @default("PENDING")
  documentUrl String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  
  // Relationships
  salesRep    SalesRep  @relation(fields: [salesRepId], references: [id], onDelete: Cascade)
  
  // Indexes
  @@index([salesRepId], map: "Leave_salesRepId_fkey")
  @@index([status], map: "idx_leave_status")
}
```

## 🔧 Configuration Models

### Country (Geographic Configuration)

**Purpose**: Manages country-specific configurations and settings.

```sql
model Country {
  id       Int        @id @default(autoincrement())
  name     String
  status   Int?       @default(0)
  
  // Relationships
  clients  Clients[]
  regions  Regions[]
  salesRep SalesRep[]
  stores   Stores[]
  
  // Indexes
  @@index([status], map: "idx_country_status")
}
```

### Regions (Regional Configuration)

**Purpose**: Manages regional configurations within countries.

```sql
model Regions {
  id        Int      @id @default(autoincrement())
  name      String
  countryId Int
  status    Int?     @default(0)
  
  // Relationships
  country   Country  @relation(fields: [countryId], references: [id])
  Stores    Stores[]
  
  // Indexes
  @@unique([name, countryId])
  @@index([countryId], map: "Regions_countryId_fkey")
}
```

## 📈 Performance Optimization

### Strategic Indexing

**Primary Indexes**:
- Foreign key relationships for join performance
- Status fields for filtering
- Date fields for temporal queries
- Unique constraints for data integrity

**Composite Indexes**:
- `[status, role]` for user filtering
- `[countryId, region_id, route_id]` for location-based queries
- `[salesRepId, tokenType, blacklisted, expiresAt]` for token lookups

### Query Optimization

**Best Practices**:
- Use Prisma's query optimization features
- Implement pagination for large datasets
- Cache frequently accessed data
- Use database views for complex queries

## 🔄 Data Migration Strategy

### Migration Management

**Prisma Migrate**:
- Version-controlled schema changes
- Automatic migration generation
- Rollback capabilities
- Shadow database for testing

**Migration Best Practices**:
- Test migrations on shadow database
- Backup production data before migration
- Use transactions for data consistency
- Monitor migration performance

## 📊 Data Backup and Recovery

### Backup Strategy

**Automated Backups**:
- Daily full database backups
- Transaction log backups
- Point-in-time recovery capability
- Cross-region backup replication

**Recovery Procedures**:
- Documented recovery processes
- Regular recovery testing
- Minimal downtime procedures
- Data integrity verification

---

**Schema Version**: 1.0  
**Last Updated**: January 2025  
**Maintainer**: Whoosh Development Team 