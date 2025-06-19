# Targets API Documentation

## Daily Visit Targets

### Endpoint
```http
GET /api/targets/daily-visits/:userId
```

### Description
Retrieves the daily visit statistics for a specific sales representative, comparing their completed visits against their daily visit target.

### Parameters

#### Path Parameters
- `userId` (required): The ID of the sales representative

#### Query Parameters
- `date` (optional): The date to check visits for (format: YYYY-MM-DD)
  - If not provided, defaults to current date

### Response
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

### Response Fields
- `userId`: The ID of the sales representative
- `date`: The date being checked
- `visitTarget`: The daily visit target from sales rep's profile
- `completedVisits`: Number of completed visits (with both check-in and check-out)
- `remainingVisits`: Number of visits still needed to reach target
- `progress`: Percentage of target achieved (rounded)
- `status`: Either "Target Achieved" or "In Progress"

### Filtering Logic

1. **Date Filtering**
   - If date is provided: Uses that specific date
   - If no date: Uses current date
   - Time range: 00:00:00 to 23:59:59 of the specified date

2. **Visit Counting**
   - Only counts visits where:
     - `checkInTime` exists
     - `checkoutTime` exists
     - Visit is within the specified date range

3. **Target Comparison**
   - Compares completed visits against `visits_targets` from SalesRep table
   - Calculates progress as: (completedVisits / visitTarget) * 100

### Example Requests

1. Get today's visits:
```http
GET /api/targets/daily-visits/123
```

2. Get visits for specific date:
```http
GET /api/targets/daily-visits/123?date=2024-03-20
```

### Error Responses

1. Sales Rep Not Found (404):
```json
{
  "error": "Sales rep not found"
}
```

2. Server Error (500):
```json
{
  "error": "Failed to fetch daily visit targets",
  "details": "Error message details"
}
```

### Database Tables Used

1. **SalesRep Table**
   - Fields used:
     - `id`: To identify the sales rep
     - `visits_targets`: The daily visit target

2. **JourneyPlan Table**
   - Fields used:
     - `userId`: To link to sales rep
     - `checkInTime`: To verify visit completion
     - `checkoutTime`: To verify visit completion
     - `date`: For date filtering

### Notes
- A visit is only counted as completed when both check-in and check-out times are recorded
- Progress is rounded to the nearest integer
- Remaining visits cannot be negative (minimum is 0)
- Status is "Target Achieved" when completed visits >= target 

## Monthly Visit Reports

### Endpoint
```http
GET /api/targets/monthly-visits/:userId
```

### Description
Retrieves daily visit statistics for every day of a specified month for a sales representative.

### Parameters

#### Path Parameters
- `userId` (required): The ID of the sales representative

#### Query Parameters
- `month` (optional): The month to check visits for (1-12)
  - If not provided, defaults to current month
- `year` (optional): The year to check visits for (e.g., 2024)
  - If not provided, defaults to current year

### Response
```json
[
  {
    "userId": "94",
    "date": "2024-03-01",
    "visitTarget": 10,
    "completedVisits": 3,
    "remainingVisits": 7,
    "progress": 30,
    "status": "In Progress"
  },
  {
    "userId": "94",
    "date": "2024-03-02",
    "visitTarget": 10,
    "completedVisits": 5,
    "remainingVisits": 5,
    "progress": 50,
    "status": "In Progress"
  }
  // ... one entry for each day of the month
]
```

### Response Fields
Each object in the array contains:
- `userId`: The ID of the sales representative
- `date`: The date in YYYY-MM-DD format
- `visitTarget`: The daily visit target from sales rep's profile
- `completedVisits`: Number of completed visits for that day
- `remainingVisits`: Number of visits still needed to reach target
- `progress`: Percentage of target achieved (rounded)
- `status`: Either "Target Achieved" or "In Progress"

### Example Requests

1. Get current month's visits:
```http
GET /api/targets/monthly-visits/94
```

2. Get visits for specific month and year:
```http
GET /api/targets/monthly-visits/94?month=3&year=2024
```

### Error Responses

1. Sales Rep Not Found (404):
```json
{
  "error": "Sales rep not found"
}
```

2. Server Error (500):
```json
{
  "error": "Failed to fetch monthly visit reports",
  "details": "Error message details"
}
```

### Notes
- Returns data for every day of the specified month
- Days with no visits will show 0 completed visits
- Progress is calculated daily
- Status is determined daily based on whether the target was achieved for that specific day 