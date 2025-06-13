import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import axios from 'axios';
import { toast } from 'react-toastify';
import { useAuthStore } from './authStore'; // Assuming authStore is in the same directory
import { API_URL } from '../components/TripCustomization/constants'; // Centralized API URL

const CSRF_HEADER_NAME = 'X-CSRF-Token'; // Ensure this matches backend

// --- Initial State Definition ---
export const initialTripState = {
  id: null, // Will be set by backend after creation or on load
  title: '',
  destinations: '', // Comma or semicolon-separated string of destinations
  start_date: null, // ISO string YYYY-MM-DD
  end_date: null, // ISO string YYYY-MM-DD
  number_of_travelers: 1,
  budget_amount: 0,
  currency: 'USD',
  inspiration_source: '', // 'manual', 'example_trip', 'ai_image'
  inspiration_reference_id: null, // ID of example trip template
  ai_image_url: '', // URL of the uploaded AI inspiration image (after processing)
  ai_image_file_for_upload: null, // Transient: File object for new AI image upload
  preferences: {
    interests: [], // Array of strings like 'Culture', 'Adventure', 'Food'
    travel_style: 'balanced', // 'budget', 'luxury', 'adventure', 'relaxing', 'family', 'solo'
    pace: 'medium', // 'fast', 'medium', 'slow'
    accommodation_types: [], // e.g., ['HOTEL', 'HOSTEL', 'APARTMENT']
    transportation_preferences: [], // e.g., ['FLIGHT', 'TRAIN', 'CAR_RENTAL']
  },
  // Array of trip components (flights, hotels, activities, etc.)
  // Each component should have a common structure like:
  // { id (client or server generated), component_type ('flight', 'hotel', 'activity'), title, price, currency, details: {...} }
  components: [],
  routePlanning: {
    // itinerary: [{ id, name, type ('destination'/'custom'), day, date (YYYY-MM-DD), coordinates: {lat, lng}, notes }]
    itinerary: [],
    // waypoints: [{ lat, lng, name }] for map display, derived or manually set
    waypoints: [],
    transport_modes_between_stops: {}, // e.g., { "Paris-Rome": "TRAIN" }
  },
  status: 'draft', // 'draft', 'planned', 'booked', 'completed', 'cancelled'
  user_id: null, // Will be set based on authenticated user
  created_at: null,
  updated_at: null,
  // UI specific or transient states not persisted unless necessary
  // Example: current_step (if managing steps globally, though useTripNavigation handles this locally)
};

// --- Axios Client for Trip API Calls ---
// This client will use tokens from useAuthStore
const tripApiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor to add Auth and CSRF tokens to requests
tripApiClient.interceptors.request.use(
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
        console.warn('TripStore API Client: CSRF token missing for state-changing request.');
        // Optionally, could throw an error or queue request until CSRF token is available
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);


