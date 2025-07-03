# New Clients Details - Flutter Implementation Example

## Overview

The new endpoint `/api/targets/clients/{userId}/details` allows you to fetch the actual list of clients added by a sales rep, including their details like id, name, contact, region, and creation date.

## API Endpoint

**GET** `/api/targets/clients/{userId}/details`

**Query Parameters:**
- `period` (optional): `current_month`, `last_month`, `current_year`
- `startDate` (optional): Custom start date (YYYY-MM-DD)
- `endDate` (optional): Custom end date (YYYY-MM-DD)

## Flutter Implementation

### 1. Model Classes

```dart
class NewClientsDetails {
  final int userId;
  final String period;
  final Map<String, String> dateRange;
  final int totalNewClients;
  final List<ClientDetail> newClients;
  final DateTime generatedAt;

  NewClientsDetails({
    required this.userId,
    required this.period,
    required this.dateRange,
    required this.totalNewClients,
    required this.newClients,
    required this.generatedAt,
  });

  factory NewClientsDetails.fromJson(Map<String, dynamic> json) {
    return NewClientsDetails(
      userId: json['userId'],
      period: json['period'],
      dateRange: Map<String, String>.from(json['dateRange']),
      totalNewClients: json['totalNewClients'],
      newClients: (json['newClients'] as List)
          .map((client) => ClientDetail.fromJson(client))
          .toList(),
      generatedAt: DateTime.parse(json['generatedAt']),
    );
  }
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

  ClientDetail({
    required this.id,
    required this.name,
    required this.contact,
    required this.region,
    this.routeName,
    this.clientType,
    required this.createdAt,
    required this.status,
  });

  factory ClientDetail.fromJson(Map<String, dynamic> json) {
    return ClientDetail(
      id: json['id'],
      name: json['name'],
      contact: json['contact'],
      region: json['region'],
      routeName: json['route_name'],
      clientType: json['client_type'],
      createdAt: DateTime.parse(json['created_at']),
      status: json['status'],
    );
  }
}
```

### 2. Service Method

```dart
class TargetsService {
  static const String _baseUrl = 'https://your-api-domain.com/api/targets';
  final String _authToken;
  
  TargetsService(this._authToken);
  
  Map<String, String> get _headers => {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer $_authToken',
  };

  Future<NewClientsDetails> getNewClientsDetails(
    int userId, {
    String? period,
    String? startDate,
    String? endDate,
  }) async {
    String url = '$_baseUrl/clients/$userId/details';
    List<String> params = [];
    
    if (period != null) params.add('period=$period');
    if (startDate != null) params.add('startDate=$startDate');
    if (endDate != null) params.add('endDate=$endDate');
    
    if (params.isNotEmpty) {
      url += '?${params.join('&')}';
    }
    
    final response = await http.get(Uri.parse(url), headers: _headers);
    
    if (response.statusCode == 200) {
      return NewClientsDetails.fromJson(json.decode(response.body));
    }
    throw TargetsApiException('Failed to load new clients details', response.statusCode);
  }
}
```

### 3. UI Widget Example

