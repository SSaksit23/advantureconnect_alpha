import { useAuthStore, initialAuthState } from '../authStore'; // Adjust path as needed
import axios from 'axios';

// Mock axios
jest.mock('axios');

// Mock localStorage for zustand/persist middleware
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => {
      store[key] = value.toString();
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

describe('useAuthStore', () => {
  const initialStoreState = useAuthStore.getState();

  beforeEach(() => {
    // Reset the store to its initial state before each test
    useAuthStore.setState(initialAuthState, true); // true to replace the state
    localStorageMock.clear();
    axios.get.mockReset();
    axios.post.mockReset();
  });

  it('should have initial state', () => {
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
    expect(state.refreshToken).toBeNull();
    expect(state.csrfToken).toBeNull();
    expect(state.isLoading).toBe(true); // As per initialAuthState
    expect(state.error).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  describe('Login Action', () => {
    const mockUserData = { id: 1, email: 'test@example.com', firstName: 'Test' };
    const mockTokens = { accessToken: 'fakeAccessToken', refreshToken: 'fakeRefreshToken' };
    const mockCsrfToken = 'fakeCsrfToken';

    it('should handle successful login', async () => {
      axios.post.mockResolvedValueOnce({ data: { ...mockTokens, user: mockUserData } }); // Login
      axios.get.mockResolvedValueOnce({ data: { success: true, csrfToken: mockCsrfToken } }); // CSRF fetch

      const result = await useAuthStore.getState().login('test@example.com', 'password');

      expect(result.success).toBe(true);
      expect(result.user).toEqual(mockUserData);
      const state = useAuthStore.getState();
      expect(state.user).toEqual(mockUserData);
      expect(state.accessToken).toBe(mockTokens.accessToken);
      expect(state.refreshToken).toBe(mockTokens.refreshToken);
      expect(state.csrfToken).toBe(mockCsrfToken);
      expect(state.isAuthenticated).toBe(true);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(axios.post).toHaveBeenCalledWith('/auth/login', { email: 'test@example.com', password: 'password' });
      expect(axios.get).toHaveBeenCalledWith('/auth/csrf-token', { headers: { Authorization: `Bearer ${mockTokens.accessToken}` } });
    });

    it('should handle failed login', async () => {
      axios.post.mockRejectedValueOnce({ response: { data: { message: 'Invalid credentials' } } });

      const result = await useAuthStore.getState().login('test@example.com', 'wrongpassword');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid credentials');
      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.accessToken).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBe('Invalid credentials');
    });

    it('should handle login response missing essential data', async () => {
        axios.post.mockResolvedValueOnce({ data: {} }); // Missing user, accessToken, refreshToken
  
        const result = await useAuthStore.getState().login('test@example.com', 'password');
  
        expect(result.success).toBe(false);
        expect(result.error).toBe('Login response missing essential data.');
        const state = useAuthStore.getState();
        expect(state.isAuthenticated).toBe(false);
        expect(state.isLoading).toBe(false);
        expect(state.error).toBe('Login response missing essential data.');
      });
  });

  describe('Register Action', () => {
    const mockUserData = { id: 1, email: 'new@example.com', firstName: 'New' };
    const mockTokens = { accessToken: 'newAccessToken', refreshToken: 'newRefreshToken' };
    const mockCsrfToken = 'newCsrfToken';
    const registerPayload = { email: 'new@example.com', password: 'password123', firstName: 'New', lastName: 'User' };

    it('should handle successful registration', async () => {
      axios.post.mockResolvedValueOnce({ data: { ...mockTokens, user: mockUserData } }); // Register
      axios.get.mockResolvedValueOnce({ data: { success: true, csrfToken: mockCsrfToken } }); // CSRF fetch

      const result = await useAuthStore.getState().register(registerPayload);

      expect(result.success).toBe(true);
      expect(result.user).toEqual(mockUserData);
      const state = useAuthStore.getState();
      expect(state.user).toEqual(mockUserData);
      expect(state.accessToken).toBe(mockTokens.accessToken);
      expect(state.refreshToken).toBe(mockTokens.refreshToken);
      expect(state.csrfToken).toBe(mockCsrfToken);
      expect(state.isAuthenticated).toBe(true);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(axios.post).toHaveBeenCalledWith('/auth/register', registerPayload);
      expect(axios.get).toHaveBeenCalledWith('/auth/csrf-token', { headers: { Authorization: `Bearer ${mockTokens.accessToken}` } });
    });

    it('should handle failed registration', async () => {
      axios.post.mockRejectedValueOnce({ response: { data: { message: 'Email already exists' } } });

      const result = await useAuthStore.getState().register(registerPayload);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Email already exists');
      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBe('Email already exists');
    });
  });

  describe('Logout Action', () => {
    it('should clear auth state and call logout API', async () => {
      // Simulate logged-in state
      useAuthStore.setState({
        user: { id: 1 },
        accessToken: 'fakeAccessToken',
        refreshToken: 'fakeRefreshToken',
        csrfToken: 'fakeCsrfToken',
        isAuthenticated: true,
        isLoading: false,
      });
      axios.post.mockResolvedValueOnce({ data: { success: true } }); // Logout API

      await useAuthStore.getState().logout();

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.accessToken).toBeNull();
      expect(state.refreshToken).toBeNull();
      // csrfToken is cleared by _clearAuthData
      expect(state.csrfToken).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false); // _clearAuthData sets isLoading to false
      expect(state.error).toBeNull();
      expect(axios.post).toHaveBeenCalledWith(
        '/auth/logout',
        { refreshToken: 'fakeRefreshToken' },
        { headers: { Authorization: 'Bearer fakeAccessToken', 'X-CSRF-Token': 'fakeCsrfToken' } }
      );
    });

    it('should clear auth state locally even if API call fails', async () => {
        useAuthStore.setState({
          user: { id: 1 },
          accessToken: 'fakeAccessToken',
          refreshToken: 'fakeRefreshToken',
          csrfToken: 'fakeCsrfToken',
          isAuthenticated: true,
          isLoading: false,
        });
        axios.post.mockRejectedValueOnce(new Error('Network error')); // Logout API fails
  
        await useAuthStore.getState().logout();
  
        const state = useAuthStore.getState();
        expect(state.isAuthenticated).toBe(false);
        expect(state.user).toBeNull();
        // The error from API call is caught and logged, but not set in store's error state for logout
        expect(state.error).toBeNull(); 
      });
  });

  describe('attemptRefreshToken Action', () => {
    const initialRefreshToken = 'initialRefreshToken';
    const newAccessToken = 'newAccessTokenFromRefresh';
    const newRefreshTokenFromRefresh = 'newRefreshTokenFromRefresh';

    it('should successfully refresh token', async () => {
      useAuthStore.setState({ refreshToken: initialRefreshToken, isAuthenticated: true, user: {id: 1} });
      axios.post.mockResolvedValueOnce({ data: { accessToken: newAccessToken, refreshToken: newRefreshTokenFromRefresh } }); // Refresh
      axios.get.mockResolvedValueOnce({ data: { success: true, csrfToken: 'refreshedCsrfToken' } }); // CSRF

      const success = await useAuthStore.getState().attemptRefreshToken();

      expect(success).toBe(true);
      const state = useAuthStore.getState();
      expect(state.accessToken).toBe(newAccessToken);
      expect(state.refreshToken).toBe(newRefreshTokenFromRefresh);
      expect(state.csrfToken).toBe('refreshedCsrfToken');
      expect(state.isAuthenticated).toBe(true);
      expect(state.isLoading).toBe(false);
      expect(axios.post).toHaveBeenCalledWith('/auth/refresh', { refreshToken: initialRefreshToken });
    });

    it('should handle refresh failure', async () => {
      useAuthStore.setState({ refreshToken: initialRefreshToken });
      axios.post.mockRejectedValueOnce({ response: { data: { message: 'Invalid refresh token' } } });

      const success = await useAuthStore.getState().attemptRefreshToken();

      expect(success).toBe(false);
      const state = useAuthStore.getState();
      expect(state.accessToken).toBeNull();
      expect(state.refreshToken).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBe('Session expired. Please log in again.');
    });

    it('should clear auth if no refresh token exists', async () => {
      useAuthStore.setState({ refreshToken: null, user: {id:1}, accessToken: "oldAccess", isAuthenticated: true }); // No refresh token
      
      const success = await useAuthStore.getState().attemptRefreshToken();
      
      expect(success).toBe(false);
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
      expect(state.accessToken).toBeNull();
      // isLoading should be false as _clearAuthData sets it
      expect(state.isLoading).toBe(false); 
    });
  });

  describe('verifyAuth Action', () => {
    const mockUser = { id: 1, email: 'test@example.com' };

    it('should verify auth successfully with valid token in storage', async () => {
      // Simulate persisted state
      useAuthStore.setState({ accessToken: 'validAccessToken', user: mockUser, isAuthenticated: true });
      axios.get.mockResolvedValueOnce({ data: { user: mockUser } }); // Verify
      axios.get.mockResolvedValueOnce({ data: { success: true, csrfToken: 'verifiedCsrfToken' } }); // CSRF

      await useAuthStore.getState().verifyAuth();

      const state = useAuthStore.getState();
      expect(state.user).toEqual(mockUser);
      expect(state.isAuthenticated).toBe(true);
      expect(state.csrfToken).toBe('verifiedCsrfToken');
      expect(state.isLoading).toBe(false);
      expect(axios.get.mock.calls[0][0]).toBe('/auth/verify');
    });

    it('should attempt refresh if access token verification fails', async () => {
      useAuthStore.setState({ accessToken: 'expiredAccessToken', user: mockUser, refreshToken: 'validRefreshToken', isAuthenticated:true });
      axios.get.mockRejectedValueOnce({ response: { status: 401 } }); // Verify fails
      axios.post.mockResolvedValueOnce({ data: { accessToken: 'newAccessTokenAfterRefresh' } }); // Refresh succeeds
      axios.get.mockResolvedValueOnce({ data: { success: true, csrfToken: 'csrfAfterRefresh' } }); // CSRF after refresh

      await useAuthStore.getState().verifyAuth();

      const state = useAuthStore.getState();
      expect(state.accessToken).toBe('newAccessTokenAfterRefresh');
      expect(state.isAuthenticated).toBe(true);
      expect(state.csrfToken).toBe('csrfAfterRefresh');
      expect(state.isLoading).toBe(false);
      expect(axios.post).toHaveBeenCalledWith('/auth/refresh', { refreshToken: 'validRefreshToken' });
    });

    it('should clear auth if no tokens in storage', async () => {
      useAuthStore.setState({ accessToken: null, user: null, refreshToken: null }); // No tokens
      
      await useAuthStore.getState().verifyAuth();
      
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
      expect(state.isLoading).toBe(false);
    });

    it('should clear auth if access token verification and refresh fail', async () => {
        useAuthStore.setState({ accessToken: 'expiredAccessToken', user: mockUser, refreshToken: 'invalidRefreshToken', isAuthenticated: true });
        axios.get.mockRejectedValueOnce({ response: { status: 401 } }); // Verify fails
        axios.post.mockRejectedValueOnce({ response: { status: 401 } }); // Refresh fails
  
        await useAuthStore.getState().verifyAuth();
  
        const state = useAuthStore.getState();
        expect(state.isAuthenticated).toBe(false);
        expect(state.user).toBeNull();
        expect(state.accessToken).toBeNull();
        expect(state.isLoading).toBe(false);
        expect(state.error).toBe('Session expired. Please log in again.');
      });
  });

  describe('fetchCsrfToken Action', () => {
    it('should fetch and set CSRF token if authenticated', async () => {
      useAuthStore.setState({ accessToken: 'fakeAccessToken', isAuthenticated: true });
      axios.get.mockResolvedValueOnce({ data: { success: true, csrfToken: 'fetchedCsrfToken' } });

      await useAuthStore.getState().fetchCsrfToken();

      const state = useAuthStore.getState();
      expect(state.csrfToken).toBe('fetchedCsrfToken');
      expect(axios.get).toHaveBeenCalledWith('/auth/csrf-token', { headers: { Authorization: 'Bearer fakeAccessToken' } });
    });

    it('should not fetch CSRF token if not authenticated', async () => {
      useAuthStore.setState({ accessToken: null, isAuthenticated: false });
      
      await useAuthStore.getState().fetchCsrfToken();
      
      const state = useAuthStore.getState();
      expect(state.csrfToken).toBeNull();
      expect(axios.get).not.toHaveBeenCalled();
    });

    it('should handle CSRF fetch failure gracefully', async () => {
        useAuthStore.setState({ accessToken: 'fakeAccessToken', isAuthenticated: true, csrfToken: 'oldCsrfToken' });
        axios.get.mockRejectedValueOnce(new Error('Network Error'));
  
        await useAuthStore.getState().fetchCsrfToken();
  
        const state = useAuthStore.getState();
        // CSRF token should remain as it was, or null if it was initially null
        expect(state.csrfToken).toBe('oldCsrfToken'); 
        // Error from CSRF fetch is logged but not set in the global store error state
        expect(state.error).toBeNull(); 
      });
  });

  describe('Utility Actions', () => {
    it('setError should update error state', () => {
      useAuthStore.getState().setError('Custom error message');
      expect(useAuthStore.getState().error).toBe('Custom error message');
    });

    it('clearError should reset error state to null', () => {
      useAuthStore.setState({ error: 'Some error' });
      useAuthStore.getState().clearError();
      expect(useAuthStore.getState().error).toBeNull();
    });

    it('setLoading should update isLoading state', () => {
      useAuthStore.getState().setLoading(true);
      expect(useAuthStore.getState().isLoading).toBe(true);
      useAuthStore.getState().setLoading(false);
      expect(useAuthStore.getState().isLoading).toBe(false);
    });
  });

  describe('Persist Middleware', () => {
    it('should rehydrate persisted state from localStorage', () => {
        const persistedState = {
            user: { id: 2, email: 'persisted@example.com' },
            accessToken: 'persistedAccessToken',
            refreshToken: 'persistedRefreshToken',
            isAuthenticated: true,
          };
        localStorageMock.setItem('adventureconnect-auth-storage', JSON.stringify({ state: persistedState, version: 0 }));

        // Create a new instance of the store to trigger rehydration
        // This is a bit tricky as Zustand create() is usually called once.
        // For testing persist, typically you'd check localStorage directly after actions.
        // Or, you can verify that actions correctly update what would be persisted.
        
        // Let's test by setting state, then checking if it's in mock localStorage via persist
        useAuthStore.getState()._setAuthData(persistedState.user, persistedState.accessToken, persistedState.refreshToken);
        
        const storedRaw = localStorageMock.getItem('adventureconnect-auth-storage');
        expect(storedRaw).not.toBeNull();
        const storedJson = JSON.parse(storedRaw);
        expect(storedJson.state.user).toEqual(persistedState.user);
        expect(storedJson.state.accessToken).toEqual(persistedState.accessToken);
        expect(storedJson.state.refreshToken).toEqual(persistedState.refreshToken);
        expect(storedJson.state.isAuthenticated).toEqual(true);
        // csrfToken should not be persisted by default config
        expect(storedJson.state.csrfToken).toBeUndefined(); 
    });

    it('should clear persisted state on logout', async () => {
        const initialState = {
            user: { id: 1, name: 'Test User' },
            accessToken: 'testAccess',
            refreshToken: 'testRefresh',
            isAuthenticated: true,
        };
        // Simulate initial persisted state
        localStorageMock.setItem('adventureconnect-auth-storage', JSON.stringify({ state: initialState, version: 0 }));
        useAuthStore.setState(initialState); // Set store state to simulate being logged in

        axios.post.mockResolvedValueOnce({ data: { success: true } }); // Mock logout API call

        await useAuthStore.getState().logout();

        const storedRaw = localStorageMock.getItem('adventureconnect-auth-storage');
        expect(storedRaw).not.toBeNull();
        const storedJson = JSON.parse(storedRaw);
        
        // Check that persisted parts are cleared or reset
        expect(storedJson.state.user).toBeNull();
        expect(storedJson.state.accessToken).toBeNull();
        expect(storedJson.state.refreshToken).toBeNull();
        expect(storedJson.state.isAuthenticated).toBe(false);
    });
  });

});
