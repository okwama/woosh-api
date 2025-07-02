# New Clients Details API

## Yes! The API now fetches actual client details

The new endpoint `/api/targets/clients/{userId}/details` returns the actual list of clients added by a sales rep, including:

- **ID**: Client unique identifier
- **Name**: Client/store name
- **Contact**: Phone number
- **Region**: Geographic region
- **Route Name**: Assigned route
- **Client Type**: Type of client (1, 2, etc.)
- **Created Date**: When the client was added
- **Status**: Active/inactive status

## API Endpoint

**GET** `/api/targets/clients/{userId}/details`

**Query Parameters:**
- `period` (optional): `current_month`, `last_month`, `current_year`
- `startDate` (optional): Custom start date (YYYY-MM-DD)
- `endDate` (optional): Custom end date (YYYY-MM-DD)

## Example Response

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

## Flutter Implementation

### Model Classes

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

### Service Method

```dart
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
```

## Usage Examples

### 1. Get Current Month Clients
```dart
final clients = await targetsService.getNewClientsDetails(
  userId: 123,
  period: 'current_month',
);
```

### 2. Get Custom Date Range
```dart
final clients = await targetsService.getNewClientsDetails(
  userId: 123,
  startDate: '2024-03-01',
  endDate: '2024-03-31',
);
```

### 3. Display in ListView
```dart
ListView.builder(
  itemCount: clientsDetails.newClients.length,
  itemBuilder: (context, index) {
    final client = clientsDetails.newClients[index];
    return ListTile(
      title: Text(client.name),
      subtitle: Text('${client.contact} • ${client.region}'),
      trailing: Text(DateFormat('MMM dd').format(client.createdAt)),
    );
  },
)
```

## Key Features

✅ **Client ID**: Unique identifier for each client
✅ **Client Name**: Store/business name
✅ **Contact**: Phone number
✅ **Region**: Geographic location
✅ **Route**: Assigned sales route
✅ **Client Type**: Category/type of client
✅ **Created Date**: When added to system
✅ **Status**: Active/inactive status
✅ **Period Filtering**: Current month, last month, current year
✅ **Custom Date Range**: Specific start/end dates
✅ **Sorted by Date**: Newest clients first

## Available Endpoints Summary

| Endpoint | Purpose | Returns |
|----------|---------|---------|
| `/clients/{userId}/progress` | Progress tracking | Count only |
| `/clients/{userId}/details` | Client details | Full client list with details |

Both endpoints support the same query parameters for filtering by period or custom date ranges. 