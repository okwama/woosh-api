# Refresh Token Pattern Implementation

## Overview
This implementation uses a refresh token pattern where:
- **Access Tokens**: Short-lived (15 minutes) for API requests
- **Refresh Tokens**: Long-lived (7 days) for getting new access tokens

## Database Schema
The `Token` table now includes a `tokenType` field:
- `tokenType: "access"` - Short-lived tokens for API access
- `tokenType: "refresh"` - Long-lived tokens for refreshing access tokens

## API Endpoints

### 1. Login
**POST** `/auth/login`
```json
{
  "phoneNumber": "1234567890",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "salesRep": { ... },
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 900
}
```

### 2. Refresh Token
**POST** `/auth/refresh`
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response:**
```json
{
  "success": true,
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 900,
  "user": { ... }
}
```

### 3. Logout
**POST** `/auth/logout`
**Headers:** `Authorization: Bearer <accessToken>`

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

## Frontend Implementation

### Web Implementation

#### 1. Store Tokens
```javascript
// After login
localStorage.setItem('accessToken', response.accessToken);
localStorage.setItem('refreshToken', response.refreshToken);
```

#### 2. API Request with Auto-Refresh
```javascript
const apiRequest = async (url, options = {}) => {
  let accessToken = localStorage.getItem('accessToken');
  
  // Add authorization header
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`,
    ...options.headers
  };

  try {
    const response = await fetch(url, { ...options, headers });
    
    // If token expired, try to refresh
    if (response.status === 401) {
      const refreshToken = localStorage.getItem('refreshToken');
      
      if (refreshToken) {
        const refreshResponse = await fetch('/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken })
        });
        
        if (refreshResponse.ok) {
          const { accessToken: newAccessToken } = await refreshResponse.json();
          localStorage.setItem('accessToken', newAccessToken);
          
          // Retry original request with new token
          headers.Authorization = `Bearer ${newAccessToken}`;
          return fetch(url, { ...options, headers });
        } else {
          // Refresh failed, redirect to login
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          window.location.href = '/login';
          return;
        }
      }
    }
    
    return response;
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
};
```

#### 3. Axios Interceptor (Alternative)
```javascript
import axios from 'axios';

// Request interceptor
axios.interceptors.request.use(
  (config) => {
    const accessToken = localStorage.getItem('accessToken');
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    if (error.response.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        try {
          const response = await axios.post('/auth/refresh', { refreshToken });
          const { accessToken } = response.data;
          
          localStorage.setItem('accessToken', accessToken);
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          
          return axios(originalRequest);
        } catch (refreshError) {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          window.location.href = '/login';
          return Promise.reject(refreshError);
        }
      }
    }
    
    return Promise.reject(error);
  }
);
```

### Flutter Implementation

#### 1. Dependencies
Add to `pubspec.yaml`:
```yaml
dependencies:
  flutter_secure_storage: ^8.0.0
  dio: ^5.0.0
  shared_preferences: ^2.2.0
```

#### 2. Token Storage
```dart
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

class TokenStorage {
  static const _secureStorage = FlutterSecureStorage();
  static const String _accessTokenKey = 'access_token';
  static const String _refreshTokenKey = 'refresh_token';

  // Store tokens after login
  static Future<void> storeTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    // Store access token in SharedPreferences (less sensitive)
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_accessTokenKey, accessToken);
    
    // Store refresh token in secure storage (more sensitive)
    await _secureStorage.write(key: _refreshTokenKey, value: refreshToken);
  }

  // Get access token
  static Future<String?> getAccessToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_accessTokenKey);
  }

  // Get refresh token
  static Future<String?> getRefreshToken() async {
    return await _secureStorage.read(key: _refreshTokenKey);
  }

  // Clear all tokens
  static Future<void> clearTokens() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_accessTokenKey);
    await _secureStorage.delete(key: _refreshTokenKey);
  }
}
```

#### 3. API Client with Auto-Refresh
```dart
import 'package:dio/dio.dart';

class ApiClient {
  late Dio _dio;
  
  ApiClient() {
    _dio = Dio(BaseOptions(
      baseUrl: 'YOUR_API_BASE_URL',
      connectTimeout: Duration(seconds: 30),
      receiveTimeout: Duration(seconds: 30),
    ));
    
    _setupInterceptors();
  }

  void _setupInterceptors() {
    // Request interceptor - add access token
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final accessToken = await TokenStorage.getAccessToken();
        if (accessToken != null) {
          options.headers['Authorization'] = 'Bearer $accessToken';
        }
        handler.next(options);
      },
      onError: (error, handler) async {
        if (error.response?.statusCode == 401) {
          // Token expired, try to refresh
          final refreshToken = await TokenStorage.getRefreshToken();
          if (refreshToken != null) {
            try {
              final response = await _dio.post('/auth/refresh', data: {
                'refreshToken': refreshToken,
              });
              
              if (response.statusCode == 200) {
                final newAccessToken = response.data['accessToken'];
                await TokenStorage.storeTokens(
                  accessToken: newAccessToken,
                  refreshToken: refreshToken,
                );
                
                // Retry original request
                error.requestOptions.headers['Authorization'] = 'Bearer $newAccessToken';
                final retryResponse = await _dio.fetch(error.requestOptions);
                handler.resolve(retryResponse);
                return;
              }
            } catch (refreshError) {
              // Refresh failed, clear tokens and redirect to login
              await TokenStorage.clearTokens();
              // Navigate to login screen
              // You'll need to implement navigation logic here
            }
          }
        }
        handler.next(error);
      },
    ));
  }

  // API methods
  Future<Response> get(String path) => _dio.get(path);
  Future<Response> post(String path, {dynamic data}) => _dio.post(path, data: data);
  Future<Response> put(String path, {dynamic data}) => _dio.put(path, data: data);
  Future<Response> delete(String path) => _dio.delete(path);
}
```

#### 4. Authentication Service
```dart
class AuthService {
  final ApiClient _apiClient = ApiClient();

