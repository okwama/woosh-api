# Flutter Implementation Summary - Targets API

## Server Implementation Status ✅

### What the Server is Doing:

1. **Authentication**: JWT-based with access/refresh token pattern
2. **Database**: MySQL with Prisma ORM
3. **Product Classification**: Category ID-based (1,3 = vapes, 4,5 = pouches)
4. **Target Tracking**: Visit targets, new clients, product sales
5. **Real-time Calculations**: Progress percentages and status updates

### Available Endpoints:

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/api/targets` | GET | All targets with progress | ✅ Working |
| `/api/targets/daily-visits/{userId}` | GET | Daily visit tracking | ✅ Working |
| `/api/targets/monthly-visits/{userId}` | GET | Monthly visit reports | ✅ Working |
| `/api/targets/clients/{userId}/progress` | GET | New clients tracking | ✅ Working |
| `/api/targets/products/{userId}/progress` | GET | Vapes/pouches sales | ✅ Working |
| `/api/targets/dashboard/{userId}` | GET | Combined dashboard | ✅ Working |
| `/api/targets/team/{managerId}/performance` | GET | Team overview | ✅ Working |
| `/api/targets/categories/mapping` | GET | Category configuration | ✅ Working |
| `/api/targets/targets/{userId}` | PUT | Update targets | ✅ Working |

---

## Flutter Client Implementation Requirements

### 1. **Authentication Setup**

```dart
// Required: JWT token management
class AuthService {
  String? _accessToken;
  String? _refreshToken;
  
  Map<String, String> get headers => {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer $_accessToken',
  };
  
  // Handle token refresh when 401 received
  Future<void> refreshToken() async {
    // Implementation needed
  }
}
```

### 2. **Core Service Class**

```dart
class TargetsService {
  static const String _baseUrl = 'https://your-api-domain.com/api/targets';
  final AuthService _authService;
  
  TargetsService(this._authService);
  
  // Dashboard - Main screen
  Future<SalesRepDashboard> getDashboard(int userId, {String period = 'current_month'}) async {
    // Implementation needed
  }
  
  // Individual metrics
  Future<VisitTargets> getDailyVisits(int userId, {String? date}) async {
    // Implementation needed
  }
  
  Future<NewClientsProgress> getNewClients(int userId, {String? period}) async {
    // Implementation needed
  }
  
  Future<ProductSalesProgress> getProductSales(int userId, {String productType = 'all'}) async {
    // Implementation needed
  }
  
  // Team management (for managers)
  Future<TeamPerformance> getTeamPerformance(int managerId, {String period = 'current_month'}) async {
    // Implementation needed
  }
  
  // Target management
  Future<UpdateTargetsResponse> updateTargets(int userId, {
    int? vapesTargets,
    int? pouchesTargets,
    int? newClientsTarget,
    int? visitsTargets,
  }) async {
    // Implementation needed
  }
}
```

### 3. **Model Classes Required**

```dart
// Core models needed:
class SalesRepDashboard
class VisitTargets
class NewClientsProgress
class ProductSalesProgress
class ProductSummary
class ProductMetric
class ProductBreakdown
class TeamPerformance
class UpdateTargetsResponse
class CategoryMapping
```

### 4. **UI Components Needed**

#### Dashboard Screen
- **Purpose**: Main performance overview
- **Features**: 
  - Visit progress card
  - New clients progress card
  - Product sales progress cards
  - Pull-to-refresh
  - Period selector (current_month, last_month, current_year)

#### Individual Metric Screens
- **Visit Targets Screen**: Daily/monthly visit tracking
- **New Clients Screen**: Client acquisition tracking
- **Product Sales Screen**: Vapes/pouches sales with breakdown

#### Management Screens
- **Target Management**: Update sales rep targets
- **Team Overview**: Manager view of team performance
- **Category Configuration**: View product classification

### 5. **State Management**

```dart
// Recommended: Riverpod or Bloc
final dashboardProvider = FutureProvider.family<SalesRepDashboard, int>((ref, userId) async {
  final service = ref.read(targetsServiceProvider);
  return service.getDashboard(userId);
});

