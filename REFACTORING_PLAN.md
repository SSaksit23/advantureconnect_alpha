# Refactoring Plan: TripCustomizationEngine.js

**Version:** 1.0
**Date:** 2025-06-13
**Author:** AdventureConnect AI Assistant

## 1. Introduction & Goals

The `TripCustomizationEngine.js` component has grown to over 8,000 lines, making it difficult to maintain, test, and extend. This refactoring plan aims to break it down into smaller, more manageable components and custom hooks, adhering to the Single Responsibility Principle (SRP).

**Primary Goals:**
*   Improve code readability and maintainability.
*   Enhance testability of individual parts.
*   Simplify state management.
*   Make it easier for multiple developers to work on different parts of the trip customization flow concurrently.
*   Improve performance by enabling more granular memoization and reducing unnecessary re-renders.

## 2. Proposed Component Hierarchy and Structure

The refactored structure will revolve around a main orchestrator component, custom hooks for shared logic and state, and individual components for each step and common UI elements.

```
src/
├── components/
│   └── TripCustomization/
│       ├── index.js                     // Main orchestrator (formerly TripCustomizationEngine)
│       ├── constants.js                 // STEPS array, API_URL, etc.
│       ├── hooks/
│       │   ├── useTripData.js           // Manages all aspects of 'tripData' state, API interactions (load, save, create)
│       │   ├── useTripNavigation.js     // Manages current step, next/prev logic
│       │   └── useFormValidation.js     // (Optional) Centralized form validation logic if needed across steps
│       ├── common/
│       │   ├── InputField.js
│       │   ├── LocationAutocomplete.js
│       │   ├── ProgressBar.js
│       │   ├── StepNavigationButtons.js // Next/Prev/Save buttons
│       │   ├── LoadingSpinner.js
│       │   └── ErrorDisplay.js
│       ├── Step1_Inspiration/
│       │   ├── InspirationForm.js       // Handles inspiration type selection, example trips, AI image upload
│       │   └── index.js                 // Main component for Step 1, composes InspirationForm
│       ├── Step2_CoreDetails/
│       │   ├── CoreDetailsForm.js       // Handles destinations, dates, travelers, budget
│       │   ├── VisaRequirementsDisplay.js
│       │   ├── ExchangeRateDisplay.js
│       │   └── index.js                 // Main component for Step 2
│       ├── Step3_RoutePlanning/
│       │   ├── ItineraryBuilder.js      // Manages drag-and-drop itinerary items
│       │   ├── RouteCalendarView.js
│       │   ├── RouteMapWrapper.js       // Wraps RoutePlanningMap if additional logic/state needed
│       │   └── index.js                 // Main component for Step 3
│       ├── Step4_Flights/
│       │   ├── FlightSearchForm.js
│       │   ├── FlightResultsList.js
│       │   ├── SelectedFlightsSummary.js
│       │   └── index.js                 // Main component for Step 4
│       ├── Step5_ActivitiesAndPois/
│       │   ├── ActivitySearchControls.js // Search type, date, location, time
│       │   ├── ActivityResults.js
│       │   ├── SelectedActivitiesSummary.js
│       │   ├── LocalGuidePopup.js
│       │   ├── AIRecommendationsPopup.js // For smart suggestions
│       │   ├── AIAutoSelectPopup.js      // For "Create Perfect Itinerary"
│       │   └── index.js                 // Main component for Step 5
│       ├── Step6_Accommodation/
│       │   ├── HotelSearchControls.js   // Calendar, city, guests
│       │   ├── HotelResults.js
│       │   ├── SelectedHotelsSummary.js
│       │   ├── AccommodationCalendarView.js
│       │   └── index.js                 // Main component for Step 6
│       ├── Step7_Optimization/
│       │   ├── AIOptimizationTrigger.js
│       │   ├── OptimizationResultsView.js
│       │   └── index.js                 // Main component for Step 7
│       ├── Step8_Review/
│       │   ├── FullItineraryDisplay.js
│       │   ├── CostBreakdownDisplay.js
│       │   ├── SocialShare.js
│       │   └── index.js                 // Main component for Step 8
│       ├── Step9_Book/
│       │   ├── BookingSummary.js
│       │   ├── PaymentPlaceholder.js    // Placeholder for future payment integration
│       │   └── index.js                 // Main component for Step 9
│       └── types.js                     // TypeScript type definitions or JSDoc types for tripData, components etc.
└── ... (other app components)
```

## 3. Step-by-Step Refactoring Instructions

This refactoring should be done incrementally.

### Phase 1: Foundation & Core Logic Extraction (1-2 days)
1.  **Create Directory Structure:** Set up the new `TripCustomization` folder and subfolders as outlined above.
2.  **Move Constants:** Relocate `STEPS` array and `API_URL` to `TripCustomization/constants.js`.
3.  **Extract Common UI Components:**
    *   Move `InputField` to `TripCustomization/common/InputField.js`.
    *   Move `LocationAutocomplete` to `TripCustomization/common/LocationAutocomplete.js`.
    *   Create `ProgressBar.js` from the progress bar rendering logic.
    *   Create `StepNavigationButtons.js` for the common "Previous", "Next", "Save Progress" buttons.
    *   Create `LoadingSpinner.js` and `ErrorDisplay.js`.
