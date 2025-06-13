import { create } from 'zustand';
import axios from 'axios';
import { persist, createJSONStorage } from 'zustand/middleware';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
const CSRF_HEADER_NAME = 'X-CSRF-Token'; // Ensure this matches backend

const initialAuthState = {
  user: null,
  accessToken: null,
  refreshToken: null,
  csrfToken: null, // For CSRF protection
  isLoading: true, // True initially while checking auth status
  error: null,
  isAuthenticated: false,
};

// Create an axios instance for auth-related API calls
// This instance will be configured by actions within the store
const authApiClient = axios.create({
  baseURL: API_BASE_URL,
});

export const useAuthStore = create(
  persist(
    (set, get) => ({
      ...initialAuthState,

      // --- Internal Helper Actions ---
      _setAuthData: (userData, newAccessToken, newRefreshToken) => {
        set({
          user: userData,
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
        // localStorage is handled by persist middleware for accessToken, refreshToken, user
        // We might not need to manually set them here if persist is configured correctly.
        // However, persist middleware might not cover csrfToken or other non-token states.
      },

      _clearAuthData: () => {
        set({
          ...initialAuthState,
          isLoading: false, // No longer loading, just not authenticated
          isAuthenticated: false,
        });
        // localStorage clearing for tokens/user is handled by persist middleware on reset/clear
      },

      // --- CSRF Token Management ---
      fetchCsrfToken: async () => {
        const currentAccessToken = get().accessToken;
        if (!currentAccessToken) {
          // Cannot fetch CSRF without being authenticated (usually)
          // Or backend might have a specific CSRF setup for unauth forms
          console.warn("AuthStore: Cannot fetch CSRF token without access token.");
          return;
        }
        try {
          const response = await authApiClient.get('/auth/csrf-token', {
            headers: { Authorization: `Bearer ${currentAccessToken}` },
          });
          if (response.data.success && response.data.csrfToken) {
            set({ csrfToken: response.data.csrfToken });
          } else {
            throw new Error("Failed to retrieve CSRF token from response.");
          }
        } catch (error) {
          console.error('AuthStore: Failed to fetch CSRF token', error);
          // Don't set global error for this, but log it.
          // Components might need to handle UI for missing CSRF if critical.
        }
      },

      // --- Core Authentication Actions ---
      login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authApiClient.post('/auth/login', { email, password });
          const { user: userData, accessToken, refreshToken } = response.data;
          if (!userData || !accessToken || !refreshToken) {
            throw new Error("Login response missing essential data.");
          }
          get()._setAuthData(userData, accessToken, refreshToken);
          await get().fetchCsrfToken(); // Fetch CSRF token after successful login
          return { success: true, user: userData };
        } catch (err) {
          const errorMessage = err.response?.data?.message || err.message || 'Login failed';
          set({ error: errorMessage, isLoading: false, isAuthenticated: false });
          return { success: false, error: errorMessage };
        }
      },

      register: async (userData) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authApiClient.post('/auth/register', userData);
          const { user: newUser, accessToken, refreshToken } = response.data;
          if (!newUser || !accessToken || !refreshToken) {
            throw new Error("Registration response missing essential data.");
          }
          get()._setAuthData(newUser, accessToken, refreshToken);
          await get().fetchCsrfToken(); // Fetch CSRF token after successful registration
          return { success: true, user: newUser };
        } catch (err) {
          const errorMessage = err.response?.data?.message || err.message || 'Registration failed';
          set({ error: errorMessage, isLoading: false, isAuthenticated: false });
          return { success: false, error: errorMessage };
        }
      },

      logout: async () => {
        const currentAccessToken = get().accessToken;
        const currentRefreshToken = get().refreshToken; // Needed by some logout implementations
        const currentCsrfToken = get().csrfToken;

        // Optimistically clear local state
        const previousState = { ...get() }; // Store previous state for potential rollback
        get()._clearAuthData(); // Clear local state immediately

        if (currentAccessToken) {
          try {
            // Call backend to invalidate token (add to blacklist)
            await authApiClient.post('/auth/logout',
              { refreshToken: currentRefreshToken }, // Backend might use refresh token for some logout logic
              {
                headers: {
                  Authorization: `Bearer ${currentAccessToken}`,
                  [CSRF_HEADER_NAME]: currentCsrfToken, // Include CSRF token for state-changing request
                },
              }
            );
          } catch (error) {
            console.error('AuthStore: Logout API call failed', error);
            // If API call fails, user is already logged out client-side.
            // Potentially restore state if logout MUST be confirmed by backend,
            // but usually, client-side logout is sufficient for UX.
            // set(previousState); // Example of rollback
            // set({ error: "Logout failed on server, but you are logged out locally."});
          }
        }
      },

      attemptRefreshToken: async () => {
        const currentRefreshToken = get().refreshToken;
        if (!currentRefreshToken) {
          get()._clearAuthData(); // No refresh token, so clear everything
          return false;
        }

        set({ isLoading: true, error: null }); // Indicate loading during refresh
        try {
          const response = await authApiClient.post('/auth/refresh', { refreshToken: currentRefreshToken });
          const { accessToken: newAccessToken, refreshToken: newRefreshTokenOnRefresh } = response.data;

          if (!newAccessToken) {
            throw new Error("Refresh response missing new access token.");
          }
          
          // User data might not be returned by /refresh, typically we'd re-verify or use existing
          // For simplicity, let's assume we keep the existing user data if refresh is successful
          // Or, make a /auth/verify call here to get fresh user data.
          // For now, let's assume user data remains the same or /verify will be called by protected routes.

          // If the refresh endpoint also returns a new refresh token, update it
          const finalRefreshToken = newRefreshTokenOnRefresh || currentRefreshToken;

          set((state) => ({
            accessToken: newAccessToken,
            refreshToken: finalRefreshToken,
            isAuthenticated: true, // Still authenticated with new token
            isLoading: false,
            error: null,
          }));
          await get().fetchCsrfToken(); // Fetch new CSRF token with new access token
          return true;
        } catch (error) {
          console.error('AuthStore: Token refresh failed', error);
          get()._clearAuthData(); // Clear all auth data if refresh fails
          set({ error: 'Session expired. Please log in again.', isLoading: false });
          return false;
        }
      },

      verifyAuth: async () => {
        // This action is typically called on app initialization
        set({ isLoading: true });
        const currentAccessToken = get().accessToken; // Loaded by persist middleware from localStorage
        const currentUser = get().user;

        if (currentAccessToken && currentUser) {
          try {
            // Verify token with backend
            const response = await authApiClient.get('/auth/verify', {
              headers: { Authorization: `Bearer ${currentAccessToken}` },
            });
            // If verify endpoint returns fresh user data, update it
            const verifiedUser = response.data.user || currentUser;
            set({ user: verifiedUser, isAuthenticated: true, isLoading: false, error: null });
            await get().fetchCsrfToken();
          } catch (error) {
            // Token verification failed (e.g., expired)
            console.warn('AuthStore: Access token verification failed, attempting refresh.', error.response?.data?.message || error.message);
            const refreshed = await get().attemptRefreshToken();
            if (!refreshed) {
              // If refresh also fails, ensure isLoading is false and user is logged out
              set({ isLoading: false }); // attemptRefreshToken already calls _clearAuthData
            } else {
              // Refreshed successfully
              set({ isLoading: false });
            }
          }
        } else {
          // No token or user in storage, not authenticated
          get()._clearAuthData(); // Ensure clean state
          set({ isLoading: false });
        }
      },

      // --- Utility actions for direct state manipulation if needed by components ---
      setError: (errorMessage) => set({ error: errorMessage }),
      clearError: () => set({ error: null }),
      setLoading: (loadingState) => set({ isLoading: loadingState }),

    }),
    {
      name: 'adventureconnect-auth-storage', // name of the item in the storage (must be unique)
      storage: createJSONStorage(() => localStorage), // (optional) by default, 'localStorage' is used
      partialize: (state) => ({
        // Only persist these parts of the state
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
        // csrfToken is typically session-specific and fetched on demand, not persisted long-term this way.
        // If persisted, it should have a very short expiry or be handled carefully.
        // For this setup, we fetch it after login/refresh.
      }),
      onRehydrateStorage: () => (state) => {
        // Optional: Called when storage is rehydrated
        // We can set isLoading to true here before verifyAuth runs if needed,
        // but verifyAuth itself sets isLoading.
        if (state) {
          state.isLoading = true; // Set loading to true before verifyAuth runs
        }
      }
    }
  )
);

