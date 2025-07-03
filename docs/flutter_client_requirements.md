# Flutter Client Implementation Requirements

## Server Status ✅

The server is fully implemented with the following features:

### Available Endpoints:
- `GET /api/targets` - All targets with progress
- `GET /api/targets/daily-visits/{userId}` - Daily visit tracking  
- `GET /api/targets/monthly-visits/{userId}` - Monthly visit reports
- `GET /api/targets/clients/{userId}/progress` - New clients tracking (count only)
- `GET /api/targets/clients/{userId}/details` - New clients details (id, name, address, date)
- `GET /api/targets/products/{userId}/progress` - Vapes/pouches sales
- `GET /api/targets/dashboard/{userId}` - Combined dashboard
- `GET /api/targets/team/{managerId}/performance` - Team overview
- `GET /api/targets/categories/mapping` - Category configuration
- `PUT /api/targets/targets/{userId}` - Update targets

### Key Features:
- JWT authentication with refresh tokens
- Product classification by category IDs (1,3=vapes, 4,5=pouches)
- Real-time progress calculations
- Period-based filtering (current_month, last_month, current_year)
- Comprehensive error handling

## Flutter Implementation Requirements

### 1. Authentication Service
```dart
class AuthService {
  String? _accessToken;
  String? _refreshToken;
  
  Map<String, String> get headers => {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer $_accessToken',
  };
  
  Future<void> refreshToken() async {
    // Handle 401 responses
  }
}
```

### 2. Targets Service
```dart
class TargetsService {
  static const String _baseUrl = 'https://your-api-domain.com/api/targets';
  
  // Main dashboard
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
  
  Future<NewClientsDetails> getNewClientsDetails(int userId, {String? period}) async {
    // Implementation needed
  }
  
  Future<ProductSalesProgress> getProductSales(int userId, {String productType = 'all'}) async {
    // Implementation needed
  }
  
  // Team management
  Future<TeamPerformance> getTeamPerformance(int managerId, {String period = 'current_month'}) async {
    // Implementation needed
  }
  
  // Target updates
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

### 3. Required Model Classes
```dart
class SalesRepDashboard {
  final int userId;
  final String period;
  final VisitTargets visitTargets;
  final NewClientsProgress newClients;
  final ProductSalesProgress productSales;
  final DateTime generatedAt;
}

class VisitTargets {
  final int userId;
  final String date;
  final int visitTarget;
  final int completedVisits;
  final int remainingVisits;
  final int progress;
  final String status;
}

class NewClientsProgress {
  final int userId;
  final String salesRepName;
  final String period;
  final Map<String, String> dateRange;
  final int newClientsTarget;
  final int newClientsAdded;
  final int remainingClients;
  final int progress;
  final String status;
}

class NewClientsDetails {
  final int userId;
  final String period;
  final Map<String, String> dateRange;
  final int totalNewClients;
  final List<ClientDetail> newClients;
  final DateTime generatedAt;
}

class ClientDetail {
  final int id;
  final String name;
  final String contact;
  final String region;
  final String? routeName;
  final int? clientType;
  final DateTime createdAt;
  final int status;
}

class ProductSalesProgress {
  final int userId;
  final String salesRepName;
  final String period;
  final Map<String, String> dateRange;
  final ProductSummary summary;
  final List<ProductBreakdown> productBreakdown;
}

class ProductSummary {
  final int totalOrders;
  final int totalQuantitySold;
  final ProductMetric vapes;
  final ProductMetric pouches;
}

class ProductMetric {
  final int target;
  final int sold;
  final int remaining;
  final int progress;
  final String status;
}
```

### 4. UI Components Needed

#### Dashboard Screen
- Progress cards for visits, new clients, and product sales
- Pull-to-refresh functionality
- Period selector (current_month, last_month, current_year)
- Error handling and loading states

#### Individual Metric Screens
- Visit targets with daily/monthly views
- New clients tracking with date ranges
- Product sales with vapes/pouches breakdown

#### Management Screens
- Target management for updating goals
- Team performance overview for managers
- Category configuration viewer

### 5. State Management
```dart
// Using Riverpod
final dashboardProvider = FutureProvider.family<SalesRepDashboard, int>((ref, userId) async {
  final service = ref.read(targetsServiceProvider);
  return service.getDashboard(userId);
});

final productSalesProvider = FutureProvider.family<ProductSalesProgress, ({int userId, String productType})>((ref, params) async {
  final service = ref.read(targetsServiceProvider);
  return service.getProductSales(params.userId, productType: params.productType);
});
```

### 6. Error Handling
```dart
class TargetsApiException implements Exception {
  final String message;
  final int? statusCode;
  
  TargetsApiException(this.message, [this.statusCode]);
}

// Handle specific cases:
// - 401: Token expired, refresh needed
// - 404: Resource not found
// - 500: Server error
// - Network errors: No connection
```

### 7. Performance Optimizations

#### Caching
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

## Implementation Priority

### Phase 1: Core Dashboard (High Priority)
1. Authentication service with JWT handling
2. TargetsService class with all endpoints
3. Dashboard screen with basic metrics
4. Error handling and loading states

### Phase 2: Individual Metrics (Medium Priority)
1. Visit targets screen
2. New clients screen
3. Product sales screen
4. Pull-to-refresh functionality

### Phase 3: Management Features (Low Priority)
1. Target management screen
2. Team performance screen
3. Category mapping screen
4. Advanced filtering options

## Key Implementation Notes

### Product Classification
- Server uses category IDs: 1,3 = vapes, 4,5 = pouches
- Fallback to name-based matching if category_id not set
- Use `/api/targets/categories/mapping` to get current configuration

### Date Handling
- All dates in ISO format: `YYYY-MM-DD`
- Period options: `current_month`, `last_month`, `current_year`
- Server calculates date ranges automatically

### Progress Calculation
- Server calculates all progress percentages
- Status: "Target Achieved" or "In Progress"
- Progress values are integers (0-100)

### Authentication
- JWT tokens required for all endpoints
- Handle 401 responses with token refresh
- Include Bearer token in Authorization header

## Testing Checklist

### API Integration
- [ ] Authentication flow
- [ ] Dashboard loading
- [ ] Individual metric endpoints
- [ ] Error handling
- [ ] Token refresh

### UI Testing
- [ ] Dashboard displays correctly
- [ ] Progress indicators work
- [ ] Pull-to-refresh functionality
- [ ] Error states display properly
- [ ] Loading states show correctly

### Performance Testing
- [ ] Caching works as expected
- [ ] Periodic updates don't cause memory leaks
- [ ] Large data sets handle gracefully
- [ ] Network timeouts handled properly 