4.  **Create `useTripNavigation` Hook:**
    *   Manages `currentStep`, `setCurrentStep`.
    *   Includes `handleNext` and `handlePrev` logic (initially, just step changes; saving logic will be added later).
5.  **Create `useTripData` Hook (Initial Skeleton):**
    *   Manages `tripData` state (`useState`).
    *   Exposes `tripData` and `updateTripData` function (`useCallback` for `updateTripData`).
    *   Manages `isLoading`, `isFetchingExisting`, `error` states.
    *   Handles `tripId`, `setTripId` and `paramTripId` logic.
6.  **Refactor `TripCustomizationEngine/index.js` (Main Orchestrator):**
    *   Rename `TripCustomizationEngine.js` to `TripCustomization/index.js`.
    *   Use `useTripNavigation` for step state and navigation.
    *   Use `useTripData` for trip data state.
    *   The `renderStepContent` function will remain, but will eventually render the new step components. Initially, it can still render the old inline step functions.
    *   Render the `ProgressBar` and `StepNavigationButtons` components.

### Phase 2: Trip Data Management & API Logic (2-3 days)
7.  **Complete `useTripData` Hook:**
    *   Implement `loadExistingTrip(tripId, token)`: Fetches trip data from API.
    *   Implement `createTrip(initialTripData, token)`: Creates a new trip draft via API, returns new trip ID.
    *   Implement `saveTripProgress(currentTripData, token)`: Saves current `tripData` to API.
    *   Ensure robust error handling and loading state management within this hook.
8.  **Integrate `useTripData` with `useTripNavigation`:**
    *   Modify `handleNext` in `useTripNavigation` to call `saveTripProgress` (from `useTripData`) before changing step.
    *   Modify `createTrip` logic in Step 1 to use the hook, and ensure `tripId` is correctly set and propagated.
    *   The main "Save Progress" button in `StepNavigationButtons.js` should call `saveTripProgress`.

### Phase 3: Step-by-Step Component Extraction (1 day per 1-2 steps, total 5-7 days)
For each step from 1 to 9:
9.  **Create Step Folder & Index:** e.g., `TripCustomization/Step1_Inspiration/index.js`.
10. **Identify Sub-Components:** Based on the original `StepXInspiration` function, identify logical UI blocks and extract them into their own files within the step folder (e.g., `InspirationForm.js`).
11. **Port Logic:**
    *   The `StepX_Component/index.js` will be the main component for that step. It receives `tripData`, `updateTripData` (from `useTripData`), and navigation functions (from `useTripNavigation`) as props from the main orchestrator.
    *   Move step-specific local state (e.g., `inspirationType`, `exampleTrips` for Step 1) into the new step's main component or its sub-components.
    *   Move step-specific event handlers and effects into the new components.
    *   API calls specific to a step (e.g., fetching example trips, visa info) should be initiated from within that step's component, possibly using helper functions or a dedicated API service module if complex.
12. **Update Main Orchestrator:** Change `renderStepContent` in `TripCustomization/index.js` to render the newly refactored step component (e.g., `<Step1InspirationComponent {...props} />`).
13. **Test Thoroughly:** After refactoring each step, test its functionality in isolation and its integration with the overall flow.

    **Example for Step 1 (Inspiration):**
    *   `TripCustomization/Step1_Inspiration/index.js`:
        ```javascript
        import React from 'react';
        import InspirationForm from './InspirationForm';
        // ... any other specific imports for Step 1

        const Step1InspirationComponent = ({ tripData, updateTripData, handleNext, createTrip, tripId, token }) => {
          // Logic specific to orchestrating Step 1, if any, not in InspirationForm
          return (
            <div className="space-y-4">
              <h3 className="text-lg font-medium">How would you like to start planning?</h3>
              <InspirationForm
                tripData={tripData}
                updateTripData={updateTripData}
                onNextStep={handleNext}
                createTrip={createTrip}
                currentTripId={tripId} // Pass currentTripId
                token={token}
              />
            </div>
          );
        };
        export default Step1InspirationComponent;
        ```
    *   `TripCustomization/Step1_Inspiration/InspirationForm.js`:
        *   Contains the original form logic for inspiration type, title, example trips, AI image.
        *   Manages its own local state for `inspirationType`, `exampleTrips`, `aiImageFile`, etc.
        *   Calls `updateTripData` for title changes.
        *   Calls `createTrip` and `onNextStep` via props.

    **Repeat this process for all 9 steps.** The complexity will vary. Steps like "Flights", "Accommodation", and "Activities" will likely have more sub-components.

### Phase 4: Review, Testing, and Refinement (2-3 days)
14. **Code Reviews:** Conduct thorough code reviews for the new structure, hooks, and components.
15. **Comprehensive Testing:**
    *   Write unit tests for custom hooks.
    *   Write integration tests for each step component, mocking props and verifying interactions.
    *   Enhance end-to-end tests to cover the refactored flow.
