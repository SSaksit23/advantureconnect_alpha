import React from 'react';
import { useAuth } from '../../../contexts/AuthContext'; // Adjusted path
import { useNavigate } from 'react-router-dom'; // useParams is used within useTripData
import { toast } from 'react-toastify';
import { Compass, Loader2, Save } from 'lucide-react';

import { STEPS } from './constants';
import useTripData from './hooks/useTripData';
import useTripNavigation from './hooks/useTripNavigation';

import ProgressBar from './common/ProgressBar';
import StepNavigationButtons from './common/StepNavigationButtons'; // Will be used by individual step components
import Step1InspirationComponent from './Step1_Inspiration'; // Real refactored component

// --- Placeholder Step Components (to be replaced by actual refactored components) ---
// These placeholders will receive props like:
// tripData, updateTripData, onNext, onPrev, tripId, token, saveTripProgress, createTrip
const StepPlaceholder = ({ stepName, onNext, onPrev, isFirstStep, isLastStep, nextStepName, saveTripProgress, isLoading }) => (
  <div className="py-8">
    <h2 className="text-xl font-semibold mb-4">Step {STEPS.find(s => s.name === stepName)?.id}: {stepName}</h2>
    <p className="text-gray-600">Content for {stepName} will be implemented here.</p>
    <p className="text-sm text-gray-500 mt-2">This is a placeholder. The actual component will contain forms and logic specific to this step.</p>
    {/* Step-specific navigation buttons */}
    <StepNavigationButtons
        onPrev={onPrev}
        onNext={onNext}
        isFirstStep={isFirstStep}
        isLastStep={isLastStep}
        nextStepName={nextStepName}
        isLoading={isLoading}
        onSaveProgress={saveTripProgress} // Allow saving from step navigation as well
        canSave={true} // Assuming save is always possible from step nav
    />
  </div>
);

const Step1InspirationPlaceholder = (props) => <StepPlaceholder stepName="Inspiration" {...props} />;
const Step2CoreDetailsPlaceholder = (props) => <StepPlaceholder stepName="Core Details" {...props} />;
const Step3RoutePlanningPlaceholder = (props) => <StepPlaceholder stepName="Route Planning" {...props} />;
const Step4FlightsPlaceholder = (props) => <StepPlaceholder stepName="Flights" {...props} />;
const Step5ActivitiesAndPoisPlaceholder = (props) => <StepPlaceholder stepName="Activities & POIs" {...props} />;
const Step6AccommodationPlaceholder = (props) => <StepPlaceholder stepName="Accommodation" {...props} />;
const Step7OptimizationPlaceholder = (props) => <StepPlaceholder stepName="Optimization" {...props} />;
const Step8ReviewPlaceholder = (props) => <StepPlaceholder stepName="Review & Cost" {...props} />;
const Step9BookPlaceholder = (props) => <StepPlaceholder stepName="Book" {...props} />;


