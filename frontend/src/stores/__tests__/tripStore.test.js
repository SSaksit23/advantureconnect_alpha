import { useTripStore, initialTripState } from '../tripStore'; // Adjust path as needed
import { useAuthStore } from '../authStore'; // To mock auth state
import axios from 'axios'; // Mocked below
import { toast } from 'react-toastify';
import { API_URL } from '../../components/TripCustomization/constants'; // Adjust path

// Mock dependencies
jest.mock('axios');
jest.mock('react-toastify', () => ({
  success: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
}));

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

// Mock useAuthStore
const mockAuthStoreState = {
  user: null,
  accessToken: null,
  csrfToken: null,
};
jest.mock('../authStore', () => ({
  useAuthStore: {
    getState: jest.fn(() => mockAuthStoreState),
  },
}));

// Helper to reset Zustand store and mocks before each test
const resetStoreAndMocks = () => {
  useTripStore.setState({ ...useTripStore.getState(), tripData: { ...initialTripState }, isLoading: false, isFetchingExisting: false, error: null }, true);
  localStorageMock.clear();
  axios.get.mockReset();
  axios.post.mockReset();
  axios.put.mockReset();
  toast.success.mockClear();
  toast.error.mockClear();
  toast.info.mockClear();
  toast.warn.mockClear();
  // Reset auth store mock state
  mockAuthStoreState.user = null;
  mockAuthStoreState.accessToken = 'mock-access-token'; // Assume token for API calls
  mockAuthStoreState.csrfToken = 'mock-csrf-token';   // Assume CSRF token
};

