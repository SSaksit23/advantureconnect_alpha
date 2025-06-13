# Frontend CSRF Protection Integration Guide - AdventureConnect

## 1. Introduction

This guide explains how to integrate the frontend of AdventureConnect with the newly implemented Cross-Site Request Forgery (CSRF) protection mechanism on the backend. Adhering to these steps is crucial for maintaining the security of our application and protecting user data.

**What is CSRF?**
CSRF is an attack that tricks a victim into submitting a malicious request. It inherits the identity and privileges of the victim to perform an undesired function on their behalf. Our new protection mechanism helps prevent such attacks.

**How Our Protection Works (Overview)**
We use a token-based approach. The backend generates a unique, secret CSRF token for each user session.
1.  The frontend fetches this token.
2.  For any state-changing request (like creating a booking or updating a profile), the frontend must send this token back to the backend in a custom HTTP header.
3.  The backend validates this token. If it's missing or invalid, the request is rejected.

The backend sets a cookie named `_csrfToken` which is readable by client-side JavaScript. This cookie contains the CSRF token value that your frontend code will use.

## 2. Step-by-Step Integration

### Step 2.1: Obtaining a CSRF Token

Your frontend application needs to obtain a CSRF token from the backend.

**When to Fetch a Token:**
*   **Immediately after successful login:** Once the user logs in and receives their JWT (access token), make a request to get the CSRF token.
*   **On initial application load (if already authenticated):** If the user has a valid JWT from a previous session, fetch a new CSRF token when the application loads and confirms their authenticated state.
*   **Optionally, if a CSRF error (403) occurs:** You might attempt to fetch a new token and retry the request, though this depends on your error handling strategy.