// Call verifyAuth on initial load if Zustand is set up at app root
// This is tricky with Zustand's vanilla create.
// Typically, you'd call useAuthStore.getState().verifyAuth() in your app's root component (e.g., App.js useEffect).
// For now, let's assume it will be called from App.js.

// Example of how to initialize and call verifyAuth from App.js:
/*
// In App.js
useEffect(() => {
  useAuthStore.getState().verifyAuth();
}, []);
*/

// Export a custom hook for easier usage and to potentially add selectors later
export const useAuthActions = () => {
  const { login, register, logout, verifyAuth, attemptRefreshToken, setError, clearError, setLoading, fetchCsrfToken } = useAuthStore();
  return { login, register, logout, verifyAuth, attemptRefreshToken, setError, clearError, setLoading, fetchCsrfToken };
};

export const useAuthUser = () => useAuthStore((state) => state.user);
export const useIsAuthenticated = () => useAuthStore((state) => state.isAuthenticated);
export const useAuthLoading = () => useAuthStore((state) => state.isLoading);
export const useAuthError = () => useAuthStore((state) => state.error);
export const useAuthTokens = () => useAuthStore((state) => ({
  accessToken: state.accessToken,
  refreshToken: state.refreshToken,
  csrfToken: state.csrfToken,
}));