```dart
class NewClientsDetailsScreen extends StatefulWidget {
  final int userId;
  
  const NewClientsDetailsScreen({Key? key, required this.userId}) : super(key: key);
  
  @override
  _NewClientsDetailsScreenState createState() => _NewClientsDetailsScreenState();
}

class _NewClientsDetailsScreenState extends State<NewClientsDetailsScreen> {
  late Future<NewClientsDetails> _clientsFuture;
  final TargetsService _targetsService = GetIt.instance<TargetsService>();
  String _selectedPeriod = 'current_month';
  
  @override
  void initState() {
    super.initState();
    _loadClients();
  }
  
  void _loadClients() {
    setState(() {
      _clientsFuture = _targetsService.getNewClientsDetails(
        widget.userId,
        period: _selectedPeriod,
      );
    });
  }
  
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('New Clients Details'),
        actions: [
          PopupMenuButton<String>(
            onSelected: (period) {
              setState(() {
                _selectedPeriod = period;
                _loadClients();
              });
            },
            itemBuilder: (context) => [
              PopupMenuItem(value: 'current_month', child: Text('Current Month')),
              PopupMenuItem(value: 'last_month', child: Text('Last Month')),
              PopupMenuItem(value: 'current_year', child: Text('Current Year')),
            ],
            child: Padding(
              padding: EdgeInsets.all(16),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(_selectedPeriod.replaceAll('_', ' ').toUpperCase()),
                  Icon(Icons.arrow_drop_down),
                ],
              ),
            ),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => _loadClients(),
        child: FutureBuilder<NewClientsDetails>(
          future: _clientsFuture,
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
                    Text('Error loading clients'),
                    ElevatedButton(
                      onPressed: _loadClients,
                      child: Text('Retry'),
                    ),
                  ],
                ),
              );
            }
            
            final clientsDetails = snapshot.data!;
            
            if (clientsDetails.newClients.isEmpty) {
              return Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.people_outline, size: 64, color: Colors.grey),
                    SizedBox(height: 16),
                    Text('No new clients found'),
                    Text('for ${clientsDetails.period.replaceAll('_', ' ')}'),
                  ],
                ),
              );
            }
            
            return Column(
              children: [
                // Summary Card
                Card(
                  margin: EdgeInsets.all(16),
                  child: Padding(
                    padding: EdgeInsets.all(16),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Total New Clients',
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                            Text(
                              '${clientsDetails.totalNewClients}',
                              style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                                color: Theme.of(context).primaryColor,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ],
                        ),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(
                              'Period',
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                            Text(
                              clientsDetails.period.replaceAll('_', ' ').toUpperCase(),
                              style: Theme.of(context).textTheme.bodyMedium,
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
                
                // Clients List
                Expanded(
                  child: ListView.builder(
                    itemCount: clientsDetails.newClients.length,
                    itemBuilder: (context, index) {
                      final client = clientsDetails.newClients[index];
                      return Card(
                        margin: EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                        child: ListTile(
                          leading: CircleAvatar(
                            backgroundColor: Theme.of(context).primaryColor,
                            child: Text(
                              client.name.substring(0, 1).toUpperCase(),
                              style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                            ),
                          ),
                          title: Text(
                            client.name,
                            style: TextStyle(fontWeight: FontWeight.bold),
                          ),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              SizedBox(height: 4),
                              Row(
                                children: [
                                  Icon(Icons.phone, size: 16, color: Colors.grey),
                                  SizedBox(width: 4),
                                  Text(client.contact),
                                ],
                              ),
                              SizedBox(height: 2),
                              Row(
                                children: [
                                  Icon(Icons.location_on, size: 16, color: Colors.grey),
                                  SizedBox(width: 4),
                                  Text(client.region),
                                ],
                              ),
                              if (client.routeName != null) ...[
                                SizedBox(height: 2),
                                Row(
                                  children: [
                                    Icon(Icons.route, size: 16, color: Colors.grey),
                                    SizedBox(width: 4),
                                    Text(client.routeName!),
                                  ],
                                ),
                              ],
                              SizedBox(height: 2),
                              Row(
                                children: [
                                  Icon(Icons.calendar_today, size: 16, color: Colors.grey),
                                  SizedBox(width: 4),
                                  Text(
                                    DateFormat('MMM dd, yyyy').format(client.createdAt),
                                  ),
                                ],
                              ),
                            ],
                          ),
                          trailing: PopupMenuButton(
                            itemBuilder: (context) => [
                              PopupMenuItem(
                                child: Text('View Details'),
                                value: 'details',
                              ),
                              PopupMenuItem(
                                child: Text('Edit Client'),
                                value: 'edit',
                              ),
                            ],
                            onSelected: (value) {
                              // Handle menu actions
                            },
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}
```

### 4. State Management with Riverpod

```dart
final newClientsDetailsProvider = FutureProvider.family<NewClientsDetails, ({int userId, String period})>((ref, params) async {
  final service = ref.read(targetsServiceProvider);
  return service.getNewClientsDetails(params.userId, period: params.period);
});

// In your widget
Consumer(
  builder: (context, ref, child) {
    final clientsAsync = ref.watch(newClientsDetailsProvider((
      userId: widget.userId,
      period: _selectedPeriod,
    )));
    
    return clientsAsync.when(
      data: (clients) => NewClientsList(clients: clients),
      loading: () => Center(child: CircularProgressIndicator()),
      error: (error, stack) => ErrorWidget(error: error),
    );
  },
)
```

## Response Data Structure

The API returns:

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
    }
  ],
  "generatedAt": "2024-03-20T10:30:00.000Z"
}
```

## Key Features

1. **Client Details**: ID, name, contact, region, route, type, creation date
2. **Period Filtering**: Current month, last month, current year, or custom date range
3. **Sorting**: Clients are sorted by creation date (newest first)
4. **Status Tracking**: Shows client status (active/inactive)
5. **Route Information**: Shows which route the client belongs to

## Usage Scenarios

- **Sales Rep Dashboard**: Show recent clients added
- **Client Management**: List and manage new clients
- **Performance Review**: Track client acquisition over time
- **Route Analysis**: See which routes generate more clients
- **Reporting**: Generate reports on new client acquisition 