// --- Main TripCustomization Orchestrator Component ---
const TripCustomizationOrchestrator = () => {
  const { token } = useAuth();
  const navigate = useNavigate(); // For useTripData

  // Custom Hooks
  const tripDataHook = useTripData(); // Manages tripData, API calls, loading, errors
  const tripNavigationHook = useTripNavigation(); // Manages currentStep, navigation logic

  const {
    tripData,
    updateTripData,
    tripId,
    isLoading: isTripDataLoading, // Loading state for save/create/load operations
    isFetchingExisting,
    error: tripDataError,
    createTrip,
    saveTripProgress,
  } = tripDataHook;

  const {
    currentStep: currentStepId, // Renaming for clarity, it's step ID
    setCurrentStep: setCurrentStepId,
    handleNext: navigateToNextStep,
    handlePrev: navigateToPrevStep,
    isFirstStep,
    isLastStep,
    totalSteps,
  } = tripNavigationHook;

  // Handler for ProgressBar step clicks
  const handleProgressBarStepClick = async (stepIdToNavigate) => {
    if (stepIdToNavigate === currentStepId) return;

    if (stepIdToNavigate < currentStepId) { // Allow going back freely
      setCurrentStepId(stepIdToNavigate);
      toast.info(`Navigated to ${STEPS.find(s => s.id === stepIdToNavigate)?.name} step`);
    } else { // Going forward
      if (tripId) { // Trip exists, save progress before jumping
        const saved = await saveTripProgress();
        if (saved) {
          setCurrentStepId(stepIdToNavigate);
          toast.info(`Navigated to ${STEPS.find(s => s.id === stepIdToNavigate)?.name} step`);
        } else {
          toast.error("Failed to save progress. Cannot jump to a future step yet.");
        }
      } else {
        // If trip doesn't exist, prevent jumping forward beyond the next logical step
        // (or allow if first step logic creates the trip implicitly)
        toast.warn("Please complete previous steps or save your trip to navigate ahead.");
      }
    }
  };

  // Navigation handlers to be passed to step components
  // These will include saving logic before navigating
  const onNextForStep = async () => {
    const saved = await saveTripProgress(); // saveTripProgress handles create if tripId is null
    if (saved) {
      navigateToNextStep();
    } else {
      toast.error("Could not save trip progress. Please try again before proceeding.");
    }
  };

  const onPrevForStep = () => {
    navigateToPrevStep();
  };

  const renderStepContent = () => {
    const currentStepConfig = STEPS.find(step => step.id === currentStepId);
    const nextStepIndex = STEPS.findIndex(step => step.id === currentStepId) + 1;
    const nextStepName = nextStepIndex < STEPS.length ? STEPS[nextStepIndex].name : undefined;

    const stepProps = {
      tripData,
      updateTripData,
      onNext: onNextForStep,
      onPrev: onPrevForStep,
      isFirstStep,
      isLastStep,
      nextStepName,
      tripId,
      token,
      saveTripProgress, // Pass saveTripProgress directly for step-internal saves if needed
      createTrip,       // Pass createTrip for steps that might initiate creation (e.g. Step 1)
      isLoading: isTripDataLoading,
    };

    switch (currentStepId) {
      case 1: return <Step1InspirationComponent {...stepProps} />;
      case 2: return <Step2CoreDetailsPlaceholder {...stepProps} />;
      case 3: return <Step3RoutePlanningPlaceholder {...stepProps} />;
      case 4: return <Step4FlightsPlaceholder {...stepProps} />;
      case 5: return <Step5ActivitiesAndPoisPlaceholder {...stepProps} />;
      case 6: return <Step6AccommodationPlaceholder {...stepProps} />;
      case 7: return <Step7OptimizationPlaceholder {...stepProps} />;
      case 8: return <Step8ReviewPlaceholder {...stepProps} />;
      case 9: return <Step9BookPlaceholder {...stepProps} />;
      default:
        // Fallback to first step if currentStepId is invalid
        if (STEPS.length > 0 && !STEPS.find(s => s.id === currentStepId)) {
            setCurrentStepId(STEPS[0].id);
        }
        return <p>Loading step or unknown step...</p>;
    }
  };

  if (isFetchingExisting) {
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
          {tripId ? "Edit Your Adventure" : "Build Your Dream Adventure"}
        </h1>
        <p className="text-gray-600 mt-1 md:mt-2">
          Craft a personalized itinerary step-by-step.
        </p>
      </header>

      <div className="max-w-4xl mx-auto"> {/* Increased max-width for better layout */}
        <ProgressBar
          steps={STEPS}
          currentStepId={currentStepId}
          onStepClick={handleProgressBarStepClick}
        />

        {tripDataError && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 border border-red-300 rounded-md text-sm">
            <p><strong>Error:</strong> {tripDataError}</p>
          </div>
        )}

        <div className="bg-white p-6 sm:p-8 rounded-xl shadow-xl relative">
          {(isTripDataLoading && !isFetchingExisting) && ( // Show loader for save/create, but not if already fetching
            <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-20 rounded-xl">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
          )}
          {renderStepContent()}
        </div>

        <div className="mt-8 text-center">
          <button
            onClick={saveTripProgress}
            disabled={isTripDataLoading || (!tripId && !tripData.title)} // Disable if no title for new trip
            className="px-6 py-3 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed flex items-center mx-auto transition-colors"
          >
            <Save className="h-5 w-5 mr-2" />
            {tripId ? 'Save Progress' : (tripData.title ? 'Save & Start Trip' : 'Save Progress (Enter Title First)')}
          </button>
          <p className="text-xs text-gray-500 mt-2">
            {tripId ? `Current Trip ID: ${tripId}` : (!tripData.title ? "Provide a title in Step 1 to enable saving." : "Trip not saved yet.")}
          </p>
        </div>
      </div>
    </div>
  );
};

export default TripCustomizationOrchestrator;
