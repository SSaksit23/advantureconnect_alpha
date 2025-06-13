import React, { useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext'; // Adjusted path
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Compass, Loader2, Save } from 'lucide-react';

import { STEPS } from '../../../constants/tripCustomization'; // Adjusted path
import {
  useTripStore,
  useCurrentTripData,
  useTripLoadingStates,
  useTripError,
  useTripActions,
  useTripId as useStoreTripId // Alias to avoid conflict if needed
} from '../../../stores/tripStore'; // Adjusted path
import useTripNavigation from './hooks/useTripNavigation'; // Assuming this path

import ProgressBar from './common/ProgressBar';
// StepNavigationButtons will be used within individual step components or the main orchestrator if needed globally.
// For now, each step component might have its own navigation, or we pass onNext/onPrev.

// Import actual refactored Step 1 and Step 2
import Step1InspirationComponent from './Step1_Inspiration';
import Step2CoreDetailsComponent from './Step2_CoreDetails'; // Import the new Step 2 component

// --- Placeholder Step Components (to be replaced by actual refactored components) ---
const StepPlaceholder = ({ stepName, onNext, onPrev, isFirstStep, isLastStep, nextStepName, isLoading }) => {
  // This placeholder will now also get saveTrip from useTripActions if needed
  // Or it will rely on the onNext prop to handle saving.
  const { saveTrip } = useTripActions();
  return (
    <div className="py-8">
      <h2 className="text-xl font-semibold mb-4">Step {STEPS.find(s => s.name === stepName)?.id}: {stepName}</h2>
      <p className="text-gray-600">Content for {stepName} will be implemented here.</p>
      <p className="text-sm text-gray-500 mt-2">This is a placeholder. The actual component will contain forms and logic specific to this step.</p>
      <div className="flex justify-between mt-6">
        <button onClick={onPrev} disabled={isFirstStep || isLoading} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50">Previous</button>
        <button onClick={onNext} disabled={isLoading} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
            {isLastStep ? 'Finish & Review' : (nextStepName ? `Next: ${nextStepName}` : 'Next')}
        </button>
      </div>
      <button onClick={async () => { await saveTrip(); }} disabled={isLoading} className="mt-4 px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:opacity-50">
        Save Progress (Placeholder Button)
      </button>
    </div>
  );
};

// const Step1InspirationPlaceholder = (props) => <StepPlaceholder stepName="Inspiration" {...props} />; // Replaced
// const Step2CoreDetailsPlaceholder = (props) => <StepPlaceholder stepName="Core Details" {...props} />; // Replaced
const Step3RoutePlanningPlaceholder = (props) => <StepPlaceholder stepName="Route Planning" {...props} />;
const Step4FlightsPlaceholder = (props) => <StepPlaceholder stepName="Flights" {...props} />;
const Step5AccommodationPlaceholder = (props) => <StepPlaceholder stepName="Accommodation" {...props} />;
const Step6ActivitiesAndPoisPlaceholder = (props) => <StepPlaceholder stepName="Activities & POIs" {...props} />;
const Step7PreferencesStylePlaceholder = (props) => <StepPlaceholder stepName="Preferences & Style" {...props} />;
const Step8ReviewOptimizePlaceholder = (props) => <StepPlaceholder stepName="Review & Optimize" {...props} />;
const Step9FinalizeBookPlaceholder = (props) => <StepPlaceholder stepName="Finalize & Book" {...props} />;