  Future<bool> login(String phoneNumber, String password) async {
    try {
      final response = await _apiClient.post('/auth/login', data: {
        'phoneNumber': phoneNumber,
        'password': password,
      });

      if (response.statusCode == 200) {
        final data = response.data;
        await TokenStorage.storeTokens(
          accessToken: data['accessToken'],
          refreshToken: data['refreshToken'],
        );
        return true;
      }
      return false;
    } catch (e) {
      print('Login error: $e');
      return false;
    }
  }

  Future<bool> logout() async {
    try {
      await _apiClient.post('/auth/logout');
      await TokenStorage.clearTokens();
      return true;
    } catch (e) {
      print('Logout error: $e');
      return false;
    }
  }

  Future<bool> isLoggedIn() async {
    final accessToken = await TokenStorage.getAccessToken();
    return accessToken != null;
  }
}
```

#### 5. State Management (Provider Example)
```dart
import 'package:flutter/foundation.dart';

class AuthProvider extends ChangeNotifier {
  final AuthService _authService = AuthService();
  bool _isLoggedIn = false;
  Map<String, dynamic>? _user;

  bool get isLoggedIn => _isLoggedIn;
  Map<String, dynamic>? get user => _user;

  Future<void> checkAuthStatus() async {
    _isLoggedIn = await _authService.isLoggedIn();
    notifyListeners();
  }

  Future<bool> login(String phoneNumber, String password) async {
    final success = await _authService.login(phoneNumber, password);
    if (success) {
      _isLoggedIn = true;
      notifyListeners();
    }
    return success;
  }

  Future<void> logout() async {
    await _authService.logout();
    _isLoggedIn = false;
    _user = null;
    notifyListeners();
  }
}
```

## Security Features

### 1. Token Validation
- Access tokens are validated on every request
- Refresh tokens are validated when refreshing
- Both tokens are checked against database blacklist

### 2. Token Blacklisting
- Logout blacklists all user tokens
- Compromised tokens can be manually blacklisted
- Daily cleanup job blacklists expired tokens

### 3. Token Types
- Access tokens have `type: 'access'` in payload
- Refresh tokens have `type: 'refresh'` in payload
- Middleware validates correct token type

## Error Handling

### Common Error Codes
- `TOKEN_EXPIRED`: Access token has expired
- `TOKEN_INVALID`: Access token is invalid or blacklisted
- `INVALID_TOKEN_TYPE`: Wrong token type used
- `TOKEN_BLACKLISTED`: Token has been blacklisted

### Error Response Format
```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

## Migration Steps

### Backend
1. **Run Database Migration:**
   ```bash
   npx prisma migrate dev --name add_token_type
   ```

### Flutter App
1. **Add Dependencies:**
   ```yaml
   flutter_secure_storage: ^8.0.0
   dio: ^5.0.0
   shared_preferences: ^2.2.0
   ```

2. **Update Authentication:**
   - Implement TokenStorage class
   - Update login/logout flows
   - Add automatic token refresh

3. **Update API Client:**
   - Add request/response interceptors
   - Handle 401 errors automatically
   - Implement retry mechanism

4. **Update State Management:**
   - Handle new token structure
   - Manage authentication state
   - Handle token refresh events

5. **Test the Flow:**
   - Login to get both tokens
   - Make API requests with access token
   - Test automatic refresh when access token expires
   - Test logout functionality

## Flutter-Specific Considerations

### 1. Secure Storage
- Use `flutter_secure_storage` for refresh tokens
- Use `shared_preferences` for access tokens
- Handle platform differences (iOS/Android)

### 2. App Lifecycle
- Handle token refresh during app startup
- Manage tokens when app goes to background
- Handle network connectivity changes

### 3. Error Handling
- Show appropriate error messages
- Handle network timeouts
- Implement retry logic for failed requests

### 4. Navigation
- Redirect to login when refresh fails
- Handle deep links with authentication
- Manage navigation state

## Benefits

1. **Better Security**: Short-lived access tokens reduce exposure
2. **Better UX**: Users stay logged in longer with refresh tokens
3. **Token Revocation**: Can blacklist refresh tokens to force re-login
4. **Audit Trail**: Track token usage and blacklisting
5. **Scalable**: Works well with mobile apps and web clients
6. **Cross-Platform**: Consistent behavior across iOS and Android 