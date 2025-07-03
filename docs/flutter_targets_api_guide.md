# Flutter Targets API Integration Guide

This guide provides comprehensive documentation for integrating the Targets API into your Flutter application. The API tracks sales representatives' performance across multiple metrics: visit targets, new client acquisition, and product sales (vapes & pouches).

## Table of Contents
1. [API Base Configuration](#api-base-configuration)
2. [Authentication](#authentication)
3. [Core Target Endpoints](#core-target-endpoints)
4. [Client Tracking Endpoints](#client-tracking-endpoints)
5. [Product Sales Tracking](#product-sales-tracking)
6. [Dashboard & Analytics](#dashboard--analytics)
7. [Target Management](#target-management)
8. [Flutter Implementation Examples](#flutter-implementation-examples)
9. [Error Handling](#error-handling)
10. [Best Practices](#best-practices)

---

## API Base Configuration

```dart
class ApiConfig {
  static const String baseUrl = 'https://your-api-domain.com/api';
  static const String targetsEndpoint = '/targets';
}
```

## Authentication

All endpoints require authentication. Include the Bearer token in headers:

```dart
Map<String, String> get headers => {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer $authToken',
};
```

**Note**: The server uses JWT tokens with access and refresh token pattern. Make sure to handle token refresh when the access token expires.

---

## Core Target Endpoints

### 1. Get All Targets
**Endpoint:** `GET /api/targets`

Retrieves all sales volume targets with calculated progress.

```dart
Future<List<Target>> getAllTargets() async {
  final response = await http.get(
    Uri.parse('${ApiConfig.baseUrl}${ApiConfig.targetsEndpoint}'),
    headers: headers,
  );
  
  if (response.statusCode == 200) {
    final List<dynamic> data = json.decode(response.body);
    return data.map((json) => Target.fromJson(json)).toList();
  }
  throw Exception('Failed to load targets');
}
```

**Response Example:**
```json
[
  {
    "id": 1,
    "salesRepId": 123,
    "targetValue": 100,
    "achievedValue": 75,
    "progress": 75.0,
    "achieved": false,
    "isCurrent": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-15T00:00:00.000Z"
  }
]
```

### 2. Daily Visit Targets
**Endpoint:** `GET /api/targets/daily-visits/{userId}`

**Query Parameters:**
- `date` (optional): Format `YYYY-MM-DD`, defaults to today

```dart
Future<DailyVisitTarget> getDailyVisitTargets(int userId, {String? date}) async {
  String url = '${ApiConfig.baseUrl}${ApiConfig.targetsEndpoint}/daily-visits/$userId';
  if (date != null) {
    url += '?date=$date';
  }
  
  final response = await http.get(Uri.parse(url), headers: headers);
  
  if (response.statusCode == 200) {
    return DailyVisitTarget.fromJson(json.decode(response.body));
  }
  throw Exception('Failed to load daily visit targets');
}
```

**Response Example:**
```json
{
  "userId": "123",
  "date": "2024-03-20",
  "visitTarget": 10,
  "completedVisits": 7,
  "remainingVisits": 3,
  "progress": 70,
  "status": "In Progress"
}
```

### 3. Monthly Visit Reports
**Endpoint:** `GET /api/targets/monthly-visits/{userId}`

**Query Parameters:**
- `month` (optional): 1-12
- `year` (optional): e.g., 2024

```dart
Future<List<MonthlyVisitReport>> getMonthlyVisitReports(
  int userId, {
  int? month,
  int? year,
}) async {
  String url = '${ApiConfig.baseUrl}${ApiConfig.targetsEndpoint}/monthly-visits/$userId';
  List<String> params = [];
  
  if (month != null) params.add('month=$month');
  if (year != null) params.add('year=$year');
  
  if (params.isNotEmpty) {
    url += '?${params.join('&')}';
  }
  
  final response = await http.get(Uri.parse(url), headers: headers);
  
  if (response.statusCode == 200) {
    final List<dynamic> data = json.decode(response.body);
    return data.map((json) => MonthlyVisitReport.fromJson(json)).toList();
  }
  throw Exception('Failed to load monthly visit reports');
}
```

---

## Client Tracking Endpoints

### 4. New Clients Progress
**Endpoint:** `GET /api/targets/clients/{userId}/progress`

Tracks how many new clients a sales rep has added vs their target.

**Query Parameters:**
- `startDate` (optional): Format `YYYY-MM-DD`
- `endDate` (optional): Format `YYYY-MM-DD`
- `period` (optional): `current_month`, `last_month`, `current_year`

```dart
Future<NewClientsProgress> getNewClientsProgress(
  int userId, {
  String? startDate,
  String? endDate,
  String? period,
}) async {
  String url = '${ApiConfig.baseUrl}${ApiConfig.targetsEndpoint}/clients/$userId/progress';
  List<String> params = [];
  
  if (startDate != null) params.add('startDate=$startDate');
  if (endDate != null) params.add('endDate=$endDate');
  if (period != null) params.add('period=$period');
  
  if (params.isNotEmpty) {
    url += '?${params.join('&')}';
  }
  
  final response = await http.get(Uri.parse(url), headers: headers);
  
  if (response.statusCode == 200) {
    return NewClientsProgress.fromJson(json.decode(response.body));
  }
  throw Exception('Failed to load new clients progress');
}
```

**Response Example:**
```json
{
  "userId": 123,
  "salesRepName": "John Doe",
  "period": "current_month",
  "dateRange": {
    "startDate": "2024-03-01",
    "endDate": "2024-03-31"
  },
  "newClientsTarget": 5,
  "newClientsAdded": 3,
  "remainingClients": 2,
  "progress": 60,
  "status": "In Progress",
  "generatedAt": "2024-03-20T10:30:00.000Z"
}
```

### 4.1. New Clients Details
**Endpoint:** `GET /api/targets/clients/{userId}/details`

Fetches the actual list of new clients added by a sales rep with their details.

**Query Parameters:**
- `startDate` (optional): Format `YYYY-MM-DD`
- `endDate` (optional): Format `YYYY-MM-DD`
- `period` (optional): `current_month`, `last_month`, `current_year`

```dart
Future<NewClientsDetails> getNewClientsDetails(
  int userId, {
  String? startDate,
  String? endDate,
  String? period,
}) async {
  String url = '${ApiConfig.baseUrl}${ApiConfig.targetsEndpoint}/clients/$userId/details';
  List<String> params = [];
  
  if (startDate != null) params.add('startDate=$startDate');
  if (endDate != null) params.add('endDate=$endDate');
  if (period != null) params.add('period=$period');
  
  if (params.isNotEmpty) {
    url += '?${params.join('&')}';
  }
  
  final response = await http.get(Uri.parse(url), headers: headers);
  
  if (response.statusCode == 200) {
    return NewClientsDetails.fromJson(json.decode(response.body));
  }
  throw Exception('Failed to load new clients details');
}
```

**Response Example:**
```json
{
  "userId": 123,
  "period": "current_month",
  "dateRange": {
    "startDate": "2024-03-01",
    "endDate": "2024-03-31"
  },
  "totalNewClients": 3,
  "newClients": [
    {
      "id": 456,
      "name": "ABC Store",
      "contact": "+1234567890",
      "region": "North Region",
      "route_name": "Route A",
      "client_type": 1,
      "created_at": "2024-03-15T10:30:00.000Z",
      "status": 0
    },
    {
      "id": 457,
      "name": "XYZ Shop",
      "contact": "+1234567891",
      "region": "South Region",
      "route_name": "Route B",
      "client_type": 2,
      "created_at": "2024-03-20T14:45:00.000Z",
      "status": 0
    }
  ],
  "generatedAt": "2024-03-20T10:30:00.000Z"
}
```

---

## Product Sales Tracking

### 5. Product Sales Progress (Vapes & Pouches)
**Endpoint:** `GET /api/targets/products/{userId}/progress`

Tracks vapes and pouches sales vs targets.

**Product Classification Logic:**
- **Vapes**: Category IDs 1 and 3
- **Pouches**: Category IDs 4 and 5
- **Fallback**: If category_id is not set, uses name-based keyword matching

**Query Parameters:**
- `productType` (optional): `vapes`, `pouches`, or `all` (default)
- `startDate` (optional): Format `YYYY-MM-DD`
- `endDate` (optional): Format `YYYY-MM-DD`
- `period` (optional): `current_month`, `last_month`, `current_year`

```dart
Future<ProductSalesProgress> getProductSalesProgress(
  int userId, {
  String productType = 'all',
  String? startDate,
  String? endDate,
  String? period,
}) async {
  String url = '${ApiConfig.baseUrl}${ApiConfig.targetsEndpoint}/products/$userId/progress';
  List<String> params = ['productType=$productType'];
  
  if (startDate != null) params.add('startDate=$startDate');
  if (endDate != null) params.add('endDate=$endDate');
  if (period != null) params.add('period=$period');
  
  url += '?${params.join('&')}';
  
  final response = await http.get(Uri.parse(url), headers: headers);
  
  if (response.statusCode == 200) {
    return ProductSalesProgress.fromJson(json.decode(response.body));
  }
  throw Exception('Failed to load product sales progress');
}
```

**Response Example:**
```json
{
  "userId": 123,
  "salesRepName": "John Doe",
  "period": "current_month",
  "dateRange": {
    "startDate": "2024-03-01",
    "endDate": "2024-03-31"
  },
  "summary": {
    "totalOrders": 15,
    "totalQuantitySold": 150,
    "vapes": {
      "target": 50,
      "sold": 35,
      "remaining": 15,
      "progress": 70,
      "status": "In Progress"
    },
    "pouches": {
      "target": 30,
      "sold": 25,
      "remaining": 5,
      "progress": 83,
      "status": "In Progress"
    }
  },
  "productBreakdown": [
    {
      "productId": 1,
      "productName": "Premium Vape Kit",
      "category": "Vapes",
      "categoryId": 1,
      "quantity": 20,
      "isVape": true,
      "isPouch": false
    }
  ],
  "generatedAt": "2024-03-20T10:30:00.000Z"
}
```

---

## Dashboard & Analytics

### 6. Sales Rep Dashboard
**Endpoint:** `GET /api/targets/dashboard/{userId}`

Comprehensive performance dashboard combining all metrics.

**Query Parameters:**
- `period` (optional): `current_month`, `last_month`, `current_year`

```dart
Future<SalesRepDashboard> getSalesRepDashboard(
  int userId, {
  String period = 'current_month',
}) async {
  final url = '${ApiConfig.baseUrl}${ApiConfig.targetsEndpoint}/dashboard/$userId?period=$period';
  
  final response = await http.get(Uri.parse(url), headers: headers);
  
  if (response.statusCode == 200) {
    return SalesRepDashboard.fromJson(json.decode(response.body));
  }
  throw Exception('Failed to load dashboard');
}
```

**Response Example:**
```json
{
  "userId": 123,
  "period": "current_month",
  "visitTargets": {
    "userId": "123",
    "date": "2024-03-20",
    "visitTarget": 10,
    "completedVisits": 8,
    "remainingVisits": 2,
    "progress": 80,
    "status": "In Progress"
  },
  "newClients": {
    "userId": 123,
    "salesRepName": "John Doe",
    "period": "current_month",
    "dateRange": {
      "startDate": "2024-03-01",
      "endDate": "2024-03-31"
    },
    "newClientsTarget": 5,
    "newClientsAdded": 4,
    "remainingClients": 1,
    "progress": 80,
    "status": "In Progress",
    "generatedAt": "2024-03-20T10:30:00.000Z"
  },
  "productSales": {
    "userId": 123,
    "salesRepName": "John Doe",
    "period": "current_month",
    "dateRange": {
      "startDate": "2024-03-01",
      "endDate": "2024-03-31"
    },
    "summary": {
      "totalOrders": 15,
      "totalQuantitySold": 150,
      "vapes": {
        "target": 50,
        "sold": 45,
        "remaining": 5,
        "progress": 90,
        "status": "In Progress"
      },
      "pouches": {
        "target": 30,
        "sold": 32,
        "remaining": 0,
        "progress": 107,
        "status": "Target Achieved"
      }
    },
    "productBreakdown": [...],
    "generatedAt": "2024-03-20T10:30:00.000Z"
  },
  "generatedAt": "2024-03-20T10:30:00.000Z"
}
```

### 7. Team Performance Overview (For Managers)
**Endpoint:** `GET /api/targets/team/{managerId}/performance`

**Query Parameters:**
- `period` (optional): `current_month`, `last_month`, `current_year`

```dart
Future<TeamPerformance> getTeamPerformance(
  int managerId, {
  String period = 'current_month',
}) async {
  final url = '${ApiConfig.baseUrl}${ApiConfig.targetsEndpoint}/team/$managerId/performance?period=$period';
  
  final response = await http.get(Uri.parse(url), headers: headers);
  
  if (response.statusCode == 200) {
    return TeamPerformance.fromJson(json.decode(response.body));
  }
  throw Exception('Failed to load team performance');
}
```

**Response Example:**
```json
{
  "managerId": 456,
  "period": "current_month",
  "teamPerformance": [
    {
      "salesRep": {
        "id": 123,
        "name": "John Doe"
      },
      "performance": {
        "visits": {
          "visitTarget": 10,
          "completedVisits": 8,
          "progress": 80,
          "status": "In Progress"
        },
        "clients": {
          "newClientsTarget": 5,
          "newClientsAdded": 4,
          "progress": 80,
          "status": "In Progress"
        },
        "products": {
          "summary": {
            "vapes": {
              "target": 50,
              "sold": 45,
              "progress": 90
            },
            "pouches": {
              "target": 30,
              "sold": 32,
              "progress": 107
            }
          }
        }
      }
    }
  ],
  "generatedAt": "2024-03-20T10:30:00.000Z"
}
```

---

## Target Management

### 8. Get Category Mapping
**Endpoint:** `GET /api/targets/categories/mapping`

Get the category mapping configuration for product classification.

```dart
Future<CategoryMapping> getCategoryMapping() async {
  final url = '${ApiConfig.baseUrl}${ApiConfig.targetsEndpoint}/categories/mapping';
  
  final response = await http.get(Uri.parse(url), headers: headers);
  
  if (response.statusCode == 200) {
    return CategoryMapping.fromJson(json.decode(response.body));
  }
  throw Exception('Failed to load category mapping');
}
```

**Response Example:**
```json
{
  "categories": [
    {"id": 1, "name": "Premium Vapes"},
    {"id": 3, "name": "Standard Vapes"},
    {"id": 4, "name": "Nicotine Pouches"},
    {"id": 5, "name": "Tobacco Pouches"}
  ],
  "mapping": {
    "VAPES": [1, 3],
    "POUCHES": [4, 5]
  },
  "vapeCategories": [
    {"id": 1, "name": "Premium Vapes"},
    {"id": 3, "name": "Standard Vapes"}
  ],
  "pouchCategories": [
    {"id": 4, "name": "Nicotine Pouches"},
    {"id": 5, "name": "Tobacco Pouches"}
  ]
}
```

### 9. Update Sales Rep Targets
**Endpoint:** `PUT /api/targets/targets/{userId}`

Update a sales rep's targets for vapes, pouches, new clients, and visits.

```dart
Future<UpdateTargetsResponse> updateSalesRepTargets(
  int userId, {
  int? vapesTargets,
  int? pouchesTargets,
  int? newClientsTarget,
  int? visitsTargets,
}) async {
  final url = '${ApiConfig.baseUrl}${ApiConfig.targetsEndpoint}/targets/$userId';
  
  Map<String, dynamic> body = {};
  if (vapesTargets != null) body['vapes_targets'] = vapesTargets;
  if (pouchesTargets != null) body['pouches_targets'] = pouchesTargets;
  if (newClientsTarget != null) body['new_clients_target'] = newClientsTarget;
  if (visitsTargets != null) body['visits_targets'] = visitsTargets;
  
  final response = await http.put(
    Uri.parse(url),
    headers: headers,
    body: json.encode(body),
  );
  
  if (response.statusCode == 200) {
    return UpdateTargetsResponse.fromJson(json.decode(response.body));
  }
  throw Exception('Failed to update targets');
}
```

**Request Body Example:**
```json
{
  "vapes_targets": 60,
  "pouches_targets": 40,
  "new_clients_target": 8,
  "visits_targets": 12
}
```

**Response Example:**
```json
{
  "message": "Sales rep targets updated successfully",
  "salesRep": {
    "id": 123,
    "name": "John Doe",
    "vapes_targets": 60,
    "pouches_targets": 40,
    "new_clients": 8,
    "visits_targets": 12,
    "updatedAt": "2024-03-20T10:30:00.000Z"
  }
}
```

---

## Flutter Implementation Examples

### Complete Service Class

```dart
class TargetsService {
  static const String _baseUrl = 'https://your-api-domain.com/api/targets';
  final String _authToken;
  
  TargetsService(this._authToken);
  
  Map<String, String> get _headers => {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer $_authToken',
  };

  // Dashboard for sales rep
  Future<SalesRepDashboard> getDashboard(int userId, {String period = 'current_month'}) async {
    final response = await http.get(
      Uri.parse('$_baseUrl/dashboard/$userId?period=$period'),
      headers: _headers,
    );
    
    if (response.statusCode == 200) {
      return SalesRepDashboard.fromJson(json.decode(response.body));
    }
    throw TargetsApiException('Failed to load dashboard', response.statusCode);
  }

  // Get specific metric
  Future<ProductSalesProgress> getProductSales(int userId, String productType) async {
    final response = await http.get(
      Uri.parse('$_baseUrl/products/$userId/progress?productType=$productType'),
      headers: _headers,
    );
    
    if (response.statusCode == 200) {
      return ProductSalesProgress.fromJson(json.decode(response.body));
    }
    throw TargetsApiException('Failed to load product sales', response.statusCode);
  }

  // Get new clients progress
  Future<NewClientsProgress> getNewClientsProgress(int userId, {String? period}) async {
    String url = '$_baseUrl/clients/$userId/progress';
    if (period != null) {
      url += '?period=$period';
    }
    
    final response = await http.get(Uri.parse(url), headers: _headers);
    
    if (response.statusCode == 200) {
      return NewClientsProgress.fromJson(json.decode(response.body));
    }
    throw TargetsApiException('Failed to load new clients progress', response.statusCode);
  }

  // Get category mapping
  Future<CategoryMapping> getCategoryMapping() async {
    final response = await http.get(
      Uri.parse('$_baseUrl/categories/mapping'),
      headers: _headers,
    );
    
    if (response.statusCode == 200) {
      return CategoryMapping.fromJson(json.decode(response.body));
    }
    throw TargetsApiException('Failed to load category mapping', response.statusCode);
  }

  // Update targets
  Future<UpdateTargetsResponse> updateTargets(int userId, {
    int? vapesTargets,
    int? pouchesTargets,
    int? newClientsTarget,
    int? visitsTargets,
  }) async {
    Map<String, dynamic> body = {};
    if (vapesTargets != null) body['vapes_targets'] = vapesTargets;
    if (pouchesTargets != null) body['pouches_targets'] = pouchesTargets;
    if (newClientsTarget != null) body['new_clients_target'] = newClientsTarget;
    if (visitsTargets != null) body['visits_targets'] = visitsTargets;
    
    final response = await http.put(
      Uri.parse('$_baseUrl/targets/$userId'),
      headers: _headers,
      body: json.encode(body),
    );
    
    if (response.statusCode == 200) {
      return UpdateTargetsResponse.fromJson(json.decode(response.body));
    }
    throw TargetsApiException('Failed to update targets', response.statusCode);
  }
}
```

### Flutter Widget Example

```dart
class DashboardScreen extends StatefulWidget {
  final int userId;
  
  const DashboardScreen({Key? key, required this.userId}) : super(key: key);
  
  @override
  _DashboardScreenState createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  late Future<SalesRepDashboard> _dashboardFuture;
  final TargetsService _targetsService = GetIt.instance<TargetsService>();
  
  @override
  void initState() {
    super.initState();
    _loadDashboard();
  }
  
  void _loadDashboard() {
    setState(() {
      _dashboardFuture = _targetsService.getDashboard(widget.userId);
    });
  }
  
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Performance Dashboard'),
        actions: [
          IconButton(
            icon: Icon(Icons.refresh),
            onPressed: _loadDashboard,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => _loadDashboard(),
        child: FutureBuilder<SalesRepDashboard>(
          future: _dashboardFuture,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return Center(child: CircularProgressIndicator());
            }
            
            if (snapshot.hasError) {
              return Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.error, size: 64, color: Colors.red),
                    SizedBox(height: 16),
                    Text('Error loading dashboard'),
                    ElevatedButton(
                      onPressed: _loadDashboard,
                      child: Text('Retry'),
                    ),
                  ],
                ),
              );
            }
            
            final dashboard = snapshot.data!;
            return SingleChildScrollView(
              padding: EdgeInsets.all(16),
              child: Column(
                children: [
                  _buildVisitTargetCard(dashboard.visitTargets),
                  SizedBox(height: 16),
                  _buildNewClientsCard(dashboard.newClients),
                  SizedBox(height: 16),
                  _buildProductSalesCard(dashboard.productSales),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
  
  Widget _buildVisitTargetCard(VisitTargets visitTargets) {
    return Card(
      child: Padding(
        padding: EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Daily Visits', style: Theme.of(context).textTheme.titleLarge),
                _buildStatusChip(visitTargets.status),
              ],
            ),
            SizedBox(height: 8),
            LinearProgressIndicator(
              value: visitTargets.progress / 100,
              backgroundColor: Colors.grey[300],
              valueColor: AlwaysStoppedAnimation<Color>(
                visitTargets.progress >= 100 ? Colors.green : Colors.blue,
              ),
            ),
            SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('${visitTargets.completedVisits}/${visitTargets.visitTarget}'),
                Text('${visitTargets.progress}%'),
              ],
            ),
          ],
        ),
      ),
    );
  }
  
  Widget _buildNewClientsCard(NewClientsProgress newClients) {
    return Card(
      child: Padding(
        padding: EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('New Clients', style: Theme.of(context).textTheme.titleLarge),
                _buildStatusChip(newClients.status),
              ],
            ),
            SizedBox(height: 8),
            LinearProgressIndicator(
              value: newClients.progress / 100,
              backgroundColor: Colors.grey[300],
              valueColor: AlwaysStoppedAnimation<Color>(
                newClients.progress >= 100 ? Colors.green : Colors.orange,
              ),
            ),
            SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('${newClients.newClientsAdded}/${newClients.newClientsTarget}'),
                Text('${newClients.progress}%'),
              ],
            ),
          ],
        ),
      ),
    );
  }
  
  Widget _buildProductSalesCard(ProductSalesProgress productSales) {
    return Card(
      child: Padding(
        padding: EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Product Sales', style: Theme.of(context).textTheme.titleLarge),
            SizedBox(height: 16),
            _buildProductProgress('Vapes', productSales.summary.vapes),
            SizedBox(height: 12),
            _buildProductProgress('Pouches', productSales.summary.pouches),
          ],
        ),
      ),
    );
  }
  
  Widget _buildProductProgress(String title, ProductMetric metric) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            _buildStatusChip(metric.status),
          ],
        ),
        SizedBox(height: 4),
        LinearProgressIndicator(
          value: metric.progress / 100,
          backgroundColor: Colors.grey[300],
          valueColor: AlwaysStoppedAnimation<Color>(
            metric.progress >= 100 ? Colors.green : Colors.orange,
          ),
        ),
        SizedBox(height: 4),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('${metric.sold}/${metric.target}'),
            Text('${metric.progress}%'),
          ],
        ),
      ],
    );
  }
  
  Widget _buildStatusChip(String status) {
    Color color = status == 'Target Achieved' ? Colors.green : Colors.orange;
    return Container(
      padding: EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color),
      ),
      child: Text(
        status,
        style: TextStyle(
          color: color,
          fontSize: 12,
          fontWeight: FontWeight.bold,
        ),
      ),
    );
  }
}
```

---

## Error Handling

### Custom Exception Class

```dart
class TargetsApiException implements Exception {
  final String message;
  final int? statusCode;
  
  TargetsApiException(this.message, [this.statusCode]);
  
  @override
  String toString() => 'TargetsApiException: $message (Status: $statusCode)';
}
```

### Error Handling in Service

```dart
Future<T> _handleApiCall<T>(Future<http.Response> apiCall, T Function(Map<String, dynamic>) fromJson) async {
  try {
    final response = await apiCall;
    
    switch (response.statusCode) {
      case 200:
        return fromJson(json.decode(response.body));
      case 404:
        throw TargetsApiException('Resource not found', 404);
      case 401:
        throw TargetsApiException('Unauthorized access', 401);
      case 500:
        throw TargetsApiException('Server error', 500);
      default:
        throw TargetsApiException('Unknown error occurred', response.statusCode);
    }
  } on SocketException {
    throw TargetsApiException('No internet connection');
  } on TimeoutException {
    throw TargetsApiException('Request timeout');
  } catch (e) {
    throw TargetsApiException('Unexpected error: $e');
  }
}
```

---

## Best Practices

### 1. **Caching Strategy**
```dart
class CachedTargetsService {
  final TargetsService _service;
  final Map<String, CacheEntry> _cache = {};
  
  CachedTargetsService(this._service);
  
  Future<SalesRepDashboard> getDashboard(int userId, {bool forceRefresh = false}) async {
    final cacheKey = 'dashboard_$userId';
    
    if (!forceRefresh && _cache.containsKey(cacheKey)) {
      final entry = _cache[cacheKey]!;
      if (DateTime.now().difference(entry.timestamp).inMinutes < 5) {
        return entry.data as SalesRepDashboard;
      }
    }
    
    final dashboard = await _service.getDashboard(userId);
    _cache[cacheKey] = CacheEntry(dashboard, DateTime.now());
    return dashboard;
  }
}
```

### 2. **Loading States with Riverpod**
```dart
final dashboardProvider = FutureProvider.family<SalesRepDashboard, int>((ref, userId) async {
  final service = ref.read(targetsServiceProvider);
  return service.getDashboard(userId);
});

// In your widget
Consumer(
  builder: (context, ref, child) {
    final dashboardAsync = ref.watch(dashboardProvider(userId));
    
    return dashboardAsync.when(
      data: (dashboard) => DashboardContent(dashboard: dashboard),
      loading: () => DashboardSkeleton(),
      error: (error, stack) => ErrorWidget(error: error),
    );
  },
)
```

### 3. **Periodic Updates**
```dart
class DashboardController extends StateNotifier<AsyncValue<SalesRepDashboard>> {
  final TargetsService _service;
  Timer? _timer;
  
  DashboardController(this._service) : super(const AsyncValue.loading());
  
  void startPeriodicUpdates(int userId) {
    _timer = Timer.periodic(Duration(minutes: 2), (_) {
      _loadDashboard(userId);
    });
    _loadDashboard(userId);
  }
  
  void _loadDashboard(int userId) async {
    try {
      final dashboard = await _service.getDashboard(userId);
      state = AsyncValue.data(dashboard);
    } catch (error, stack) {
      state = AsyncValue.error(error, stack);
    }
  }
  
  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }
}
```

### 4. **Model Classes**
```dart
class SalesRepDashboard {
  final int userId;
  final String period;
  final VisitTargets visitTargets;
  final NewClientsProgress newClients;
  final ProductSalesProgress productSales;
  final DateTime generatedAt;
  
  SalesRepDashboard({
    required this.userId,
    required this.period,
    required this.visitTargets,
    required this.newClients,
    required this.productSales,
    required this.generatedAt,
  });
  
  factory SalesRepDashboard.fromJson(Map<String, dynamic> json) {
    return SalesRepDashboard(
      userId: json['userId'],
      period: json['period'],
      visitTargets: VisitTargets.fromJson(json['visitTargets']),
      newClients: NewClientsProgress.fromJson(json['newClients']),
      productSales: ProductSalesProgress.fromJson(json['productSales']),
      generatedAt: DateTime.parse(json['generatedAt']),
    );
  }
}

class VisitTargets {
  final int userId;
  final String date;
  final int visitTarget;
  final int completedVisits;
  final int remainingVisits;
  final int progress;
  final String status;
  
  VisitTargets({
    required this.userId,
    required this.date,
    required this.visitTarget,
    required this.completedVisits,
    required this.remainingVisits,
    required this.progress,
    required this.status,
  });
  
  factory VisitTargets.fromJson(Map<String, dynamic> json) {
    return VisitTargets(
      userId: int.parse(json['userId']),
      date: json['date'],
      visitTarget: json['visitTarget'],
      completedVisits: json['completedVisits'],
      remainingVisits: json['remainingVisits'],
      progress: json['progress'],
      status: json['status'],
    );
  }
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
  final DateTime generatedAt;
  
  NewClientsProgress({
    required this.userId,
    required this.salesRepName,
    required this.period,
    required this.dateRange,
    required this.newClientsTarget,
    required this.newClientsAdded,
    required this.remainingClients,
    required this.progress,
    required this.status,
    required this.generatedAt,
  });
  
  factory NewClientsProgress.fromJson(Map<String, dynamic> json) {
    return NewClientsProgress(
      userId: json['userId'],
      salesRepName: json['salesRepName'],
      period: json['period'],
      dateRange: Map<String, String>.from(json['dateRange']),
      newClientsTarget: json['newClientsTarget'],
      newClientsAdded: json['newClientsAdded'],
      remainingClients: json['remainingClients'],
      progress: json['progress'],
      status: json['status'],
      generatedAt: DateTime.parse(json['generatedAt']),
    );
  }
}

class ProductSalesProgress {
  final int userId;
  final String salesRepName;
  final String period;
  final Map<String, String> dateRange;
  final ProductSummary summary;
  final List<ProductBreakdown> productBreakdown;
  final DateTime generatedAt;
  
  ProductSalesProgress({
    required this.userId,
    required this.salesRepName,
    required this.period,
    required this.dateRange,
    required this.summary,
    required this.productBreakdown,
    required this.generatedAt,
  });
  
  factory ProductSalesProgress.fromJson(Map<String, dynamic> json) {
    return ProductSalesProgress(
      userId: json['userId'],
      salesRepName: json['salesRepName'],
      period: json['period'],
      dateRange: Map<String, String>.from(json['dateRange']),
      summary: ProductSummary.fromJson(json['summary']),
      productBreakdown: (json['productBreakdown'] as List)
          .map((item) => ProductBreakdown.fromJson(item))
          .toList(),
      generatedAt: DateTime.parse(json['generatedAt']),
    );
  }
}

class ProductSummary {
  final int totalOrders;
  final int totalQuantitySold;
  final ProductMetric vapes;
  final ProductMetric pouches;
  
  ProductSummary({
    required this.totalOrders,
    required this.totalQuantitySold,
    required this.vapes,
    required this.pouches,
  });
  
  factory ProductSummary.fromJson(Map<String, dynamic> json) {
    return ProductSummary(
      totalOrders: json['totalOrders'],
      totalQuantitySold: json['totalQuantitySold'],
      vapes: ProductMetric.fromJson(json['vapes']),
      pouches: ProductMetric.fromJson(json['pouches']),
    );
  }
}

class ProductMetric {
  final int target;
  final int sold;
  final int remaining;
  final int progress;
  final String status;
  
  ProductMetric({
    required this.target,
    required this.sold,
    required this.remaining,
    required this.progress,
    required this.status,
  });
  
  factory ProductMetric.fromJson(Map<String, dynamic> json) {
    return ProductMetric(
      target: json['target'],
      sold: json['sold'],
      remaining: json['remaining'],
      progress: json['progress'],
      status: json['status'],
    );
  }
}

class ProductBreakdown {
  final int productId;
  final String productName;
  final String category;
  final int? categoryId;
  final int quantity;
  final bool isVape;
  final bool isPouch;
  
  ProductBreakdown({
    required this.productId,
    required this.productName,
    required this.category,
    this.categoryId,
    required this.quantity,
    required this.isVape,
    required this.isPouch,
  });
  
  factory ProductBreakdown.fromJson(Map<String, dynamic> json) {
    return ProductBreakdown(
      productId: json['productId'],
      productName: json['productName'],
      category: json['category'],
      categoryId: json['categoryId'],
      quantity: json['quantity'],
      isVape: json['isVape'],
      isPouch: json['isPouch'],
    );
  }
}
```

---

## Summary

This API provides comprehensive target tracking for:
- ✅ **Visit Targets**: Daily and monthly visit tracking
- ✅ **New Client Acquisition**: Tracking clients added by each sales rep
- ✅ **Product Sales**: Vapes and pouches sales vs targets (Category ID based)
- ✅ **Dashboard Analytics**: Combined performance metrics
- ✅ **Team Management**: Manager overview of team performance
- ✅ **Target Management**: Update sales rep targets
- ✅ **Category Mapping**: View product classification configuration

The modular service architecture ensures maintainable code while providing rich analytics for sales performance tracking in your Flutter application. 