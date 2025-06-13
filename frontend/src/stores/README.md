# AdventureConnect Frontend State Management with Zustand

## 1. Introduction

This document outlines the state management strategy for the AdventureConnect frontend, primarily using **Zustand**. Zustand is a small, fast, and scalable state-management solution with a comfortable flux-like API based on simplified flux principles. It was chosen for its simplicity, minimal boilerplate, excellent performance, and ease of integration.

This guide will help developers understand how to use our global state stores, when to use them, and how to migrate existing component-level state.

## 2. Core Stores

We have three primary global stores:

*   `authStore.js`: Manages user authentication, session data, and related API calls.
*   `tripStore.js`: Manages the complex state of the trip customization process, including trip details, components (flights, hotels, activities), and route planning.
*   `uiStore.js`: Manages global UI states like modals, global loading indicators, sidebar state, and theme.

### 2.1. `authStore.js`

*   **Purpose**: Handles all aspects of user authentication, including user profile, access/refresh tokens, CSRF tokens, loading states, and error messages related to authentication.
*   **Key State Properties**:
    *   `user`: Object containing the authenticated user's profile information.
    *   `accessToken`: The JWT access token.
    *   `refreshToken`: The JWT refresh token.
    *   `csrfToken`: The CSRF token for secure state-changing requests.
    *   `isAuthenticated`: Boolean indicating if the user is currently authenticated.
    *   `isLoading`: Boolean for loading states during auth operations.
    *   `error`: Stores any error messages from auth operations.
*   **Key Actions**:
    *   `login(email, password)`: Authenticates the user and stores session data.
    *   `register(userData)`: Registers a new user and logs them in.
    *   `logout()`: Clears session data and calls the backend logout endpoint.
    *   `attemptRefreshToken()`: Tries to get a new access token using the refresh token.
    *   `verifyAuth()`: Checks authentication status on app load using stored tokens.
    *   `fetchCsrfToken()`: Fetches a new CSRF token from the backend.
*   **Persistence**: Uses `zustand/middleware/persist` to store `user`, `accessToken`, `refreshToken`, and `isAuthenticated` in `localStorage`. `csrfToken` is session-specific and fetched on demand.

### 2.2. `tripStore.js`

*   **Purpose**: Manages the entire lifecycle and data of a user's custom trip. This includes all details entered during the multi-step trip customization process.
*   **Key State Properties**:
    *   `tripData`: A large object containing all trip information (see `initialTripState` in the store for full structure). Key sub-properties include:
        *   `id`: The unique ID of the trip.
        *   `title`, `destinations`, `start_date`, `end_date`, `number_of_travelers`, `budget_amount`, `currency`.
        *   `inspiration_source`, `inspiration_reference_id`, `ai_image_url`.
        *   `preferences`: User's travel style, interests, pace, etc.
        *   `components`: An array of selected flights, hotels, activities.
        *   `routePlanning`: Itinerary items, waypoints.
        *   `status`: e.g., 'draft', 'planned', 'booked'.
    *   `isLoading`: Boolean for loading states during trip save/create/load operations.
    *   `isFetchingExisting`: Boolean specifically for loading an existing trip.
    *   `isUploadingAiImage`: Boolean for AI image upload state.
    *   `error`: Stores any error messages from trip operations.
*   **Key Actions**:
    *   `initializeTrip(tripIdToLoad)`: Resets or loads a trip.
    *   `updateTripDetails(details)`: Updates general trip information.
    *   `updatePreferences(newPreferences)`: Updates user's travel preferences for the trip.
    *   `loadTrip(tripId)`: Fetches an existing trip from the backend.
    *   `createTrip(initialDetails)`: Creates a new trip draft on the backend.
    *   `saveTrip()`: Saves the current state of the trip to the backend.
    *   `addComponent(componentData)`, `updateComponent(id, updates)`, `removeComponent(id)`: Manage trip components.
    *   `updateRouteItinerary(items)`, `updateRouteWaypoints(points)`: Manage route planning.
    *   `setAiImageFile(file)`: Handles AI inspiration image file.
    *   `resetTrip()`: Resets the trip data to its initial state.
*   **Persistence**: Uses `zustand/middleware/persist` to store key parts of `tripData` in `localStorage`, allowing users to resume incomplete trip planning sessions. Transient data like file objects (`ai_image_file_for_upload`) are not persisted.

### 2.3. `uiStore.js`

