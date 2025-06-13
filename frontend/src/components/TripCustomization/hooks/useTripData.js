import { useState, useCallback, useEffect } from 'react';
import axios from 'axios'; // Or your pre-configured apiClient
import { toast } from 'react-toastify';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext'; // Adjust path as needed
import { API_URL } from '../constants';

const initialTripState = {
  title: '',
  destinations: '',
  start_date: null,
  end_date: null,
  number_of_travelers: 1,
  budget_amount: 0,
  currency: 'USD',
  inspiration_source: '',
  inspiration_reference_id: null,
  ai_image_url: '',
  preferences: {
    interests: [],
    travel_style: 'balanced', // e.g., 'budget', 'luxury', 'adventure', 'relaxing'
    pace: 'medium', // e.g., 'fast', 'medium', 'slow'
  },
  components: [], // Flights, Hotels, Activities
  routePlanning: {
    itinerary: [], // [{ id, name, type ('destination'/'custom'), day, date, coordinates }]
    waypoints: [], // For map display
  },
  status: 'draft', // 'draft', 'planned', 'booked', 'completed'
  // Other fields from your schema like user_id will be handled by backend or auth context
  // id, created_at, updated_at will be set by backend
};

/**
 * Custom hook for managing trip data state and API interactions.
 * It manages tripData, loading states, error states, and provides
 * methods for loading, creating, and saving trips.
 *
 * @returns {object} An object containing trip data, state, and management functions.
 */