describe('useTripStore', () => {
  beforeEach(resetStoreAndMocks);

  it('should have initial state', () => {
    const state = useTripStore.getState();
    expect(state.tripData).toEqual(initialTripState);
    expect(state.isLoading).toBe(false);
    expect(state.isFetchingExisting).toBe(false);
    expect(state.error).toBeNull();
  });

  describe('initializeTrip Action', () => {
    it('should reset to initial state and set user_id if no tripIdToLoad and user is authenticated', async () => {
      mockAuthStoreState.user = { id: 'user123' };
      useTripStore.setState({ tripData: { ...initialTripState, title: 'Old Trip' } }); // Some pre-existing state

      await useTripStore.getState().initializeTrip(null);

      const state = useTripStore.getState();
      expect(state.tripData.title).toBe(''); // Reset
      expect(state.tripData.user_id).toBe('user123');
      expect(state.isFetchingExisting).toBe(false);
    });

    it('should call loadTrip if tripIdToLoad is provided', async () => {
      const mockLoadTrip = jest.fn();
      // Temporarily replace loadTrip with a mock for this test
      const originalLoadTrip = useTripStore.getState().loadTrip;
      useTripStore.setState({ loadTrip: mockLoadTrip });

      await useTripStore.getState().initializeTrip('trip123');

      expect(useTripStore.getState().isFetchingExisting).toBe(true);
      expect(mockLoadTrip).toHaveBeenCalledWith('trip123');

      // Restore original loadTrip
      useTripStore.setState({ loadTrip: originalLoadTrip });
    });
  });

  describe('updateTripDetails Action', () => {
    it('should update tripData with new details', () => {
      useTripStore.getState().updateTripDetails({ title: 'New Title', destinations: 'Paris, Rome' });
      const state = useTripStore.getState();
      expect(state.tripData.title).toBe('New Title');
      expect(state.tripData.destinations).toBe('Paris, Rome');
      expect(state.error).toBeNull(); // Should clear error
    });
  });

  describe('updatePreferences Action', () => {
    it('should update preferences within tripData', () => {
      useTripStore.getState().updatePreferences({ travel_style: 'luxury', pace: 'slow' });
      const state = useTripStore.getState();
      expect(state.tripData.preferences.travel_style).toBe('luxury');
      expect(state.tripData.preferences.pace).toBe('slow');
    });
  });

  describe('loadTrip Action', () => {
    const mockTrip = { id: 'trip123', title: 'Loaded Trip', components: [], preferences: {}, routePlanning: {} };

    it('should load an existing trip successfully', async () => {
      axios.get.mockResolvedValueOnce({ data: { trip: mockTrip } });
      await useTripStore.getState().loadTrip('trip123');

      const state = useTripStore.getState();
      expect(state.tripData.id).toBe('trip123');
      expect(state.tripData.title).toBe('Loaded Trip');
      expect(state.isFetchingExisting).toBe(false);
      expect(toast.success).toHaveBeenCalledWith('Loaded trip: Loaded Trip');
      expect(axios.get).toHaveBeenCalledWith(`${API_URL}/trips/custom/trip123`);
    });

    it('should handle API error when loading a trip', async () => {
      axios.get.mockRejectedValueOnce({ response: { data: { message: 'Trip not found' } } });
      await useTripStore.getState().loadTrip('trip123');

      const state = useTripStore.getState();
      expect(state.error).toBe('Trip not found');
      expect(state.isFetchingExisting).toBe(false);
      expect(toast.error).toHaveBeenCalledWith('Trip not found');
    });

    it('should reset tripData if tripId is null', async () => {
      useTripStore.setState({ tripData: { ...initialTripState, title: 'Existing data' } });
      await useTripStore.getState().loadTrip(null);
      expect(useTripStore.getState().tripData.title).toBe('');
      expect(useTripStore.getState().isFetchingExisting).toBe(false);
    });
  });

  describe('createTrip Action', () => {
    const initialDetails = { title: 'My New Adventure' };
    const mockNewTrip = { id: 'newTrip456', ...initialDetails, user_id: 'user123' };

    beforeEach(() => {
      mockAuthStoreState.user = { id: 'user123' };
    });

    it('should create a new trip successfully', async () => {
      axios.post.mockResolvedValueOnce({ data: { trip: mockNewTrip } });
      const result = await useTripStore.getState().createTrip(initialDetails);

      expect(result).toEqual(mockNewTrip);
      const state = useTripStore.getState();
      expect(state.tripData.id).toBe('newTrip456');
      expect(state.tripData.title).toBe('My New Adventure');
      expect(state.tripData.user_id).toBe('user123');
      expect(state.isLoading).toBe(false);
      expect(toast.success).toHaveBeenCalledWith('Trip "My New Adventure" created!');
      expect(axios.post).toHaveBeenCalledWith(`${API_URL}/trips/custom`, expect.objectContaining(initialDetails));
    });

    it('should require a title to create a trip', async () => {
      const result = await useTripStore.getState().createTrip({ title: '  ' }); // Empty title
      expect(result).toBeNull();
      expect(toast.warn).toHaveBeenCalledWith('Please provide a trip title to start.');
      expect(useTripStore.getState().error).toBe("Trip title is required.");
    });

    it('should handle API error during trip creation', async () => {
      axios.post.mockRejectedValueOnce({ response: { data: { message: 'Creation failed' } } });
      const result = await useTripStore.getState().createTrip(initialDetails);

      expect(result).toBeNull();
      const state = useTripStore.getState();
      expect(state.error).toBe('Creation failed');
      expect(state.isLoading).toBe(false);
      expect(toast.error).toHaveBeenCalledWith('Creation failed');
    });

    it('should save current trip if one is already active in store before creating new', async () => {
        useTripStore.setState({ tripData: { ...initialTripState, id: 'existingTrip123', title: 'Existing Trip' } });
        const mockSaveTrip = jest.fn().mockResolvedValue(true);
        const originalSaveTrip = useTripStore.getState().saveTrip;
        useTripStore.setState({ saveTrip: mockSaveTrip }); // Mock saveTrip

        axios.post.mockResolvedValueOnce({ data: { trip: mockNewTrip } }); // For the new trip creation
        await useTripStore.getState().createTrip(initialDetails);

        expect(toast.info).toHaveBeenCalledWith("A trip is already active. Saving current trip first.");
        expect(mockSaveTrip).toHaveBeenCalled();
        expect(useTripStore.getState().tripData.id).toBe('newTrip456'); // New trip ID

        useTripStore.setState({ saveTrip: originalSaveTrip }); // Restore
    });
  });

  describe('saveTrip Action', () => {
    const existingTrip = { id: 'trip789', title: 'Adventure to Save', user_id: 'user123', components: [] };
    const mockSavedTrip = { ...existingTrip, updated_at: new Date().toISOString() };

    beforeEach(() => {
      mockAuthStoreState.user = { id: 'user123' };
      useTripStore.setState({ tripData: { ...existingTrip } });
    });

    it('should save an existing trip successfully', async () => {
      axios.put.mockResolvedValueOnce({ data: { trip: mockSavedTrip } });
      const success = await useTripStore.getState().saveTrip();

      expect(success).toBe(true);
      const state = useTripStore.getState();
      expect(state.tripData.updated_at).toBe(mockSavedTrip.updated_at);
      expect(state.isLoading).toBe(false);
      expect(toast.success).toHaveBeenCalledWith('Trip "Adventure to Save" progress saved!');
      expect(axios.put).toHaveBeenCalledWith(`${API_URL}/trips/custom/trip789`, expect.objectContaining({ title: 'Adventure to Save' }));
    });

    it('should handle API error during trip save', async () => {
      axios.put.mockRejectedValueOnce({ response: { data: { message: 'Save failed' } } });
      const success = await useTripStore.getState().saveTrip();

      expect(success).toBe(false);
      const state = useTripStore.getState();
      expect(state.error).toBe('Save failed');
      expect(state.isLoading).toBe(false);
      expect(toast.error).toHaveBeenCalledWith('Save failed');
    });

    it('should warn if no active trip ID and no title to create one', async () => {
        useTripStore.setState({ tripData: { ...initialTripState, id: null, title: '' } }); // No ID, no title
        const success = await useTripStore.getState().saveTrip();
        expect(success).toBe(false);
        expect(toast.warn).toHaveBeenCalledWith("Cannot save: No active trip ID. Please create the trip first.");
    });

    it('should handle AI image upload during save', async () => {
        const mockFile = new File(["dummy content"], "ai_image.png", { type: "image/png" });
        URL.createObjectURL = jest.fn(() => "blob:http://localhost/mock-url-for-preview"); // Mock createObjectURL
        useTripStore.setState({
            tripData: { ...existingTrip, ai_image_file_for_upload: mockFile, ai_image_url: "blob:http://localhost/mock-url-for-preview" }
        });

        axios.post.mockResolvedValueOnce({ data: { imageUrl: 'http://server.com/ai_image.png' } }); // Image upload
        axios.put.mockResolvedValueOnce({ data: { trip: mockSavedTrip } }); // Trip save

        await useTripStore.getState().saveTrip();

        expect(axios.post).toHaveBeenCalledWith(
            `${API_URL}/trips/custom/${existingTrip.id}/upload-ai-image`,
            expect.any(FormData), // Check that FormData is used
            expect.objectContaining({ headers: { 'Content-Type': 'multipart/form-data' } })
        );
        const state = useTripStore.getState();
        expect(state.tripData.ai_image_url).toBe('http://server.com/ai_image.png'); // URL from backend
        expect(state.tripData.ai_image_file_for_upload).toBeUndefined(); // File should be cleared
        expect(toast.success).toHaveBeenCalledWith("AI inspiration image uploaded!");
        expect(toast.success).toHaveBeenCalledWith(`Trip "${mockSavedTrip.title}" progress saved!`);
    });
  });

  describe('Component Management Actions', () => {
    const componentData = { component_type: 'flight', title: 'Flight to Paris' };
    it('addComponent should add a component with a client ID', () => {
      useTripStore.getState().addComponent(componentData);
      const state = useTripStore.getState();
      expect(state.tripData.components.length).toBe(1);
      expect(state.tripData.components[0].title).toBe('Flight to Paris');
      expect(state.tripData.components[0].id).toMatch(/^client-/);
      expect(toast.info).toHaveBeenCalledWith('flight added to trip.');
    });

    it('updateComponent should update an existing component', () => {
      useTripStore.getState().addComponent({ ...componentData, id: 'comp1' });
      useTripStore.getState().updateComponent('comp1', { title: 'Updated Flight' });
      const state = useTripStore.getState();
      expect(state.tripData.components[0].title).toBe('Updated Flight');
      expect(toast.info).toHaveBeenCalledWith('Item updated.');
    });

    it('removeComponent should remove a component', () => {
      useTripStore.getState().addComponent({ ...componentData, id: 'comp1' });
      useTripStore.getState().removeComponent('comp1');
      const state = useTripStore.getState();
      expect(state.tripData.components.length).toBe(0);
      expect(toast.info).toHaveBeenCalledWith('Item removed from trip.');
    });
  });

  describe('Route Planning Actions', () => {
    const itineraryItems = [{ id: 'route1', name: 'Paris Stop' }];
    const waypoints = [{ lat: 48.85, lng: 2.35 }];
    it('updateRouteItinerary should update itinerary', () => {
      useTripStore.getState().updateRouteItinerary(itineraryItems);
      const state = useTripStore.getState();
      expect(state.tripData.routePlanning.itinerary).toEqual(itineraryItems);
    });
    it('updateRouteWaypoints should update waypoints', () => {
      useTripStore.getState().updateRouteWaypoints(waypoints);
      const state = useTripStore.getState();
      expect(state.tripData.routePlanning.waypoints).toEqual(waypoints);
    });
  });
  
  describe('AI Features Actions', () => {
    it('setAiImageFile should update ai_image_file_for_upload and preview URL', () => {
        const mockFile = new File(["dummy"], "test.png", { type: "image/png" });
        URL.createObjectURL = jest.fn(() => "blob:http://localhost/mock-preview-url");
        
        useTripStore.getState().setAiImageFile(mockFile);
        
        const state = useTripStore.getState();
        expect(state.tripData.ai_image_file_for_upload).toBe(mockFile);
        expect(state.tripData.ai_image_url).toBe("blob:http://localhost/mock-preview-url");
        
        jest.restoreAllMocks(); // Clean up URL.createObjectURL mock
    });

    it('fetchAiRecommendations should update recommendations (mocked)', async () => {
        // Mock API call within fetchAiRecommendations if it were real
        await useTripStore.getState().fetchAiRecommendations('budget');
        const state = useTripStore.getState();
        expect(state.tripData.recommendations).toBeDefined();
        expect(state.tripData.recommendations.budget.suggestions.length).toBeGreaterThan(0);
        expect(toast.info).toHaveBeenCalledWith("Mock AI recommendations loaded.");
        expect(state.isLoading).toBe(false);
    });
  });

  describe('resetTrip Action', () => {
    it('should reset tripData to initial state, preserving user_id', () => {
      mockAuthStoreState.user = { id: 'user123' };
      useTripStore.setState({ tripData: { id: 'trip1', title: 'Old Trip', user_id: 'user123' } });
      
      useTripStore.getState().resetTrip();
      
      const state = useTripStore.getState();
      expect(state.tripData.id).toBeNull();
      expect(state.tripData.title).toBe('');
      expect(state.tripData.user_id).toBe('user123'); // Preserved
      expect(toast.info).toHaveBeenCalledWith("Trip plan has been reset.");
    });
  });

  describe('Persistence Middleware (tripStore)', () => {
    it('should persist specified parts of tripData to localStorage', () => {
        const tripToPersist = {
            id: 'persist123', title: 'Persisted Trip', destinations: 'Moon',
            start_date: '2025-01-01', end_date: '2025-01-10', number_of_travelers: 2,
            budget_amount: 5000, currency: 'EUR', inspiration_source: 'manual',
            inspiration_reference_id: null, ai_image_url: 'http://image.com/img.png',
            preferences: { interests: ['space'], travel_style: 'luxury', pace: 'slow' },
            components: [{id: 'flight1', type: 'flight'}],
            routePlanning: { itinerary: [{id: 'routeMoon', name: 'Moon Base Alpha'}] },
            status: 'planned', user_id: 'userPersist',
            // These should NOT be persisted
            ai_image_file_for_upload: new File([""], "test.png"), 
        };
        useTripStore.setState({ tripData: tripToPersist, isLoading: true }); // isLoading should not persist

        // Trigger save (which implicitly uses persist middleware)
        // In a real scenario, persist happens on set. We can directly check localStorage.
        // For testing, we assume `set` triggers persist. Let's check localStorage.
        const rawStored = localStorageMock.getItem('adventureconnect-trip-storage');
        expect(rawStored).not.toBeNull();
        const storedJson = JSON.parse(rawStored);
        
        const persistedTripData = storedJson.state.tripData;
        expect(persistedTripData.id).toBe(tripToPersist.id);
        expect(persistedTripData.title).toBe(tripToPersist.title);
        expect(persistedTripData.ai_image_file_for_upload).toBeUndefined(); // Should not be persisted
        expect(storedJson.state.isLoading).toBeUndefined(); // isLoading should not be persisted
    });

    it('onRehydrateStorage should correctly set initial loading states', () => {
        const mockState = { isLoading: false, isFetchingExisting: false, error: null, tripData: { ai_image_file_for_upload: null } };
        const onRehydrate = useTripStore.persist.onRehydrateStorage();
        onRehydrate(mockState); // Simulate rehydration
        
        // Check that the state properties modified by onRehydrate are as expected
        // The actual onRehydrate in tripStore sets isLoading and isFetchingExisting to false,
        // and ai_image_file_for_upload to null.
        expect(mockState.isLoading).toBe(false);
        expect(mockState.isFetchingExisting).toBe(false);
        expect(mockState.tripData.ai_image_file_for_upload).toBeNull();
    });
  });

});