*   **Purpose**: Manages global UI states that are not tied to a specific feature domain but affect the overall application interface.
*   **Key State Properties**:
    *   `modals`: An object to manage the state (isOpen, props) of various modals (e.g., `modals.loginModal.isOpen`).
    *   `globalLoading`: Object `{ isActive, message }` for displaying a global loading indicator.
    *   `sidebar`: Object `{ isOpen, contentType, contextData }` for managing a global sidebar.
    *   `theme`: Current application theme ('light' or 'dark').
*   **Key Actions**:
    *   `openModal(modalId, props)`, `closeModal(modalId)`, `closeAllModals()`: Manage modal visibility.
    *   `setGlobalLoading(isActive, message)`: Control the global loading indicator.
    *   `openSidebar(contentType, contextData)`, `closeSidebar()`, `toggleSidebar()`: Manage sidebar state.
    *   `setTheme(newTheme)`, `toggleTheme()`, `initializeTheme()`: Manage application theme, including persistence to `localStorage` and system preference detection.
*   **Persistence**: Only the `theme` is persisted to `localStorage` via manual `localStorage.setItem` calls within its actions. Other UI states are generally transient.

## 3. How to Use the Stores

Zustand stores are used via custom hooks that provide access to state slices and actions.

### 3.1. Accessing State

Each store typically exports custom hooks (selectors) to access specific parts of its state. This is preferred for performance as components will only re-render if the selected state slice changes.

**Example: Accessing authentication state**
```javascript
import { useAuthUser, useIsAuthenticated, useAuthLoading, useAuthError, useAuthTokens } from './stores/authStore';

function UserProfile() {
  const user = useAuthUser();
  const isAuthenticated = useIsAuthenticated();
  const isLoading = useAuthLoading();
  const error = useAuthError();
  const { accessToken, csrfToken } = useAuthTokens();

  if (isLoading) return <p>Loading auth state...</p>;
  if (error) return <p>Auth Error: {error}</p>;

  return isAuthenticated ? (
    <div>
      <p>Welcome, {user.firstName}!</p>
      <p>Access Token (first 10 chars): {accessToken?.substring(0, 10)}...</p>
      <p>CSRF Token (first 10 chars): {csrfToken?.substring(0, 10)}...</p>
    </div>
  ) : (
    <p>Please log in.</p>
  );
}
```

**Example: Accessing trip data**
```javascript
import { useCurrentTripData, useTripLoadingStates, useTripError } from './stores/tripStore';

function TripTitleDisplay() {
  const tripData = useCurrentTripData();
  const { isLoading, isFetchingExisting } = useTripLoadingStates();
  const error = useTripError();

  if (isFetchingExisting) return <p>Loading trip...</p>;
  if (isLoading) return <p>Processing trip data...</p>; // For save/create
  if (error) return <p>Trip Error: {error}</p>;

  return <h1>{tripData.title || 'Untitled Trip'}</h1>;
}
```

### 3.2. Calling Actions

Actions are also exposed via custom hooks, typically grouped for convenience.

**Example: Using authentication actions**
```javascript
import { useAuthActions } from './stores/authStore';
import { toast } from 'react-toastify';

function LoginForm() {
  const { login } = useAuthActions();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    const result = await login(email, password);
    if (result.success) {
      toast.success(`Welcome, ${result.user.firstName}!`);
      // Navigate or update UI
    } else {
      toast.error(result.error);
    }
  };

  // ... form JSX ...
}
```

**Example: Using trip actions**
```javascript
import { useTripActions, useCurrentTripData } from './stores/tripStore';

function TripDetailsForm() {
  const tripData = useCurrentTripData();
  const { updateTripDetails, saveTrip } = useTripActions();
  const isLoading = useTripStore(state => state.isLoading);

  const handleTitleChange = (e) => {
    updateTripDetails({ title: e.target.value });
  };

  return (
    <div>
      <input value={tripData.title} onChange={handleTitleChange} placeholder="Trip Title" />
      <button onClick={saveTrip} disabled={isLoading}>
        {isLoading ? 'Saving...' : 'Save Trip'}
      </button>
    </div>
  );
}
```

### 3.3. Initialization

*   **`authStore`**: `verifyAuth()` action should be called once when the application mounts (e.g., in `App.js` `useEffect`) to check for existing sessions from `localStorage`.
    ```javascript
    // In App.js or your main layout component
    useEffect(() => {
      useAuthStore.getState().verifyAuth(); // Call directly on the store
    }, []);
    ```
*   **`tripStore`**: `initializeTrip(tripIdFromUrl)` should be called when the trip customization component mounts. The `tripIdFromUrl` can be obtained using `useParams` from `react-router-dom`.
    ```javascript
    // In TripCustomizationOrchestrator.js
    useEffect(() => {
      const { initializeTrip } = useTripStore.getState();
      initializeTrip(paramTripId || null); // paramTripId from useParams()
    }, [paramTripId]); // Re-initialize if tripId in URL changes
    ```
