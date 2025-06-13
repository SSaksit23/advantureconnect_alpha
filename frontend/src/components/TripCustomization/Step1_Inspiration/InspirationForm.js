import React, { useState, useEffect } from 'react';
import axios from 'axios'; // Or your pre-configured apiClient
import { toast } from 'react-toastify';
import { Loader2, Lightbulb, ClipboardList, ImageIcon } from 'lucide-react';
import { API_URL } from '../constants'; // Assuming constants.js is in the parent directory
import InputField from '../common/InputField'; // Assuming InputField is in common

/**
 * InspirationForm Component
 * Handles the first step of trip customization: gathering inspiration.
 * This includes setting a trip title, choosing an inspiration method (from scratch,
 * example trip, or AI image), and handling related inputs.
 *
 * @param {object} props - Props passed from Step1InspirationComponent.
 * @param {object} props.tripData - The current state of the trip.
 * @param {function} props.updateTripData - Function to update parts of the tripData.
 * @param {function} props.onProceedToNextStep - Callback to proceed to the next step
 *                                               (handles saving/creating trip and navigation).
 * @param {string|null} props.currentTripId - The ID of the current trip, if it exists.
 * @param {string|null} props.token - The user's authentication token.
 * @param {boolean} props.isLoading - General loading state from the orchestrator.
 * @returns {JSX.Element} The InspirationForm component.
 */