**How to Fetch:**
Make a `GET` request to the following endpoint:
```
GET /api/auth/csrf-token
```
*   This request **must be authenticated** (i.e., include the user's JWT `Authorization: Bearer <token>` header).
*   The backend will respond with a JSON object containing the CSRF token and also set a cookie.

**Example Response (JSON):**
```json
{
  "success": true,
  "csrfToken": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8"
}
```
**Cookie Set by Backend:**
The backend will also set a cookie named `_csrfToken` (the name comes from `CSRF_COOKIE_NAME` in the backend config). This cookie is:
*   **Readable by JavaScript:** It is *not* `HttpOnly`.
*   `Secure` (in production): Sent only over HTTPS.
*   `SameSite=Lax` (or `Strict`): Provides some default browser protection.
*   Contains the CSRF token value.

### Step 2.2: Storing/Accessing the CSRF Token

The primary way to access the CSRF token on the frontend is by reading the `_csrfToken` cookie that the backend sets.

**Reading from Cookie:**
You can use a simple JavaScript function to read the cookie value:
```javascript
function getCsrfTokenFromCookie() {
  const name = '_csrfToken='; // Backend constant CSRF_COOKIE_NAME
  const decodedCookie = decodeURIComponent(document.cookie);
  const ca = decodedCookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === ' ') {
      c = c.substring(1);
    }
    if (c.indexOf(name) === 0) {
      return c.substring(name.length, c.length);
    }
  }
  return ""; // Or null
}

// Usage:
// const csrfToken = getCsrfTokenFromCookie();
```

**Alternative (Less Recommended for this Setup): Storing in JavaScript Memory**
While the cookie method is preferred because the backend manages its lifecycle, if you choose to use the `csrfToken` from the JSON response of `/api/auth/csrf-token`, you would store it in your application's state (e.g., React Context, Redux store, or a global variable).

```javascript
// Example: Storing in React state (e.g., within an AuthContext)
// const [csrfToken, setCsrfToken] = useState(null);
//
// const fetchCsrfToken = async () => {
//   try {
//     const response = await axios.get('/api/auth/csrf-token'); // Assuming axios is configured with JWT
//     if (response.data.success) {
//       setCsrfToken(response.data.csrfToken);
//     }
//   } catch (error) {
//     console.error("Failed to fetch CSRF token:", error);
//   }
// };
```
If you use this method, ensure the token is cleared upon logout. However, relying on the cookie set by the backend is simpler and generally more robust for this pattern.

### Step 2.3: Including the CSRF Token in Requests

For every state-changing request your frontend makes, you must include the CSRF token in a custom HTTP header.

**Requests Requiring CSRF Token:**
*   `POST`
*   `PUT`
*   `DELETE`
*   `PATCH`

(GET, HEAD, OPTIONS requests typically do not require CSRF tokens as they should not change server state.)

**Header Name:**
`X-CSRF-Token` (the name comes from `CSRF_HEADER_NAME` in the backend config)

**Example using `axios`:**
The best way to handle this is by using an `axios` request interceptor.

```javascript
// apiService.js or similar
import axios from 'axios';

// Function to get CSRF token from cookie
function getCsrfTokenFromCookie() {
  const name = '_csrfToken=';
  const decodedCookie = decodeURIComponent(document.cookie);
  const ca = decodedCookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === ' ') {
      c = c.substring(1);
    }
    if (c.indexOf(name) === 0) {
      return c.substring(name.length, c.length);
    }
  }
  return null;
}

const apiClient = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
  // You might have other default configurations here
});

// Request Interceptor to add JWT and CSRF Token
apiClient.interceptors.request.use(
  (config) => {
    // Add JWT (Access Token)
    const accessToken = localStorage.getItem('accessToken'); // Or from your auth context
    if (accessToken) {
      config.headers['Authorization'] = `Bearer ${accessToken}`;
    }

    // Add CSRF Token for state-changing methods
    const methodsRequiringCsrf = ['POST', 'PUT', 'DELETE', 'PATCH'];
    if (methodsRequiringCsrf.includes(config.method.toUpperCase())) {
      const csrfToken = getCsrfTokenFromCookie(); // Read from the cookie
      if (csrfToken) {
        config.headers['X-CSRF-Token'] = csrfToken;
      } else {
        // Handle missing CSRF token - perhaps log an error or queue the request
        // For now, we'll let it proceed and the backend will reject if needed.
        console.warn('CSRF token not found in cookie. Request might be rejected by the server.');
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default apiClient;
```
Now, use `apiClient` for all your API calls.

## 3. Token Lifecycle & Best Practices

*   **Token Association:** CSRF tokens issued by the backend are associated with the authenticated user's session (via Redis on the backend).
*   **Token Expiry:** The CSRF tokens have a Time-To-Live (TTL) defined on the backend (default is 15 minutes, configurable via `CSRF_TOKEN_TTL_SECONDS`). The `_csrfToken` cookie will also have a similar `maxAge`.
*   **Fetching New Tokens:**
    *   Always fetch a new token after login.
    *   Fetch a new token on application startup if the user is already logged in (to ensure a fresh token).
    *   If you encounter a `403 Forbidden` error that specifically indicates a CSRF validation failure, you should prompt the user to refresh the page or try logging out and logging back in, which will trigger a new CSRF token fetch.
*   **Logout:** When a user logs out, the frontend should clear any locally stored JWTs. The backend's JWT blacklist will handle access token revocation. The CSRF token, being tied to the session which is now invalid (due to JWT invalidation), effectively becomes useless. The `_csrfToken` cookie will eventually expire or be overwritten on the next login.
*   **Single Page Applications (SPAs):** In SPAs, ensure that the CSRF token is fetched and updated correctly during the application lifecycle, especially after re-authentication or session renewal.

## 4. Troubleshooting Common Issues

*   **`403 Forbidden` Error:**
    *   **Cause:** Most likely, the `X-CSRF-Token` header was missing, or the token sent was invalid, expired, or did not match the one expected by the backend for the user's session.
    *   **Solution:**
        1.  Verify that your `axios` interceptor (or equivalent `fetch` logic) is correctly reading the token from the `_csrfToken` cookie and adding it to the `X-CSRF-Token` header for `POST`, `PUT`, `DELETE`, `PATCH` requests.
        2.  Ensure you are fetching a new CSRF token from `/api/auth/csrf-token` after login or when the app loads for an authenticated user.
        3.  Check browser developer tools to see if the `_csrfToken` cookie is present and has a value.
        4.  Check the network request to see if the `X-CSRF-Token` header is being sent with the correct value.
*   **CSRF Token is Empty/Null:**
    *   **Cause:** The `_csrfToken` cookie might not be set, or your `getCsrfTokenFromCookie()` function might not be finding it. This could happen if the call to `/api/auth/csrf-token` failed or was not made.
    *   **Solution:** Ensure the `/api/auth/csrf-token` endpoint is called successfully and that the cookie is being set by the backend. Debug your cookie reading function.
*   **CORS Issues:** Ensure your backend CORS configuration allows the `X-CSRF-Token` header. (The current backend `server.js` seems to allow `Content-Type` and `Authorization` by default; custom headers like `X-CSRF-Token` might need to be explicitly added if issues arise, though often `*` or specific enumeration handles this).
    ```javascript
    // Backend server.js (example if needed)
    // app.use(cors({
    //   // ... other options
    //   allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'] 
    // }));
    ```
    However, standard browser behavior with `SameSite=Lax` cookies and custom headers usually works well with typical CORS setups.

## 5. React Integration Examples

### 5.1. Updating `AuthContext` (Conceptual)

If you have an `AuthContext`, you can integrate CSRF token fetching there.

```javascript
// frontend/src/contexts/AuthContext.js (Conceptual additions)
import React, { createContext, useContext, useState, useEffect } from 'react';
import apiClient from '../services/apiService'; // Assuming your configured axios instance

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // ... other states like accessToken, refreshToken

  // Function to fetch CSRF token (can be called after login/app load)
  const fetchAndSetCsrfToken = async () => {
    try {
      // The /api/auth/csrf-token endpoint itself is protected by JWT auth.
      // The apiClient interceptor will add the JWT.
      // The backend sets the _csrfToken cookie. We don't strictly need to store
      // the token from the JSON response if we rely on the cookie.
      await apiClient.get('/auth/csrf-token');
      console.log('CSRF token cookie should be set/refreshed by the backend.');
    } catch (error) {
      console.error('Failed to fetch/set CSRF token:', error);
      // Handle error, maybe logout user if CSRF token is critical for app start
    }
  };

  const login = async (email, password) => {
    try {
      const response = await apiClient.post('/auth/login', { email, password });
      // Store JWTs (accessToken, refreshToken) from response.data
      localStorage.setItem('accessToken', response.data.accessToken);
      localStorage.setItem('refreshToken', response.data.refreshToken);
      setUser(response.data.user);
      
      await fetchAndSetCsrfToken(); // Fetch CSRF token after successful login
      return { success: true };
    } catch (error) {
      // Handle login error
      return { success: false, error: error.response?.data?.message || 'Login failed' };
    }
  };

  const logout = async () => {
    try {
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        // The apiClient interceptor will add JWT and CSRF token to this POST request
        await apiClient.post('/auth/logout', { refreshToken }); 
      }
    } catch (error) {
      console.error('Logout API call failed:', error);
    } finally {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      setUser(null);
      // Optionally clear the _csrfToken cookie, though it will be overwritten/expire
      document.cookie = "_csrfToken=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    }
  };

  // On initial load, check auth status and fetch CSRF if authenticated
  useEffect(() => {
    const initializeAuth = async () => {
      setLoading(true);
      const accessToken = localStorage.getItem('accessToken');
      if (accessToken) {
        try {
          // Verify JWT and get user data
          const verifyResponse = await apiClient.get('/auth/verify'); // apiClient adds JWT
          setUser(verifyResponse.data.user);
          await fetchAndSetCsrfToken(); // Fetch CSRF token if verified
        } catch (error) {
          console.error("Session verification failed:", error);
          // Token invalid or expired, perform logout
          await logout(); 
        }
      }
      setLoading(false);
    };
    initializeAuth();
  }, []);


  const value = { user, login, logout, loading, isAuthenticated: !!user /* ... other values */ };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
```

### 5.2. Using the `apiClient` with CSRF Interceptor

Once `apiService.js` (from Step 2.3) is set up, use it for all API calls:

```javascript
// ExampleComponent.js
import React, { useState } from 'react';
import apiClient from '../services/apiService'; // Your configured axios instance
import { toast } from 'react-toastify';

function UpdateProfile() {
  const [bio, setBio] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // The apiClient interceptor automatically adds Authorization (JWT) 
      // and X-CSRF-Token headers for this POST request.
      const response = await apiClient.post('/profile/update', { bio });
      toast.success('Profile updated successfully!');
      // Handle response
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update profile.');
      // Handle error (e.g., display error message)
      // If error.response.status === 403, it might be a CSRF issue.
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Your bio" />
      <button type="submit">Update Bio</button>
    </form>
  );
}

export default UpdateProfile;
```

## 6. Security Considerations

*   **HTTPS Everywhere:** Always use HTTPS in production. This protects both JWTs and CSRF tokens from being intercepted. The `Secure` flag on cookies (including `_csrfToken`) enforces this.
*   **Token Scope:** The `_csrfToken` cookie is typically scoped to your domain and path (`/`).
*   **Do Not Expose CSRF Tokens Unnecessarily:** While the `_csrfToken` cookie is readable by JavaScript on your domain, avoid logging it or embedding it directly in HTML if not needed. The pattern of reading it just before making a request is generally secure.
*   **CORS Configuration:** Ensure your backend's CORS policy is correctly configured. While CSRF is a different attack vector than XSS (which CORS helps mitigate), misconfigured CORS can sometimes complicate things.
*   **Regularly Review:** Periodically review your CSRF protection implementation to ensure it remains effective as your application evolves.

By following this guide, you will correctly integrate the frontend with our backend's CSRF protection, significantly enhancing the security of AdventureConnect. If you encounter any issues, please refer to the troubleshooting section or consult with the backend team.
