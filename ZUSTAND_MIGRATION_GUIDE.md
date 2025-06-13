# AdventureConnect: Zustand State Management Migration Guide

## 1. Introduction

To address complex state management, improve performance, and enhance maintainability in the AdventureConnect frontend, we have transitioned to **Zustand** as our primary global state management library.

**Why Zustand?**
*   **Simplicity & Minimal Boilerplate**: Easier to learn and use compared to Redux.
*   **Performance**: Optimized for minimal re-renders.
*   **Scalability**: Handles complex state effectively.
*   **Flexibility**: Can be used for both global and local state, and coexists with React Context.
*   **DevTools Support**: Integrates with Redux DevTools for easier debugging.

This guide details what has been implemented so far and outlines the necessary next steps for the development team to complete the migration and fully leverage Zustand.

## 2. What Has Been Implemented

The foundational pieces of our Zustand-based state management system are now in place:

### 2.1. Zustand Installation
*   Zustand (`zustand`) has been added as a dependency to `frontend/package.json`. If you haven't pulled the latest changes, run `npm install` in the `frontend` directory.

### 2.2. Global State Stores
Three core global stores have been created in `frontend/src/stores/`:

*   **`authStore.js`**:
    *   **Purpose**: Manages all aspects of user authentication, session data (user profile, JWT access/refresh tokens, CSRF token), loading states, and auth-related errors.
    *   **Key Features**: Includes actions for login, registration, logout, token refresh, session verification, and CSRF token fetching.
    *   **Persistence**: Persists `user`, `accessToken`, `refreshToken`, and `isAuthenticated` to `localStorage`.

*   **`tripStore.js`**:
    *   **Purpose**: Manages the state of the trip customization process. This includes trip details (title, destinations, dates, budget), selected components (flights, hotels, activities), route planning information, and AI-generated image/recommendation data.
    *   **Key Features**: Includes actions for initializing, loading, creating, saving, and updating trips and their components.
    *   **Persistence**: Persists key parts of `tripData` to `localStorage` to allow users to resume trip planning.

*   **`uiStore.js`**:
    *   **Purpose**: Manages global UI states such as modal visibility, global loading indicators, sidebar states, and application theme (light/dark mode).
    *   **Key Features**: Includes actions to open/close modals, toggle global loading, manage sidebar content, and switch themes.
    *   **Persistence**: Persists the selected `theme` to `localStorage`.

*Detailed information about each store's state and actions can be found in `frontend/src/stores/README.md`.*

### 2.3. Core Integrations
*   **`AuthContext.js` Refactoring**: The existing `frontend/src/contexts/AuthContext.js` has been refactored. It now primarily serves as a React Context provider that sources its state and actions from the `authStore`. This maintains the `useAuth()` hook interface for components while centralizing logic in Zustand.
*   **`App.js` Update**: The main `frontend/src/App.js` now uses the refactored `AuthProvider`. The initialization logic for verifying authentication status on app load is handled within `AuthProvider` using the `authStore`.
*   **Global API Client (`apiClient.js`)**: A new global Axios instance has been created at `frontend/src/services/apiClient.js`.
    *   It automatically fetches and includes JWT `Authorization` and `X-CSRF-Token` headers from `authStore` for relevant requests.
    *   It handles automatic JWT refresh on 401 errors by calling actions from `authStore`.
    *   This client should be used for all new and refactored API calls.
*   **Example Service Update**: `frontend/src/components/FlightSearch.js` has been updated as an example to use the new global `apiClient` instead of a local `axios` instance.
*   **Constants File**: A new constants file `frontend/src/constants/tripCustomization.js` has been created to centralize constants used in the trip customization flow (e.g., `STEPS`, `API_URL`).
*   **Unit Tests for Stores**: Initial unit tests for `authStore` and `tripStore` have been created in `frontend/src/stores/__tests__/` to demonstrate how to test store logic.

## 3. Next Steps for Completing the Migration

To fully integrate Zustand and realize its benefits, the following actions need to be taken by the development team:

### 3.1. Update Components (Gradual Migration)

The most significant part of the migration is refactoring existing components to use the new Zustand stores. This should be done incrementally.

**Priority Order for Refactoring:**

1.  **`TripCustomizationEngine.js` (and its planned sub-components)**: This is the largest and most state-heavy component. It should be refactored to use `tripStore` for all trip-related data and `uiStore` for any relevant UI state. Follow the detailed refactoring plan (`REFACTORING_PLAN.md`) created earlier.
    *   Replace local `useState` hooks managing parts of `tripData` with selectors from `tripStore`.
    *   Replace local functions that modify trip data or make API calls with actions from `tripStore`.
2.  **Authentication-related Components** (e.g., `LoginPage.js`, `RegisterPage.js`, `Navbar.js` for user display/logout): These components likely already use `useAuth()` from `AuthContext`. Since `AuthContext` now sources from `authStore`, these might require minimal changes, but verify they correctly use actions and state from `useAuth()`.
3.  **Other Components with Complex State**: Identify other components that manage significant shared state or have complex local state that could benefit from being centralized (e.g., `MyBookingsPage.js`, `UserProfilePage.js`).

**Migration Pattern Example:**

*   **Before (using `useState` and local API calls):**
    ```javascript
    // OldComponent.js
    function OldComponent() {
      const [tripTitle, setTripTitle] = useState('');
      const [isLoading, setIsLoading] = useState(false);
      // ... other local states ...

      const handleSaveTitle = async () => {
        setIsLoading(true);
        try {
          await axios.post('/api/some-endpoint', { title: tripTitle });
          // ...
        } finally {
          setIsLoading(false);
        }
      };
      // ...
    }
    ```