const InspirationForm = ({
  tripData,
  updateTripData,
  onProceedToNextStep,
  currentTripId, // May not be directly used if onProceedToNextStep handles creation logic
  token,
  isLoading // General loading state from orchestrator, e.g., while saving
}) => {
  const [inspirationType, setInspirationType] = useState(tripData.inspiration_source || '');
  const [exampleTrips, setExampleTrips] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [aiImageFile, setAiImageFile] = useState(null); // File object for upload
  const [aiImageUrl, setAiImageUrl] = useState(tripData.ai_image_url || ''); // URL for preview or from backend
  // isUploadingAiImage could be a local state if upload happens here,
  // or derived from props.isLoading if handled by useTripData
  const [isProcessingNext, setIsProcessingNext] = useState(false); // Local loading for this form's next action

  const apiClient = axios.create({
    baseURL: API_URL,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  });

  useEffect(() => {
    // Sync local inspirationType with tripData if it changes externally
    if (tripData.inspiration_source !== inspirationType) {
      setInspirationType(tripData.inspiration_source || '');
    }
    // Sync local aiImageUrl with tripData if it changes externally (e.g., after save/load)
    if (tripData.ai_image_url !== aiImageUrl && !aiImageFile) { // only if not currently previewing a new file
        setAiImageUrl(tripData.ai_image_url || '');
    }
  }, [tripData.inspiration_source, tripData.ai_image_url]);


  useEffect(() => {
    if (inspirationType === 'example_trip' && exampleTrips.length === 0 && token) {
      setLoadingTemplates(true);
      apiClient.get('/trips/templates')
        .then(response => setExampleTrips(response.data?.templates || response.data || [])) // Adjust based on actual API response
        .catch(err => {
          console.error("Failed to load example trips:", err);
          toast.error("Failed to load example trips. Please try again or select another option.");
          setExampleTrips([]); // Ensure it's an array on error
        })
        .finally(() => setLoadingTemplates(false));
    }
  }, [inspirationType, token, apiClient]); // exampleTrips.length removed to allow re-fetch if needed

  const handleInspirationTypeChange = (e) => {
    const newType = e.target.value;
    setInspirationType(newType);
    updateTripData({ inspiration_source: newType });
  };

  const handleAiImageFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        toast.error("Image file too large. Please select an image under 5MB.");
        return;
      }
      setAiImageFile(file);
      setAiImageUrl(URL.createObjectURL(file)); // For local preview
      // Store the file object in tripData; useTripData hook will handle the actual upload
      // during saveTripProgress or createTrip.
      updateTripData({ ai_image_file_for_upload: file, ai_image_url: '' }); // Clear existing URL if new file
      toast.info("AI Image selected. It will be processed when you save or proceed.");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!tripData.title?.trim()) {
      toast.warn("A trip title is required to proceed.");
      return;
    }
    if (isLoading || isProcessingNext) return; // Prevent double submission

    setIsProcessingNext(true);

    // Update tripData with the selected inspiration type before proceeding
    updateTripData({ inspiration_source: inspirationType });

    // onProceedToNextStep is expected to handle saving (which includes creation if tripId is null)
    // and then navigating to the next step.
    await onProceedToNextStep();

    setIsProcessingNext(false);
  };

  const effectiveLoading = isLoading || isProcessingNext;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <InputField
          label="Trip Title"
          name="title"
          value={tripData.title}
          onChange={(e) => updateTripData({ title: e.target.value })}
          placeholder="e.g., My European Adventure, Summer in Southeast Asia"
          required
          disabled={effectiveLoading}
          error={!tripData.title?.trim() ? "A trip title is needed to save and proceed." : ""}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="inspirationType" className="block text-sm font-medium text-gray-700">
          Inspiration Method:
        </label>
        <select
          id="inspirationType"
          value={inspirationType}
          onChange={handleInspirationTypeChange}
          disabled={effectiveLoading}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100"
        >
          <option value="">Select an option</option>
          <option value="manual">Start From Scratch (Manual Planning)</option>
          <option value="example_trip">Use an Example Trip Template</option>
          <option value="ai_image">Upload Image for AI-Powered Ideas</option>
        </select>
      </div>

      {inspirationType === 'example_trip' && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <label htmlFor="exampleTripSelect" className="block text-sm font-medium text-blue-700 mb-1">
            Choose an Example Trip:
          </label>
          {loadingTemplates ? (
            <div className="flex items-center text-blue-600">
              <Loader2 className="animate-spin h-5 w-5 mr-2" /> Loading templates...
            </div>
          ) : exampleTrips.length > 0 ? (
            <select
              id="exampleTripSelect"
              value={tripData.inspiration_reference_id || ''}
              onChange={(e) => updateTripData({ inspiration_reference_id: e.target.value || null })}
              disabled={effectiveLoading}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100"
            >
              <option value="">Select an Example Trip</option>
              {exampleTrips.map(trip => (
                <option key={trip.id} value={trip.id}>{trip.title} - {trip.destinations}</option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-gray-500">No example trip templates available at the moment.</p>
          )}
        </div>
      )}

      {inspirationType === 'ai_image' && (
        <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
          <InputField
            label="Upload Image for AI Inspiration"
            type="file"
            name="ai_image"
            onChange={handleAiImageFileChange}
            accept="image/png, image/jpeg, image/webp"
            disabled={effectiveLoading}
          />
          {aiImageUrl && (
            <div className="mt-3">
              <img src={aiImageUrl} alt="AI Inspiration Preview" className="max-h-48 rounded-md shadow-md" />
            </div>
          )}
          <p className="text-xs text-purple-600 mt-2">
            Upload an image (max 5MB) that inspires your trip. Our AI will analyze it to suggest ideas later.
          </p>
        </div>
      )}

      <p className="text-sm text-gray-500 mt-2">
        Your choice here will help tailor the suggestions and planning tools in the next steps.
      </p>

      <div className="pt-2 text-right"> {/* Changed from mt-4 to pt-2 for closer spacing */}
        <button
          type="submit"
          disabled={effectiveLoading || !tripData.title?.trim()}
          className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center ml-auto"
          // This button calls props.onProceedToNextStep which is onNextForStep from orchestrator
        >
          {effectiveLoading ? (
            <Loader2 className="animate-spin h-5 w-5 mr-2" />
          ) : (
            <Lightbulb className="h-5 w-5 mr-2" />
          )}
          {effectiveLoading ? 'Processing...' : 'Next: Core Details'}
        </button>
      </div>
    </form>
  );
};

export default InspirationForm;