// Global Axios interceptor for automatically refreshing token on 401
// This should be set up ONCE in your application, typically where you initialize Axios.
// It uses the Zustand store to attempt token refresh.
// IMPORTANT: This interceptor should be configured on the primary axios instance used for most API calls,
// NOT on the `authApiClient` defined within this store to avoid circular dependencies or infinite loops.
// If you have a global `apiClient.js` file, configure it there.

/*
// Example for a global apiClient.js:
import axios from 'axios';
import { useAuthStore } from './stores/authStore'; // Adjust path

const apiClient = axios.create({ baseURL: API_BASE_URL });

apiClient.interceptors.request.use(
  (config) => {
    const { accessToken, csrfToken } = useAuthStore.getState();
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    // Add CSRF token for state-changing methods
    const methodsRequiringCsrf = ['POST', 'PUT', 'DELETE', 'PATCH'];
    if (methodsRequiringCsrf.includes(config.method.toUpperCase())) {
      if (csrfToken) {
        config.headers[CSRF_HEADER_NAME] = csrfToken;
      } else {
         console.warn('Global API Client: CSRF token missing for state-changing request.');
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    // Check if it's a 401, not a retry, and not a refresh token request itself
    if (error.response?.status === 401 && !originalRequest._retry && originalRequest.url !== '/auth/refresh') {
      originalRequest._retry = true;
      const refreshed = await useAuthStore.getState().attemptRefreshToken();
      if (refreshed) {
        // Update header with new token for the retried request
        originalRequest.headers.Authorization = `Bearer ${useAuthStore.getState().accessToken}`;
        return apiClient(originalRequest); // Retry with the global instance
      } else {
        // If refresh failed, logout might have been called already by attemptRefreshToken
        // Or redirect to login page
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
*/