const useTripData = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { tripId: paramTripId } = useParams(); // Get tripId from URL params

  const [tripData, setTripData] = useState(initialTripState);
  const [tripId, setTripId] = useState(paramTripId || null);
  
  const [isLoading, setIsLoading] = useState(false); // General loading for save/create
  const [isFetchingExisting, setIsFetchingExisting] = useState(!!paramTripId);
  const [error, setError] = useState(null);

  const apiClient = axios.create({
    baseURL: API_URL,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  apiClient.interceptors.request.use(
    (config) => {
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    },
    (error) => Promise.reject(error)
  );

  /**
   * Updates the tripData state by merging new data with the previous state.
   * @param {object} newData - An object containing the new data to merge.
   */
  const updateTripData = useCallback((newData) => {
    setTripData((prevData) => ({ ...prevData, ...newData }));
  }, []);

  /**
   * Loads an existing trip from the backend.
   * @param {string} id - The ID of the trip to load.
   */
  const loadExistingTrip = useCallback(async (id) => {
    if (!id || !token) return;

    setIsFetchingExisting(true);
    setError(null);
    try {
      const response = await apiClient.get(`/trips/custom/${id}`);
      const loadedTrip = response.data;
      setTripData({
        ...initialTripState, // Start with defaults to ensure all fields are present
        ...loadedTrip,
        components: loadedTrip.components || [],
        preferences: loadedTrip.preferences || initialTripState.preferences,
        routePlanning: loadedTrip.routePlanning || initialTripState.routePlanning,
      });
      setTripId(loadedTrip.id);
      toast.success(`Loaded existing trip: ${loadedTrip.title}`);
    } catch (err) {
      console.error("Error loading existing trip:", err);
      const errorMessage = err.response?.data?.message || "Failed to load trip data.";
      setError(errorMessage);
      toast.error(errorMessage);
      if (err.response?.status === 403 || err.response?.status === 404) {
        navigate('/customize-trip'); // Redirect to new trip page if not found or forbidden
      }
    } finally {
      setIsFetchingExisting(false);
    }
  }, [token, navigate, apiClient]);

  // Effect to load trip if paramTripId and token are present
  useEffect(() => {
    if (paramTripId && token) {
      loadExistingTrip(paramTripId);
    } else if (!paramTripId) {
      // Reset to initial state if navigating to a new trip creation page
      setTripData(initialTripState);
      setTripId(null);
      setIsFetchingExisting(false);
    }
  }, [paramTripId, token, loadExistingTrip]);


  /**
   * Creates a new trip draft on the backend.
   * @param {object} currentTripDetails - The initial details for the trip, typically at least a title.
   * @returns {Promise<string|null>} The ID of the newly created trip, or null if creation failed.
   */
  const createTrip = useCallback(async (currentTripDetails) => {
    if (tripId) { // If a tripId already exists (either from URL or previous creation)
      return tripId;
    }
    if (!currentTripDetails.title) {
      toast.warn("Please provide a trip title to start.");
      return null;
    }

    setIsLoading(true);
    setError(null);
    try {
      // Ensure essential fields for creation are present
      const payload = {
        ...initialTripState, // Start with defaults
        ...currentTripDetails, // Overlay provided details
        status: 'draft', // Ensure status is draft
      };
      const response = await apiClient.post('/trips/custom', payload);
      const newTrip = response.data.trip; // Assuming backend returns { trip: { ... } }
      
      setTripData(prev => ({ ...prev, ...newTrip, id: newTrip.id })); // Update local state with full trip object from backend
      setTripId(newTrip.id);
      toast.success(`Trip "${newTrip.title}" created successfully!`);
      navigate(`/customize-trip/${newTrip.id}`, { replace: true }); // Update URL
      return newTrip.id;
    } catch (err) {
      console.error("Create trip error:", err);
      const errorMessage = err.response?.data?.message || "Failed to create trip draft.";
      setError(errorMessage);
      toast.error(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [tripId, token, navigate, apiClient]);

  /**
   * Saves the current progress of the trip to the backend.
   * If no tripId exists, it will attempt to create a new trip first.
   * @returns {Promise<boolean>} True if saving was successful, false otherwise.
   */
  const saveTripProgress = useCallback(async () => {
    let currentActiveTripId = tripId || tripData.id;

    if (!currentActiveTripId) {
      if (!tripData.title) {
        toast.warn("Please provide a trip title before saving.");
        return false;
      }
      // Attempt to create the trip first if it doesn't exist
      const newId = await createTrip(tripData); // createTrip now uses currentTripDetails from its args
      if (!newId) {
        toast.error("Cannot save: Failed to create the initial trip draft.");
        return false;
      }
      currentActiveTripId = newId;
      // After creation, tripData state is updated by createTrip, so we use the latest tripData
    }
    
    // Ensure we are using the most up-to-date tripData for saving
    // This is tricky because createTrip updates tripData asynchronously.
    // A better pattern might be for saveTripProgress to take tripData as an argument,
    // or rely on the effect of createTrip updating the URL, which then re-runs loadExistingTrip.
    // For now, let's assume createTrip sets tripId, and we use the current tripData from state.

    if (!currentActiveTripId) { // Double check after potential creation
        toast.error("Cannot save: Trip ID is still missing.");
        return false;
    }

    setIsLoading(true);
    setError(null);
    try {
      const payload = { ...tripData }; 
      // Remove client-side only fields if any, e.g., ai_image_file_for_upload
      // The backend should ideally ignore unknown fields or use a DTO.
      delete payload.ai_image_file_for_upload; 

      const response = await apiClient.put(`/trips/custom/${currentActiveTripId}`, payload);
      const savedTrip = response.data.trip; // Assuming backend returns { trip: { ... } }

      // Update local state with the saved trip data from backend (e.g., updated_at)
      setTripData(prev => ({ ...prev, ...savedTrip }));
      toast.success(`Trip "${savedTrip.title}" progress saved!`);
      return true;
    } catch (err) {
      console.error("Save trip error:", err);
      const errorMessage = err.response?.data?.message || "Failed to save trip progress.";
      setError(errorMessage);
      toast.error(errorMessage);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [tripId, tripData, token, createTrip, apiClient]); // Added createTrip dependency

  return {
    tripData,
    updateTripData,
    tripId,
    setTripId, // Expose if direct manipulation is needed, e.g., after creation
    isLoading,
    isFetchingExisting,
    error,
    loadExistingTrip, // Expose for manual re-fetching if needed
    createTrip,
    saveTripProgress,
  };
};

export default useTripData;