final productSalesProvider = FutureProvider.family<ProductSalesProgress, ({int userId, String productType})>((ref, params) async {
  final service = ref.read(targetsServiceProvider);
  return service.getProductSales(params.userId, productType: params.productType);
});
```

### 6. **Error Handling**

```dart
class TargetsApiException implements Exception {
  final String message;
  final int? statusCode;
  
  TargetsApiException(this.message, [this.statusCode]);
}

// Handle specific error cases:
// - 401: Token expired, refresh needed
// - 404: Resource not found
// - 500: Server error
// - Network errors: No connection
```

### 7. **Performance Optimizations**

#### Caching Strategy
```dart
class CachedTargetsService {
  final Map<String, CacheEntry> _cache = {};
  
  Future<T> getCached<T>(String key, Future<T> Function() fetcher) async {
    if (_cache.containsKey(key)) {
      final entry = _cache[key]!;
      if (DateTime.now().difference(entry.timestamp).inMinutes < 5) {
        return entry.data as T;
      }
    }
    
    final data = await fetcher();
    _cache[key] = CacheEntry(data, DateTime.now());
    return data;
  }
}
```

#### Periodic Updates
```dart
class DashboardController extends StateNotifier<AsyncValue<SalesRepDashboard>> {
  Timer? _timer;
  
  void startPeriodicUpdates(int userId) {
    _timer = Timer.periodic(Duration(minutes: 2), (_) {
      _loadDashboard(userId);
    });
  }
}
```

---

## Implementation Priority

### Phase 1: Core Dashboard (High Priority)
1. ✅ Authentication service
2. ✅ TargetsService class
3. ✅ Dashboard screen with basic metrics
4. ✅ Error handling

### Phase 2: Individual Metrics (Medium Priority)
1. ✅ Visit targets screen
2. ✅ New clients screen
3. ✅ Product sales screen
4. ✅ Pull-to-refresh functionality

### Phase 3: Management Features (Low Priority)
1. ✅ Target management screen
2. ✅ Team performance screen
3. ✅ Category mapping screen
4. ✅ Advanced filtering

---

## Key Implementation Notes

### 1. **Product Classification**
- Server uses category IDs: 1,3 = vapes, 4,5 = pouches
- Fallback to name-based matching if category_id not set
- Use `/api/targets/categories/mapping` to get current configuration

### 2. **Date Handling**
- All dates in ISO format: `YYYY-MM-DD`
- Period options: `current_month`, `last_month`, `current_year`
- Server calculates date ranges automatically

### 3. **Progress Calculation**
- Server calculates all progress percentages
- Status: "Target Achieved" or "In Progress"
- Progress values are integers (0-100)

### 4. **Authentication**
- JWT tokens required for all endpoints
- Handle 401 responses with token refresh
- Include Bearer token in Authorization header

### 5. **Error Scenarios**
- Network connectivity issues
- Token expiration
- Invalid user IDs
- Server errors
- Missing data

---

## Testing Checklist

### API Integration Tests
- [ ] Authentication flow
- [ ] Dashboard loading
- [ ] Individual metric endpoints
- [ ] Error handling
- [ ] Token refresh

### UI Tests
- [ ] Dashboard displays correctly
- [ ] Progress indicators work
- [ ] Pull-to-refresh functionality
- [ ] Error states display properly
- [ ] Loading states show correctly

### Performance Tests
- [ ] Caching works as expected
- [ ] Periodic updates don't cause memory leaks
- [ ] Large data sets handle gracefully
- [ ] Network timeouts handled properly

---

## Server Configuration Notes

### Environment Variables Needed
```env
DATABASE_URL=mysql://user:pass@localhost:3306/dbname
JWT_SECRET=your-secret-key
SHADOW_DATABASE_URL=mysql://user:pass@localhost:3306/shadow_db
```

### Database Requirements
- MySQL database with Prisma schema
- Products table with category_id field
- SalesRep table with target fields
- Clients table with added_by field
- Orders and OrderItems tables

### Category Setup
- Ensure categories with IDs 1,3 are vape-related
- Ensure categories with IDs 4,5 are pouch-related
- Use category mapping endpoint to verify configuration 