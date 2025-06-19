# API Error Handling Guide

## HTTP Status Codes & Client Responses

### Success Responses (2xx)
| Code | Message | Client Action |
|------|---------|---------------|
| 200 | OK | Process the successful response |
| 201 | Created | Update UI to show new resource |
| 202 | Accepted | Show processing status |

### Authentication Errors (4xx)
| Code | Message | Client Action |
|------|---------|---------------|
| 401 | Unauthorized | - Redirect to login<br>- Clear invalid tokens<br>- Show "Please login again" message |
| 403 | Forbidden | - Show "Access denied" message<br>- Hide restricted features |

### Request Errors (4xx)
| Code | Message | Client Action |
|------|---------|---------------|
| 400 | Bad Request | - Show validation errors<br>- Highlight invalid fields |
| 404 | Not Found | - Show "Resource not found" message<br>- Offer navigation options |
| 408 | Request Timeout | - Show retry button<br>- Implement automatic retry with backoff |
| 413 | Payload Too Large | - Show file size limit message<br>- Offer file compression |
| 415 | Unsupported Media Type | - Show supported file types<br>- Offer format conversion |
| 429 | Too Many Requests | - Implement request throttling<br>- Show "Please wait" message |

### Server Errors (5xx)
| Code | Message | Client Action |
|------|---------|---------------|
| 500 | Internal Server Error | - Show generic error message<br>- Log error for debugging |
| 502 | Bad Gateway | - Show connectivity issue message<br>- Implement retry mechanism |
| 503 | Service Unavailable | - Show maintenance message<br>- Retry with exponential backoff |
| 504 | Gateway Timeout | - Show timeout message<br>- Offer manual retry |

### Network/Offline Errors
| Scenario | Client Action |
|----------|---------------|
| No Connection | - Show offline indicator<br>- Queue operations for later<br>- Enable offline mode |
| Slow Connection | - Show loading states<br>- Implement progressive loading<br>- Reduce payload size |
| Intermittent Connection | - Cache responses<br>- Implement background sync<br>- Show sync status |

## Implementation Examples

### Error Response Format
```typescript
interface ErrorResponse {
  success: false;
  error: string;
  details?: string;
  code: number;
}
```

### Success Response Format
```typescript
interface SuccessResponse {
  success: true;
  data: any;
  message?: string;
}
```

### Error Handling Example
```typescript
async function handleApiResponse(response: Response) {
  if (!response.ok) {
    switch (response.status) {
      case 401:
        // Clear invalid auth state
        clearAuthToken();
        navigateToLogin();
        break;
      
      case 403:
        showErrorMessage("You don't have permission to perform this action");
        break;
      
      case 413:
        showErrorMessage("File is too large. Maximum size is 5MB");
        break;
      
      case 503:
        // Implement retry with backoff
        await retryWithExponentialBackoff(response);
        break;
      
      default:
        showErrorMessage("An error occurred. Please try again");
    }
    throw new ApiError(response.status, await response.json());
  }
  return response.json();
}
```

### Offline Detection Example
```typescript
function handleOffline() {
  // Listen for offline events
  window.addEventListener('offline', () => {
    showOfflineIndicator();
    enableOfflineMode();
  });

  // Listen for online events
  window.addEventListener('online', () => {
    hideOfflineIndicator();
    syncQueuedOperations();
  });
}
```

### Retry Mechanism Example
```typescript
async function retryWithExponentialBackoff(
  operation: () => Promise<any>,
  maxRetries = 3,
  baseDelay = 1000
) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      const delay = baseDelay * Math.pow(2, i);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

## Best Practices

### File Uploads
1. Show upload progress
2. Enable cancel operation
3. Validate file size before upload
4. Show clear error messages
5. Enable retry for failed uploads
6. Cache files for offline upload

### Authentication
1. Clear invalid tokens
2. Refresh expired tokens
3. Show login prompts
4. Secure sensitive data
5. Handle multiple devices

### Offline Support
1. Queue operations
2. Show sync status
3. Cache responses
4. Enable offline mode
5. Background sync
6. Clear error states on reconnection

### User Experience
1. Show loading states
2. Clear error messages
3. Enable retry options
4. Progressive loading
5. Optimistic updates
6. Maintain data consistency

## Testing Recommendations
1. Test all error scenarios
2. Simulate offline mode
3. Test slow connections
4. Validate retry mechanisms
5. Check error messages
6. Verify recovery flows 