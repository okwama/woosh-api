# Hybrid Token Refresh System

## Overview

The hybrid token refresh system automatically handles token validation failures by regenerating new tokens when the database validation fails but the JWT is still valid. This provides a seamless user experience while maintaining security.

## How It Works

### 1. Token Validation Flow

1. **JWT Verification**: First, the system verifies the JWT token signature and expiration
2. **Database Validation**: Then checks if the token exists in the database and is not blacklisted
3. **Automatic Refresh**: If JWT is valid but database validation fails, automatically generates new tokens
4. **Fallback**: If database is unavailable, falls back to JWT-only validation

### 2. Automatic Token Refresh

When a token is valid (JWT-wise) but not found in the database:

- **Blacklists** the old token
- **Generates** new access token (8 hours) and refresh token (7 days)
- **Stores** both tokens in the database
- **Continues** the request with new tokens
- **Notifies** the client via response headers and body

### 3. Client Response Handling

When tokens are automatically refreshed, the response includes:

```json
{
  "tokensRefreshed": true,
  "newAccessToken": "new_access_token_here",
  "newRefreshToken": "new_refresh_token_here",
  // ... original response data
}
```

**Headers:**
- `X-Token-Refreshed: true`
- `X-New-Access-Token: new_access_token_here`
- `X-New-Refresh-Token: new_refresh_token_here`

## Benefits

### Security
- Tokens can still be revoked immediately
- Old tokens are properly blacklisted
- Database validation when available
- JWT-only fallback when database is unavailable

### User Experience
- No unexpected logouts due to database issues
- Seamless token refresh in the background
- Transparent to the user
- Self-healing authentication system

### Reliability
- Handles database connection issues gracefully
- Maintains service availability
- Provides audit trail for security monitoring

## Implementation Details

### Middleware Components

1. **`authenticateToken`**: Main authentication middleware with hybrid validation
2. **`generateNewTokens`**: Helper function to create new tokens
3. **`handleTokenRefresh`**: Response middleware to notify clients of token refresh

### Error Codes

- `TOKEN_EXPIRED`: JWT token has expired
- `INVALID_TOKEN_TYPE`: Wrong token type used
- `TOKEN_REFRESH_FAILED`: Failed to refresh tokens
- `USER_NOT_FOUND`: User no longer exists

## Client Integration

### Flutter/Dart Example

```dart
class ApiService {
  Future<Map<String, dynamic>> makeRequest(String endpoint) async {
    final response = await http.get(
      Uri.parse('$baseUrl$endpoint'),
      headers: {
        'Authorization': 'Bearer $accessToken',
      },
    );

    // Check if tokens were refreshed
    if (response.headers['x-token-refreshed'] == 'true') {
      final newAccessToken = response.headers['x-new-access-token'];
      final newRefreshToken = response.headers['x-new-refresh-token'];
      
      // Update stored tokens
      await updateStoredTokens(newAccessToken!, newRefreshToken!);
    }

    return jsonDecode(response.body);
  }
}
```

### JavaScript/React Example

```javascript
const apiCall = async (endpoint) => {
  const response = await fetch(`/api${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  const data = await response.json();

  // Check if tokens were refreshed
  if (data.tokensRefreshed) {
    // Update stored tokens
    localStorage.setItem('accessToken', data.newAccessToken);
    localStorage.setItem('refreshToken', data.newRefreshToken);
  }

  return data;
};
```

## Monitoring and Logging

The system logs various events for monitoring:

- `Token not found in database but JWT is valid, attempting token refresh`
- `Tokens automatically refreshed for user: {userId}`
- `Database unavailable, using JWT-only validation`
- `Failed to refresh tokens`

## Security Considerations

1. **Token Rotation**: Old tokens are blacklisted when new ones are generated
2. **Database Validation**: Primary validation method when database is available
3. **JWT Fallback**: Secondary validation when database is unavailable
4. **Audit Trail**: All token refresh events are logged
5. **User Verification**: User existence is verified before token refresh

## Configuration

- **Access Token Expiration**: 8 hours
- **Refresh Token Expiration**: 7 days
- **Database Validation**: Primary method
- **JWT Fallback**: Secondary method when database unavailable 