*   **`uiStore`**: `initializeTheme()` is called automatically when the `uiStore.js` module is first imported, setting the theme from `localStorage` or system preference.

## 4. When to Use Which Store (and When Not To)

### Global Stores vs. Local Component State (`useState`, `useReducer`)

*   **Global Stores (Zustand)**:
    *   Use for state that needs to be accessed or modified by multiple, potentially unrelated, components across the application.
    *   Suitable for data that has a clear "single source of truth" (e.g., authentication status, the currently active trip plan).
    *   Ideal for managing complex application-wide states and their associated asynchronous logic (API calls).
    *   When data needs to persist across sessions (using `persist` middleware).

*   **Local Component State (`useState`, `useReducer`)**:
    *   Use for state that is only relevant to a single component or a small group of closely related parent/child components.
    *   Examples: UI state for a specific form (e.g., input values before submission, dropdown visibility), state for a purely presentational component, temporary UI toggles.
    *   If state only needs to be passed down one or two levels via props, local state is often simpler.
    *   `useReducer` is good for complex local state logic within a component.

### Choosing the Right Global Store:

*   **`authStore.js`**:
    *   Everything related to user identity, authentication status, tokens (access, refresh, CSRF).
    *   Actions for login, logout, registration, token refresh, session verification.
    *   User profile data that is broadly used (e.g., for display in headers, user menus).

