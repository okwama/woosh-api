# Token Blacklist Check Documentation

## Overview
The blacklist check is a security mechanism implemented in the authentication middleware to prevent the use of compromised or invalidated tokens.

## How It Works

### 1. Token Blacklist Check
```javascript
// Check if token is blacklisted
const blacklistedToken = await prisma.token.findFirst({
  where: {
    token: token,
    blacklisted: true
  }
});

if (blacklistedToken) {
  // Clear any existing tokens from the client
  res.setHeader('Clear-Site-Data', '"cache", "cookies", "storage"');
  return res.status(401).json({ 
    error: 'Session expired. Please log in again.',
    code: 'TOKEN_BLACKLISTED'
  });
}
```

### 2. When Tokens Get Blacklisted

#### A. Token Rotation (Every 4 Hours)
```javascript
// Check if token needs rotation (every 4 hours)
const tokenAge = Date.now() - tokenRecord.createdAt.getTime();
const fourHours = 4 * 60 * 60 * 1000;

if (tokenAge > fourHours) {
  // Generate new token
  const newToken = jwt.sign(
    { userId: decoded.userId, role: decoded.role },
    process.env.JWT_SECRET,
    { expiresIn: '9h' }
  );

  // Store new token
  await prisma.token.create({
    data: {
      token: newToken,
      salesRepId: decoded.userId,
      expiresAt: new Date(Date.now() + 9 * 60 * 60 * 1000)
    }
  });

  // Blacklist old token
  await prisma.token.update({
    where: { id: tokenRecord.id },
    data: { blacklisted: true }
  });
}
```

#### B. Manual Logout
When a user logs out, their token is blacklisted to prevent reuse.

#### C. Security Breach
If a token is suspected to be compromised, it can be manually blacklisted.

## Database Schema

### Token Table Structure
```sql
CREATE TABLE Token (
  id INT PRIMARY KEY AUTO_INCREMENT,
  token VARCHAR(255) NOT NULL,
  salesRepId INT NOT NULL,
  createdAt DATETIME DEFAULT NOW(),
  expiresAt DATETIME NOT NULL,
  blacklisted BOOLEAN DEFAULT FALSE,
  lastUsedAt DATETIME,
  FOREIGN KEY (salesRepId) REFERENCES SalesRep(id) ON DELETE CASCADE
);
```

### Key Fields
- `token`: The actual JWT token string
- `blacklisted`: Boolean flag indicating if token is blacklisted
- `expiresAt`: Token expiration timestamp
- `lastUsedAt`: Last time the token was used

## Security Benefits

### 1. Token Invalidation
- Prevents reuse of compromised tokens
- Allows immediate invalidation of suspicious tokens
- Maintains security even if JWT hasn't expired

### 2. Session Management
- Tracks active sessions
- Enables forced logout capabilities
- Provides audit trail of token usage

### 3. Token Rotation
- Automatically rotates tokens every 4 hours
- Reduces window of vulnerability
- Maintains user session continuity

## Error Responses

### Blacklisted Token (401)
```json
{
  "error": "Session expired. Please log in again.",
  "code": "TOKEN_BLACKLISTED"
}
```

### Expired Token (401)
```json
{
  "error": "Session expired. Please log in again.",
  "code": "TOKEN_EXPIRED"
}
```

## Client-Side Handling

### 1. Clear Site Data
When a token is blacklisted, the server sends:
```javascript
res.setHeader('Clear-Site-Data', '"cache", "cookies", "storage"');
```

This clears:
- Browser cache
- Cookies
- Local storage
- Session storage

### 2. New Token Header
When token rotation occurs, a new token is sent:
```javascript
res.setHeader('X-New-Token', newToken);
```

## Best Practices

### 1. Regular Cleanup
- Periodically clean up expired blacklisted tokens
- Monitor token usage patterns
- Log suspicious activities

### 2. Token Storage
- Store tokens securely on client side
- Use HTTP-only cookies when possible
- Implement proper token refresh logic

### 3. Error Handling
- Handle blacklisted token errors gracefully
- Redirect users to login when needed
- Provide clear error messages

## Monitoring and Logging

### 1. Track Blacklisted Tokens
```javascript
// Log blacklisted token attempts
console.log(`Blacklisted token attempt: ${token.substring(0, 10)}...`);
```

### 2. Monitor Token Usage
- Track token creation and blacklisting
- Monitor token rotation frequency
- Alert on suspicious patterns

## Example Usage

### Checking Token Status
```javascript
// In your API endpoint
app.get('/protected', authenticateToken, (req, res) => {
  // Token has passed blacklist check
  res.json({ message: 'Access granted' });
});
```

### Handling Blacklisted Tokens
```javascript
// Client-side error handling
if (response.status === 401 && response.data.code === 'TOKEN_BLACKLISTED') {
  // Clear local storage
  localStorage.clear();
  // Redirect to login
  window.location.href = '/login';
}
```

## Security Considerations

### 1. Database Security
- Ensure Token table is properly secured
- Use database encryption for sensitive fields
- Implement proper access controls

### 2. Token Security
- Use strong JWT secrets
- Implement proper token expiration
- Monitor for token leaks

### 3. Rate Limiting
- Implement rate limiting on token validation
- Prevent brute force attacks
- Monitor for suspicious activity 