16. **Performance Profiling:** Use React DevTools to identify any performance bottlenecks and apply memoization (`React.memo`, `useCallback`, `useMemo`) where necessary.
17. **Documentation:** Update any relevant developer documentation to reflect the new structure.

## 4. Code Organization Best Practices

*   **File Naming:** Use PascalCase for components (e.g., `InspirationForm.js`) and camelCase for hooks (e.g., `useTripData.js`).
*   **SRP Adherence:** Ensure each component and hook has a single, well-defined responsibility.
*   **Props Management:** Pass only necessary props to child components. Avoid excessive prop drilling; `useTripData` should help with this for global trip state.
*   **State Colocation:** Keep state as close as possible to where it's used. Step-specific UI state should live within that step's components. Shared trip state is in `useTripData`.
*   **Modularity:** Design components and hooks to be as independent and reusable as possible (where appropriate).
*   **Clear Imports:** Use absolute or aliased paths for imports if your project is configured for it, otherwise use relative paths consistently.
*   **PropTypes/TypeScript:** If using TypeScript, define clear types for props and state. If using JavaScript, use `PropTypes` for runtime type checking during development. Create a `types.js` or `types.ts` for shared type definitions related to `tripData` and its components.

## 5. Testing Recommendations

*   **Custom Hooks (`useTripData`, `useTripNavigation`):**
    *   Use `@testing-library/react-hooks` (or the built-in `renderHook` from `@testing-library/react` for newer versions).
    *   Mock API calls (`axios.get`, `axios.post`) using `jest.mock`.
    *   Test initial state, state updates after actions, and effects (e.g., API calls being made).
*   **Common UI Components (`InputField`, `ProgressBar`, etc.):**
    *   Use `@testing-library/react`.
    *   Test rendering based on props, user interactions (e.g., typing in `InputField`), and callback invocations.
    *   Use snapshot tests sparingly for purely presentational components.
*   **Step Components (e.g., `Step1InspirationComponent` and its children):**
    *   Use `@testing-library/react`.
    *   Render the step component with mocked props (e.g., mock `tripData`, `updateTripData`, `handleNext`).
    *   Simulate user interactions (filling forms, clicking buttons).
    *   Verify that local state changes correctly and that prop callbacks are called with expected arguments.
    *   Mock any step-specific API calls.
*   **Main Orchestrator (`TripCustomization/index.js`):**
    *   Test that it renders the correct step based on `currentStep`.
    *   Test navigation logic (mocking `useTripNavigation` and `useTripData` to control their outputs).
*   **End-to-End (E2E) Tests (Cypress/Playwright):**
    *   Crucial for verifying the entire flow.
    *   Create test scenarios for:
        *   Creating a new trip from scratch.
        *   Loading and editing an existing trip.
        *   Navigating through all steps.
        *   Saving progress at different stages.
        *   Basic data entry and validation within each step.
    *   Mock backend API responses at the network level to ensure consistent E2E tests.

## 6. Implementation Timeline & Priority Order

**Total Estimated Time:** 10 - 15 working days for one developer. This can be parallelized if multiple developers work on different steps after Phase 1 & 2 are complete.

*   **Week 1:**
    *   **Day 1-2:** Phase 1 - Foundation & Core Logic Extraction (Setup, Common Components, `useTripNavigation`, `useTripData` skeleton, Main Orchestrator refactor).
    *   **Day 3-5:** Phase 2 - Trip Data Management & API Logic (Complete `useTripData` with API calls, integrate with navigation).
*   **Week 2-3:**
    *   **Day 6-12 (approx. 1 day per 1-1.5 steps):** Phase 3 - Step-by-Step Component Extraction.
        *   Priority: Start with simpler steps (e.g., Step 1, Step 2) to establish patterns, then move to more complex ones (e.g., Step 3 Route Planning, Step 5 Activities, Step 6 Accommodation).
        *   Steps can be parallelized among developers here.
*   **Week 3 (End) / Week 4 (Start):**
    *   **Day 13-15:** Phase 4 - Review, Testing, and Refinement (Dedicated testing, performance checks, documentation).

**Priority Order for Step Extraction (after foundational hooks are ready):**
1.  Step 1: Inspiration
2.  Step 2: Core Details
3.  Step 8: Review & Cost (Often simpler UI, good for early validation of `tripData` structure)
4.  Step 9: Book (Simple UI, depends on `tripData`)
5.  Step 7: Optimization (Relies on complete `tripData`)
6.  Step 3: Route Planning (More complex UI and state)
7.  Step 4: Flights (Complex forms, API integration, results display)
8.  Step 6: Accommodation (Similar complexity to Flights)
9.  Step 5: Activities & POIs (Most complex with multiple sub-features, popups, and potentially map interactions)

This phased approach allows for continuous integration and testing, reducing the risk associated with a large-scale refactor.