*   **`tripStore.js`**:
    *   The entire `tripData` object being built or edited in the multi-step customization flow.
    *   Loading and error states specifically related to fetching, creating, or saving trip data.
    *   Actions to modify any part of the `tripData` (e.g., adding a flight component, updating destinations, changing preferences).
    *   Transient state related to trip editing if it needs to be accessed by multiple distinct parts of the trip builder (e.g., `ai_image_file_for_upload` before it's processed).

*   **`uiStore.js`**:
    *   States controlling global UI elements like modals, sidebars, global loading spinners (not tied to a specific data fetch like in `authStore` or `tripStore`).
    *   Application-wide settings like theme (light/dark mode).
    *   Any UI state that needs to be triggered or read from disparate parts of the application. For example, if an action in `tripStore` needs to open a confirmation modal, it might call an action in `uiStore`.

## 5. Migration Patterns from `useState` to Zustand

Migrating components with many `useState` hooks (like the original `TripCustomizationEngine.js`) to use Zustand involves centralizing shared state and logic.

**Original Pattern (Simplified Example):**
```javascript
// OldComponent.js
function OldComponent() {
  const [title, setTitle] = useState('');
  const [destinations, setDestinations] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  // ... many more useState hooks ...

  const handleSave = async () => {
    setIsLoading(true);
    try {
      // API call to save { title, destinations }
      await api.saveTrip({ title, destinations });
      toast.success("Saved!");
    } catch (e) {
      toast.error("Failed to save.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <input value={title} onChange={(e) => setTitle(e.target.value)} />
      {/* ... other inputs and UI ... */}
      <button onClick={handleSave} disabled={isLoading}>Save</button>
    </div>
  );
}
```

**New Pattern with Zustand (`tripStore`):**

1.  **Move State to Store**: `title`, `destinations`, and related data become part of `tripData` in `tripStore.js`. `isLoading` also moves to the store.
2.  **Move Logic (Actions) to Store**: The `handleSave` logic (API call, loading state updates, error handling) becomes an action in `tripStore.js` (e.g., `saveTrip()`).
3.  **Component Uses Store**: The component subscribes to relevant state slices and calls actions from the store.

```javascript
// NewComponent.js using tripStore
import { useCurrentTripData, useTripActions, useTripLoadingStates } from './stores/tripStore';

function NewComponent() {
  const tripData = useCurrentTripData(); // Gets the whole tripData object
  const { updateTripDetails, saveTrip } = useTripActions();
  const { isLoading } = useTripLoadingStates(); // Specific loading state from the store

  const handleTitleChange = (e) => {
    updateTripDetails({ title: e.target.value }); // Call store action
  };

  const handleSaveClick = async () => {
    await saveTrip(); // Call store action, which handles API call and loading states
    // Toast notifications are now handled within the saveTrip action in the store.
  };

  return (
    <div>
      <input value={tripData.title} onChange={handleTitleChange} />
      {/* ... other inputs using tripData and updateTripDetails ... */}
      <button onClick={handleSaveClick} disabled={isLoading}>
        {isLoading ? 'Saving...' : 'Save'}
      </button>
    </div>
  );
}
```

**Key Migration Steps for `TripCustomizationEngine`:**

*   **Identify Shared State**: Determine which pieces of state in the original `TripCustomizationEngine` are part of the core `tripData` (e.g., `title`, `destinations`, `components`, `preferences`). These move into `tripStore`.
*   **Identify UI/Local State**: Determine which state is purely for the UI of a specific step or sub-component (e.g., visibility of a local dropdown, input for a search filter within a step). This state can remain local to the refactored step components using `useState` or `useReducer`.
*   **Refactor API Calls**: Move API calls related to creating, loading, and saving the trip into actions within `tripStore`. API calls specific to a step (e.g., fetching example trips for Step 1) can remain within that step's component or be moved to the store if they modify shared trip data.
*   **Prop Reduction**: Components will receive less props. Instead of drilling down `tripData` and numerous `set...` functions, they will import selectors and actions from the store.
*   **Custom Hooks (`useTripData`, `useTripNavigation` in the refactoring plan)**: These hooks, which were part of the refactoring plan for `TripCustomizationEngine`, are essentially precursors or wrappers around the Zustand store logic. The `useTripData` hook's responsibilities (managing `tripData`, API calls) are now largely fulfilled by `tripStore`. `useTripNavigation` can remain a local custom hook for the `TripCustomizationOrchestrator` if its state (`currentStep`) is primarily local to that orchestrator. If `currentStep` needs to be accessed or modified globally, it could also move to `tripStore` or `uiStore`.

## 6. Best Practices

*   **Keep Stores Focused**: Each store should have a clear domain (auth, trip, UI). Avoid creating a single monolithic store.
*   **Selectors for Performance**: Use specific selectors (e.g., `useAuthUser`, `useCurrentTripData(state => state.tripData.title)`) to ensure components only re-render when the data they actually care about changes. Zustand's default shallow equality check helps, but granular selectors are better.
*   **Actions for Logic**: Encapsulate all state modification logic, including asynchronous operations (API calls), within store actions. Components should call actions, not directly modify state.
*   **Error Handling**: Handle errors within store actions and update an `error` state property. Components can then subscribe to this error state to display messages.
*   **Loading States**: Manage loading states (e.g., `isLoading`) within the store for asynchronous actions. Components subscribe to these states to show loading indicators.
*   **Immutability**: While Zustand doesn't strictly enforce immutability like Redux, it's good practice to treat state as immutable within your actions (e.g., `set(state => ({ count: state.count + 1 }))` or `set(state => ({ user: { ...state.user, name: newName } }))`).
*   **Zustand DevTools**: Use the Redux DevTools browser extension with Zustand for easier debugging. You might need to wrap your store creation with `devtools` from `zustand/middleware`.
    ```javascript
    // Example:
    // import { devtools } from 'zustand/middleware';
    // export const useAuthStore = create(devtools(persist((set, get) => ({ ... }))));
    ```

## 7. Axios Interceptors and State

*   The global Axios interceptor (for automatically refreshing JWTs and adding CSRF tokens) should be configured in a central place (e.g., `apiClient.js`).
*   This interceptor can use `useAuthStore.getState()` to access the current tokens (`accessToken`, `csrfToken`) and the `attemptRefreshToken()` action. This decouples the interceptor logic from React's lifecycle.

**Example `apiClient.js` (Conceptual):**
```javascript
import axios from 'axios';
import { useAuthStore } from './stores/authStore'; // Adjust path

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
const CSRF_HEADER_NAME = 'X-CSRF-Token'; // Ensure this matches backend

const apiClient = axios.create({ baseURL: API_BASE_URL });

apiClient.interceptors.request.use(
  (config) => {
    const { accessToken, csrfToken } = useAuthStore.getState();
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
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
    if (error.response?.status === 401 && !originalRequest._retry && originalRequest.url !== '/auth/refresh') {
      originalRequest._retry = true; // Mark to prevent infinite retry loops
      const refreshedSuccessfully = await useAuthStore.getState().attemptRefreshToken();
      if (refreshedSuccessfully) {
        originalRequest.headers.Authorization = `Bearer ${useAuthStore.getState().accessToken}`;
        return apiClient(originalRequest); // Retry the original request with the new token
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
```
This `apiClient` instance would then be used by components and potentially by store actions if they don't need their own specialized instance.

By adopting this Zustand-based state management system, AdventureConnect's frontend will become more robust, maintainable, and easier to develop for.