// --- Main TripCustomization Orchestrator Component ---
const TripCustomizationOrchestrator = () => {
  const { token } = useAuth(); // Still needed for API calls within store actions if not using global apiClient
  const { tripId: paramTripId } = useParams();
  const navigate = useNavigate();

  // Zustand Store Hooks
  const tripData = useCurrentTripData();
  const { isLoading, isFetchingExisting, isUploadingAiImage } = useTripLoadingStates();
  const error = useTripError();
  const { initializeTrip, saveTrip, updateTripDetails /* other actions if needed directly */ } = useTripActions();
  const storeTripId = useStoreTripId(); // Get tripId from the store

  // Local Navigation Hook
  const {
    currentStep: currentStepId, // Renaming for clarity, it's step ID
    setCurrentStep: setCurrentStepId,
    handleNext: navigateToNextStep,
    handlePrev: navigateToPrevStep,
    isFirstStep,
    isLastStep,
  } = useTripNavigation();

  // Initialize trip store on mount or when paramTripId/token changes
  useEffect(() => {
    initializeTrip(paramTripId || null);
  }, [paramTripId, initializeTrip]); // Removed token as initializeTrip should get it from authStore if needed

  // Effect to synchronize URL with store's trip ID after creation/loading
  useEffect(() => {
    if (storeTripId && storeTripId !== paramTripId) {
      navigate(`/customize-trip/${storeTripId}`, { replace: true });
    }
  }, [storeTripId, paramTripId, navigate]);

  const handleProgressBarStepClick = async (stepIdToNavigate) => {
    if (stepIdToNavigate === currentStepId) return;

    const currentStepIndex = STEPS.findIndex(s => s.id === currentStepId);
    const targetStepIndex = STEPS.findIndex(s => s.id === stepIdToNavigate);

    if (targetStepIndex < currentStepIndex) { // Allow going back freely
      setCurrentStepId(stepIdToNavigate);
    } else { // Going forward
      if (storeTripId) { // Trip exists, save progress before jumping
        const savedSuccessfully = await saveTrip();
        if (savedSuccessfully) {
          setCurrentStepId(stepIdToNavigate);
        } else {
          toast.error("Failed to save progress. Cannot jump to a future step yet.");
        }
      } else {
        // If trip doesn't exist (e.g., on step 1 before first save)
        // and trying to jump forward beyond the immediate next step
        if (targetStepIndex > currentStepIndex + 1) {
             toast.warn("Please complete the current step or save your trip to navigate further ahead.");
        } else {
            // Allow moving to immediate next step even if trip not created, createTrip will be handled by onNext
            // Or, if this is the first step, the onNext handler for Step 1 will create the trip.
            // For simplicity, if not created, only allow sequential next.
            // A more robust solution might check if current step is "dirty" and needs saving.
            setCurrentStepId(stepIdToNavigate); // This might need refinement based on step validation
        }
      }
    }
  };

  const onNextForStep = async () => {
    const savedSuccessfully = await saveTrip(); // saveTrip in store handles creation if ID is null
    if (savedSuccessfully) {
      navigateToNextStep();
    } else {
      // Error toast is handled within saveTrip action
    }
  };

  const onPrevForStep = () => {
    // Consider if saving is needed on "Prev". Usually not, but depends on UX requirements.
    navigateToPrevStep();
  };

  const renderStepContent = () => {
    const currentStepConfig = STEPS.find(step => step.id === currentStepId);
    if (!currentStepConfig) {
        // Fallback to first step if currentStepId is invalid
        if (STEPS.length > 0 && !STEPS.find(s => s.id === currentStepId)) {
            setCurrentStepId(STEPS[0].id);
        }
        return <p>Loading step or unknown step...</p>;
    }

    const nextStepIndex = STEPS.findIndex(step => step.id === currentStepId) + 1;
    const nextStepConfig = nextStepIndex < STEPS.length ? STEPS[nextStepIndex] : null;

    // Props for step components. They will primarily use useTripStore themselves.
    // However, navigation controls and global loading state can be passed.
    const stepProps = {
      // tripData, updateTripDetails, tripId, token, saveTrip, createTrip are now consumed from store by step components
      onNext: onNextForStep,
      onPrev: onPrevForStep,
      isFirstStep,
      isLastStep,
      nextStepName: nextStepConfig?.name,
      isLoading: isLoading || isFetchingExisting || isUploadingAiImage, // Combined loading state
    };

    switch (currentStepId) {
      case 1: return <Step1InspirationComponent {...stepProps} />;
      case 2: return <Step2CoreDetailsComponent {...stepProps} />; // Use the actual component
      case 3: return <Step3RoutePlanningPlaceholder {...stepProps} />;
      case 4: return <Step4FlightsPlaceholder {...stepProps} />;
      case 5: return <Step5AccommodationPlaceholder {...stepProps} />;
      case 6: return <Step6ActivitiesAndPoisPlaceholder {...stepProps} />;
      case 7: return <Step7PreferencesStylePlaceholder {...stepProps} />;
      case 8: return <Step8ReviewOptimizePlaceholder {...stepProps} />;
      case 9: return <Step9FinalizeBookPlaceholder {...stepProps} />;
      default:
        return <p>Loading step or unknown step...</p>;
    }
  };

  if (isFetchingExisting && !storeTripId) { // Show full page loader only when initially fetching an existing trip
    return (
      <div className="flex flex-col justify-center items-center min-h-[calc(100vh-120px)] bg-gray-50 p-4">
        <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
        <p className="mt-4 text-lg text-gray-700">Loading your trip...</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 bg-gray-50 min-h-screen">
      <header className="mb-8 text-center">
        <Compass className="h-12 w-12 md:h-16 md:w-16 mx-auto text-green-600 mb-3" />
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800">
          {storeTripId ? `Editing: ${tripData.title || 'Your Adventure'}` : "Build Your Dream Adventure"}
        </h1>
        <p className="text-gray-600 mt-1 md:mt-2">
          Craft a personalized itinerary step-by-step.
        </p>
      </header>

      <div className="max-w-4xl mx-auto">
        <ProgressBar
          steps={STEPS}
          currentStepId={currentStepId}
          onStepClick={handleProgressBarStepClick}
        />

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 border border-red-300 rounded-md text-sm">
            <p><strong>Error:</strong> {error}</p>
          </div>
        )}

        <div className="bg-white p-6 sm:p-8 rounded-xl shadow-xl relative">
          {(isLoading && !isFetchingExisting) && ( // Show overlay loader for save/create
            <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-20 rounded-xl">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              <span className="ml-2 text-gray-700">Processing...</span>
            </div>
          )}
          {renderStepContent()}
        </div>

        <div className="mt-8 text-center">
          <button
            onClick={async () => {
              const success = await saveTrip();
              if (success && !storeTripId) { // If it was a new trip creation via saveTrip
                // The useEffect for URL sync will handle navigation
              }
            }}
            disabled={isLoading || isFetchingExisting || (!storeTripId && !tripData.title?.trim())}
            className="px-6 py-3 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed flex items-center mx-auto transition-colors"
          >
            <Save className="h-5 w-5 mr-2" />
            {storeTripId ? 'Save Progress' : (tripData.title?.trim() ? 'Save & Start Trip' : 'Save Progress (Enter Title First)')}
          </button>
          <p className="text-xs text-gray-500 mt-2">
            {storeTripId ? `Current Trip ID: ${storeTripId}` : (!tripData.title?.trim() ? "Provide a title in Step 1 to enable saving." : "Trip not saved yet.")}
          </p>
        </div>
      </div>
    </div>
  );
};

export default TripCustomizationOrchestrator;