// --- Zustand Store Definition ---
export const useTripStore = create(
  persist(
    (set, get) => ({
      // --- State ---
      tripData: { ...initialTripState },
      // tripId is part of tripData.id after load/create
      
      isLoading: false, // General loading for save/create
      isFetchingExisting: false, // Specific loading for fetching an existing trip
      isUploadingAiImage: false,
      error: null,

      // --- Actions ---

      // Initialize or reset the trip store, optionally with a tripId to load
      initializeTrip: async (tripIdToLoad = null) => {
        set({ isFetchingExisting: !!tripIdToLoad, isLoading: false, error: null, tripData: { ...initialTripState } });
        if (tripIdToLoad) {
          await get().loadTrip(tripIdToLoad);
        } else {
          // For a new trip, ensure user_id is set if user is authenticated
          const { user } = useAuthStore.getState();
          if (user) {
            set(state => ({ tripData: { ...state.tripData, user_id: user.id } }));
          }
        }
      },

      // Update general trip details
      updateTripDetails: (details) => {
        set((state) => ({
          tripData: { ...state.tripData, ...details },
          error: null, // Clear previous errors on new input
        }));
      },
      
      // Update preferences specifically
      updatePreferences: (newPreferences) => {
        set((state) => ({
          tripData: {
            ...state.tripData,
            preferences: { ...state.tripData.preferences, ...newPreferences },
          },
        }));
      },

      // Load an existing trip
      loadTrip: async (tripId) => {
        if (!tripId) {
          set({ tripData: { ...initialTripState }, isFetchingExisting: false });
          return;
        }
        set({ isFetchingExisting: true, error: null });
        try {
          const response = await tripApiClient.get(`/trips/custom/${tripId}`);
          const loadedTrip = response.data.trip; // Assuming backend returns { trip: { ... } }
          set({
            tripData: {
              ...initialTripState, // Ensure all fields from initial state are present
              ...loadedTrip,
              components: loadedTrip.components || [],
              preferences: loadedTrip.preferences || initialTripState.preferences,
              routePlanning: loadedTrip.routePlanning || initialTripState.routePlanning,
            },
            isFetchingExisting: false,
          });
          toast.success(`Loaded trip: ${loadedTrip.title}`);
        } catch (err) {
          const errorMessage = err.response?.data?.message || err.message || 'Failed to load trip data.';
          set({ error: errorMessage, isFetchingExisting: false });
          toast.error(errorMessage);
          // Potentially navigate away or to new trip creation if load fails critically (e.g., 404, 403)
          // This navigation logic is better handled in the component using the store.
        }
      },

      // Create a new trip
      createTrip: async (initialDetails) => {
        if (get().tripData.id) { // If a trip already exists in the store
          toast.info("A trip is already active. Saving current trip first.");
          await get().saveTrip(); // Save current before creating new, or prompt user
          // Or reset: get().resetTrip(); 
          // For now, let's assume save is desired.
        }
        
        if (!initialDetails?.title?.trim()) {
          toast.warn("Please provide a trip title to start.");
          set({ error: "Trip title is required." });
          return null;
        }
        set({ isLoading: true, error: null });
        const { user } = useAuthStore.getState();
        const payload = {
          ...initialTripState,
          ...initialDetails,
          user_id: user?.id,
          status: 'draft',
        };
        // Remove transient fields before sending to backend
        delete payload.ai_image_file_for_upload;

        try {
          const response = await tripApiClient.post('/trips/custom', payload);
          const newTrip = response.data.trip;
          set({
            tripData: { ...initialTripState, ...newTrip }, // Reset with new trip data
            isLoading: false,
          });
          toast.success(`Trip "${newTrip.title}" created!`);
          return newTrip; // Return the new trip object
        } catch (err) {
          const errorMessage = err.response?.data?.message || err.message || 'Failed to create trip.';
          set({ error: errorMessage, isLoading: false });
          toast.error(errorMessage);
          return null;
        }
      },

      // Save current trip progress
      saveTrip: async () => {
        const currentTrip = get().tripData;
        if (!currentTrip.id) {
          toast.warn("Cannot save: No active trip ID. Please create the trip first.");
          // Optionally, call createTrip here if title exists
          // if (currentTrip.title) {
          //   const newTrip = await get().createTrip(currentTrip);
          //   return newTrip ? true : false;
          // }
          return false;
        }
        if (!currentTrip.title?.trim()) {
            toast.warn("Trip title cannot be empty when saving.");
            return false;
        }

        set({ isLoading: true, error: null });
        
        const payload = { ...currentTrip };
        // Handle AI image file upload if present
        if (payload.ai_image_file_for_upload) {
            const formData = new FormData();
            formData.append('ai_inspiration_image', payload.ai_image_file_for_upload);
            // Append other trip data as JSON string if backend expects multipart/form-data with JSON part
            // Or make a separate call for image upload then save trip data.
            // For simplicity, assume a dedicated endpoint for image upload first.
            try {
                set({ isUploadingAiImage: true });
                const imageUploadResponse = await tripApiClient.post(`/trips/custom/${currentTrip.id}/upload-ai-image`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
                payload.ai_image_url = imageUploadResponse.data.imageUrl; // Assume backend returns URL
                toast.success("AI inspiration image uploaded!");
            } catch (imgErr) {
                const imgErrMsg = imgErr.response?.data?.message || imgErr.message || "Failed to upload AI image.";
                toast.error(imgErrMsg);
                // Decide if save should proceed without image or fail
                // For now, let's allow saving without image if upload fails
            } finally {
                set({ isUploadingAiImage: false });
            }
        }
        delete payload.ai_image_file_for_upload; // Remove file object before sending JSON

        try {
          const response = await tripApiClient.put(`/trips/custom/${currentTrip.id}`, payload);
          const savedTrip = response.data.trip;
          set({
            tripData: { ...get().tripData, ...savedTrip }, // Merge with potentially updated fields like updated_at
            isLoading: false,
          });
          toast.success(`Trip "${savedTrip.title}" progress saved!`);
          return true;
        } catch (err) {
          const errorMessage = err.response?.data?.message || err.message || 'Failed to save trip progress.';
          set({ error: errorMessage, isLoading: false });
          toast.error(errorMessage);
          return false;
        }
      },

      // --- Component Management ---
      addComponent: (componentData) => {
        set((state) => ({
          tripData: {
            ...state.tripData,
            components: [
              ...state.tripData.components,
              { ...componentData, id: componentData.id || `client-${Date.now()}-${Math.random().toString(16).slice(2)}` }, // Ensure client-side ID if none
            ],
          },
        }));
        toast.info(`${componentData.component_type || 'Item'} added to trip.`);
      },

      updateComponent: (componentId, updates) => {
        set((state) => ({
          tripData: {
            ...state.tripData,
            components: state.tripData.components.map((comp) =>
              comp.id === componentId ? { ...comp, ...updates } : comp
            ),
          },
        }));
        toast.info(`Item updated.`);
      },

      removeComponent: (componentId) => {
        set((state) => ({
          tripData: {
            ...state.tripData,
            components: state.tripData.components.filter((comp) => comp.id !== componentId),
          },
        }));
        toast.info(`Item removed from trip.`);
      },
      
      // --- Route Planning ---
      updateRouteItinerary: (itineraryItems) => {
        set(state => ({
            tripData: {
                ...state.tripData,
                routePlanning: {
                    ...state.tripData.routePlanning,
                    itinerary: itineraryItems,
                }
            }
        }));
      },
      updateRouteWaypoints: (waypoints) => {
        set(state => ({
            tripData: {
                ...state.tripData,
                routePlanning: {
                    ...state.tripData.routePlanning,
                    waypoints: waypoints,
                }
            }
        }));
      },

      // --- AI Features ---
      setAiImageFile: (file) => {
        // Handle local preview if needed, then trigger upload via another action or saveTrip
        set(state => ({
            tripData: { ...state.tripData, ai_image_file_for_upload: file, ai_image_url: file ? URL.createObjectURL(file) : state.tripData.ai_image_url }
        }));
      },

      // Placeholder for AI recommendation fetching
      fetchAiRecommendations: async (context) => {
        set({ isLoading: true });
        try {
          // const response = await tripApiClient.post(`/trips/ai/recommendations`, { tripData: get().tripData, context });
          // set(state => ({ tripData: {...state.tripData, recommendations: response.data }, isLoading: false }));
          // toast.success("AI recommendations loaded!");
          console.warn("fetchAiRecommendations: Not implemented yet. Using mock data.");
          await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call
          set(state => ({ 
            tripData: {
                ...state.tripData, 
                // Example structure, adapt as needed
                recommendations: { 
                    budget: { suggestions: ["Eat local", "Use public transport"], estimatedSavings: "100 USD" },
                    activities: [{name: "Visit Eiffel Tower"}, {name: "Louvre Museum Tour"}]
                }
            }, 
            isLoading: false 
          }));
          toast.info("Mock AI recommendations loaded.");

        } catch (err) {
          const errorMessage = err.response?.data?.message || err.message || 'Failed to fetch AI recommendations.';
          set({ error: errorMessage, isLoading: false });
          toast.error(errorMessage);
        }
      },
      
      // Reset trip data to initial state
      resetTrip: () => {
        const { user } = useAuthStore.getState();
        set({ 
            tripData: { ...initialTripState, user_id: user?.id }, 
            isLoading: false, 
            isFetchingExisting: false, 
            error: null 
        });
        toast.info("Trip plan has been reset.");
      },

      // --- Setters for loading/error states if needed externally ---
      setLoading: (loadingState) => set({ isLoading: loadingState }),
      setError: (errorMessage) => set({ error: errorMessage }),
      clearError: () => set({ error: null }),

    }),
    {
      name: 'adventureconnect-trip-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Persist only specific parts of tripData to avoid storing large objects or transient data
        tripData: {
          id: state.tripData.id,
          title: state.tripData.title,
          destinations: state.tripData.destinations,
          start_date: state.tripData.start_date,
          end_date: state.tripData.end_date,
          number_of_travelers: state.tripData.number_of_travelers,
          budget_amount: state.tripData.budget_amount,
          currency: state.tripData.currency,
          inspiration_source: state.tripData.inspiration_source,
          inspiration_reference_id: state.tripData.inspiration_reference_id,
          ai_image_url: state.tripData.ai_image_url, // Persist URL, not the file
          preferences: state.tripData.preferences,
          components: state.tripData.components, // Consider if components can get very large
          routePlanning: state.tripData.routePlanning,
          status: state.tripData.status,
          user_id: state.tripData.user_id,
        },
        // Do not persist isLoading, isFetchingExisting, error, or ai_image_file_for_upload
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // When rehydrating, if a tripId exists, we might want to trigger a fresh load
          // or verification from the backend to ensure data consistency.
          // For now, we'll just set isLoading to false.
          // A component using this store (e.g., TripCustomizationOrchestrator)
          // should call initializeTrip(persistedTripId) on mount.
          state.isLoading = false; 
          state.isFetchingExisting = false;
          state.error = null;
          state.tripData.ai_image_file_for_upload = null; // Ensure file object is not rehydrated
        }
      }
    }
  )
);

