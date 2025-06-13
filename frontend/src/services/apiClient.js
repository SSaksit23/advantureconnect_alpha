// frontend/src/services/apiClient.js
import axios from 'axios';
import { useAuthStore } from '../stores/authStore'; // Adjust path as necessary

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
const CSRF_HEADER_NAME = 'X-CSRF-Token'; // Ensure this matches backend configuration

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  // withCredentials: true, // Consider if your backend requires cookies for CSRF or sessions
});

// Request Interceptor:
// Adds Authorization (JWT) and CSRF tokens to outgoing requests.
apiClient.interceptors.request.use(
  (config) => {
    const { accessToken, csrfToken } = useAuthStore.getState();

    // Add JWT Access Token to Authorization header
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }

    // Add CSRF Token for state-changing methods (POST, PUT, DELETE, PATCH)
    const methodsRequiringCsrf = ['POST', 'PUT', 'DELETE', 'PATCH'];
    if (methodsRequiringCsrf.includes(config.method.toUpperCase())) {
      if (csrfToken) {
        config.headers[CSRF_HEADER_NAME] = csrfToken;
      } else {
        // This warning is helpful during development.
        // In production, you might want to handle this more gracefully or ensure
        // CSRF token is always available before making such requests.
        console.warn(
          `apiClient: CSRF token is missing for a state-changing request to ${config.url}. ` +
          `Ensure fetchCsrfToken() has been called after login/auth verification.`
        );
        // Depending on strictness, you could even cancel the request here:
        // return Promise.reject(new Error("CSRF token is missing. Request cancelled."));
      }
    }
    return config;
  },
  (error) => {
    // Handle request errors (e.g., network issues before request is sent)
    console.error('apiClient Request Interceptor Error:', error);
    return Promise.reject(error);
  }
);

// Response Interceptor:
// Handles automatic token refresh on 401 Unauthorized errors.
apiClient.interceptors.response.use(
  (response) => response, // Directly return successful responses
  async (error) => {
    const originalRequest = error.config;

    // Check if the error is a 401, it's not a retry attempt, and not the refresh token endpoint itself
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      originalRequest.url !== '/auth/refresh' // Avoid refresh loop
    ) {
      originalRequest._retry = true; // Mark this request as having been retried
      console.info('apiClient: Access token expired or invalid. Attempting refresh...');

      try {
        const refreshedSuccessfully = await useAuthStore.getState().attemptRefreshToken();

        if (refreshedSuccessfully) {
          console.info('apiClient: Token refreshed successfully. Retrying original request.');
          // Update the Authorization header of the original request with the new token
          originalRequest.headers.Authorization = `Bearer ${useAuthStore.getState().accessToken}`;
          // Retry the original request with the new token
          return apiClient(originalRequest);
        } else {
          // Refresh failed. attemptRefreshToken in authStore should handle logout/state clearing.
          // The error will propagate, and UI components should react to unauthenticated state.
          console.warn('apiClient: Token refresh failed. User may need to log in again.');
          // No need to explicitly call logout here, as attemptRefreshToken should manage it.
          // Fall through to reject the promise.
        }
      } catch (refreshError) {
        console.error('apiClient: Error during token refresh attempt:', refreshError);
        // If attemptRefreshToken itself throws, logout should have been handled.
        // Fall through to reject the promise.
      }
    }

    // For all other errors, or if refresh fails, reject the promise
    return Promise.reject(error);
  }
);

export default apiClient;
