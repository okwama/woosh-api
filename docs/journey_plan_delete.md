# Journey Plan Delete Endpoint

## Overview
The journey plan delete endpoint allows authenticated sales representatives to delete their pending journey plans. This endpoint is designed to provide a safe way to remove journey plans that haven't been started yet.

## Endpoint Details

**URL:** `DELETE /api/journey-plans/:journeyId`

**Method:** `DELETE`

**Authentication:** Required (Bearer Token)

## Request Parameters

### Path Parameters
- `journeyId` (required): The unique identifier of the journey plan to delete

### Example Request
```bash
DELETE /api/journey-plans/123
Authorization: Bearer <your-jwt-token>
```

## Business Rules

### Deletion Restrictions
- **Only pending journey plans can be deleted**: Journey plans with status `0` (pending) are the only ones eligible for deletion
- **Ownership validation**: Users can only delete their own journey plans
- **Status validation**: Journey plans that have been checked in, are in progress, completed, or cancelled cannot be deleted

### Journey Plan Statuses
- `0` = Pending (can be deleted)
- `1` = Checked In (cannot be deleted)
- `2` = In Progress (cannot be deleted)
- `3` = Completed (cannot be deleted)
- `4` = Cancelled (cannot be deleted)

## Response Format

### Success Response (200 OK)
```json
{
  "message": "Journey plan deleted successfully"
}
```

### Error Responses

#### 400 Bad Request
```json
{
  "error": "Only pending journey plans (status 0) can be deleted"
}
```

#### 401 Unauthorized
```json
{
  "error": "Authentication required"
}
```

#### 403 Forbidden
```json
{
  "error": "Unauthorized to delete this journey plan"
}
```

#### 404 Not Found
```json
{
  "error": "Journey plan not found"
}
```

#### 500 Internal Server Error
```json
{
  "error": "Failed to delete journey plan",
  "details": "Error details (only in development mode)"
}
```

## Implementation Details

### Function: `deleteJourneyPlan`

The delete operation follows these steps:

1. **Parameter Validation**: Extracts and validates the `journeyId` from the request parameters
2. **Journey Plan Lookup**: Queries the database to find the journey plan by ID
3. **Existence Check**: Verifies that the journey plan exists
4. **Status Validation**: Ensures the journey plan has status `0` (pending)
5. **Deletion**: Permanently removes the journey plan from the database
6. **Response**: Returns a success message

### Database Operations
```javascript
// Find the journey plan
const journeyPlan = await prisma.journeyPlan.findUnique({
  where: { id: parseInt(journeyId) },
});

// Delete the journey plan
await prisma.journeyPlan.delete({
  where: { id: parseInt(journeyId) },
});
```

## Security Considerations

- **Authentication Required**: All requests must include a valid JWT token
- **Authorization**: Users can only delete their own journey plans
- **Input Validation**: Journey ID is parsed as an integer to prevent injection attacks
- **Status Validation**: Prevents deletion of active or completed journey plans

## Usage Examples

### JavaScript/Fetch
```javascript
const deleteJourneyPlan = async (journeyId) => {
  try {
    const response = await fetch(`/api/journey-plans/${journeyId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const result = await response.json();
      console.log(result.message); // "Journey plan deleted successfully"
    } else {
      const error = await response.json();
      console.error(error.error);
    }
  } catch (error) {
    console.error('Error deleting journey plan:', error);
  }
};
```

### cURL
```bash
curl -X DELETE \
  http://localhost:3000/api/journey-plans/123 \
  -H "Authorization: Bearer <your-jwt-token>" \
  -H "Content-Type: application/json"
```

## Related Endpoints

- `POST /api/journey-plans` - Create a new journey plan
- `GET /api/journey-plans` - Get all journey plans for the current day
- `PUT /api/journey-plans/:journeyId` - Update a journey plan

## Notes

- This is a permanent deletion operation - deleted journey plans cannot be recovered
- The endpoint is designed to maintain data integrity by only allowing deletion of pending journey plans
- Consider implementing a soft delete mechanism if you need to maintain audit trails 