*   **After (using Zustand store - e.g., `tripStore`):**
    ```javascript
    // NewComponent.js
    import { useCurrentTripData, useTripActions, useTripLoadingStates } from '../stores/tripStore'; // Adjust path

    function NewComponent() {
      const tripData = useCurrentTripData(); // Accesses the whole tripData object
      const { updateTripDetails, saveTrip } = useTripActions(); // Accesses actions
      const { isLoading } = useTripLoadingStates(); // Accesses loading state from store

      const handleTitleChange = (newTitle) => {
        updateTripDetails({ title: newTitle }); // Call store action to update state
      };

      const handleSave = async () => {
        await saveTrip(); // Call store action; it handles API call & loading states
      };
      // ...
    }
    ```
    *Refer to `frontend/src/stores/README.md` for more detailed usage patterns.*

### 3.2. Replace Direct `axios` Calls with Global `apiClient`

All frontend code making API calls should be updated to use the new global `apiClient`.

*   **Locate**: Search for `import axios from 'axios';` in your components and service files.
*   **Replace**:
    ```javascript
    // OLD
    import axios from 'axios';
    // ...
    // axios.post(`${API_URL}/some/path`, data, { headers: { Authorization: `Bearer ${token}` } });

    // NEW
    import apiClient from '../services/apiClient'; // Adjust path
    // ...
    // apiClient.post('/some/path', data); // apiClient automatically adds Auth and CSRF tokens
    ```
*   **Benefit**: This centralizes token management, CSRF handling, and automatic token refresh logic, simplifying component code.

### 3.3. Testing & Validation

As components and services are migrated, testing is crucial.

1.  **Unit Tests for Stores**:
    *   The existing tests in `frontend/src/stores/__tests__/` (`authStore.test.js`, `tripStore.test.js`) serve as examples.
    *   Focus on testing actions: ensure they update state correctly and make expected API calls (mocking `apiClient` or `axios` used within stores).
    *   Test selectors: ensure they return the correct slices of state.

2.  **Component Tests**:
    *   Components using Zustand stores will need their tests updated.
    *   **Mocking Stores**: For unit/integration testing components, you'll often need to mock the Zustand stores or specific actions/selectors.
        ```javascript
        // Example: Mocking useAuthUser in a component test
        jest.mock('../stores/authStore', () => ({
          ...jest.requireActual('../stores/authStore'), // Import and retain original non-hook exports
          useAuthUser: jest.fn(),
          useAuthActions: jest.fn(() => ({ login: jest.fn() })),
        }));

        // In your test:
        // import { useAuthUser } from '../stores/authStore';
        // ...
        // useAuthUser.mockReturnValue({ firstName: 'Test' });
        // const { getByText } = render(<MyComponent />);
        // expect(getByText('Welcome, Test!')).toBeInTheDocument();
        ```
    *   Test that components render correctly based on store state and that user interactions correctly call store actions.

3.  **Integration Tests**:
    *   Test user flows that involve multiple stores or interactions (e.g., login -> fetch CSRF token -> save trip data).
    *   Verify that the automatic token refresh mechanism in `apiClient` works as expected (this might require more complex test setups to simulate token expiry).
    *   Test CSRF protection by ensuring state-changing requests fail without a valid CSRF token and succeed with one.

### 3.4. Code Review and Refinement
*   During code reviews, pay special attention to:
    *   Correct usage of Zustand selectors and actions.
    *   Avoidance of direct state mutation outside of store actions.
    *   Proper handling of loading and error states derived from stores.
    *   Replacement of direct `axios` calls with the global `apiClient`.
*   Continuously refine store structures and actions as the application evolves.

### 3.5. Cleanup Old State Management
*   Once a feature or component set is fully migrated to Zustand:
    *   Remove redundant `useState` and `useReducer` hooks that managed global or widely shared state.
    *   If parts of the old `AuthContext` (or other contexts) become entirely redundant, they can be simplified or removed, ensuring `AuthProvider` still correctly provides values derived from `authStore`.

## 4. Best Practices Recap (Refer to `stores/README.md` for details)

*   **Focused Stores**: Keep store domains clear (auth, trip, UI).
*   **Granular Selectors**: Use specific selectors for performance.
*   **Actions for Logic**: Encapsulate business logic and API calls in store actions.
*   **Centralized Error/Loading States**: Manage these within stores.
*   **Immutability**: Treat state as immutable when updating.
*   **DevTools**: Utilize Redux DevTools for debugging.

## 5. Troubleshooting Common Zustand Issues

*   **Component Not Re-rendering**: Ensure your component is subscribed to the specific slice of state that changes. If selecting an object, ensure the reference changes for Zustand's shallow equality check to trigger a re-render, or use a custom equality function.
*   **Infinite Loops**: Be cautious when calling store actions within `useEffect` hooks. Ensure correct dependency arrays.
*   **Persisted State Issues**: If persisted state seems stale or incorrect, try clearing `localStorage` for the specific store key (e.g., `adventureconnect-auth-storage`) during development.
*   **CSRF/Auth Token Issues with `apiClient`**:
    *   Verify `apiClient` is used for the call.
    *   Ensure `authStore` has valid `accessToken` and `csrfToken` values (check with DevTools or log `useAuthStore.getState()`).
    *   Confirm `fetchCsrfToken()` is called after login/session verification.

By following these steps and best practices, we can successfully complete the migration to Zustand, resulting in a more robust, maintainable, and performant frontend for AdventureConnect.