// --- Utility Hooks for Easy Access to Store State and Actions ---

// Actions hook
export const useTripActions = () => {
  const actions = useTripStore(
    (state) => ({
      initializeTrip: state.initializeTrip,
      updateTripDetails: state.updateTripDetails,
      updatePreferences: state.updatePreferences,
      loadTrip: state.loadTrip,
      createTrip: state.createTrip,
      saveTrip: state.saveTrip,
      addComponent: state.addComponent,
      updateComponent: state.updateComponent,
      removeComponent: state.removeComponent,
      updateRouteItinerary: state.updateRouteItinerary,
      updateRouteWaypoints: state.updateRouteWaypoints,
      setAiImageFile: state.setAiImageFile,
      fetchAiRecommendations: state.fetchAiRecommendations,
      resetTrip: state.resetTrip,
      setLoading: state.setLoading,
      setError: state.setError,
      clearError: state.clearError,
    }),
    // Using a shallow equality checker for object of actions
    (oldState, newState) => Object.keys(oldState).every(key => oldState[key] === newState[key])
  );
  return actions;
};

// Selectors for specific parts of the state
export const useCurrentTripData = () => useTripStore((state) => state.tripData);
export const useTripLoadingStates = () => useTripStore((state) => ({
  isLoading: state.isLoading,
  isFetchingExisting: state.isFetchingExisting,
  isUploadingAiImage: state.isUploadingAiImage,
}));
export const useTripError = () => useTripStore((state) => state.error);
export const useTripId = () => useTripStore((state) => state.tripData.id);

// Example: Selector for a specific part of tripData, e.g., components
export const useTripComponents = () => useTripStore((state) => state.tripData.components);
export const useTripRouteItinerary = () => useTripStore((state) => state.tripData.routePlanning.itinerary);

// How to use in a component:
/*
import { useTripStore, useTripActions, useCurrentTripData } from './stores/tripStore';

function MyTripComponent() {
  const tripData = useCurrentTripData();
  const { updateTripDetails, saveTrip } = useTripActions();
  const isLoading = useTripStore(state => state.isLoading); // Or use useTripLoadingStates

  useEffect(() => {
    // Example: Initialize or load a trip when component mounts if needed
    // const { initializeTrip } = useTripActions();
    // initializeTrip(urlTripId || null); // urlTripId from useParams
  }, []);

  const handleTitleChange = (e) => {
    updateTripDetails({ title: e.target.value });
  };

  return (
    <div>
      <input value={tripData.title} onChange={handleTitleChange} />
      <button onClick={saveTrip} disabled={isLoading}>
        {isLoading ? 'Saving...' : 'Save Trip'}
      </button>
    </div>
  );
}
*/
