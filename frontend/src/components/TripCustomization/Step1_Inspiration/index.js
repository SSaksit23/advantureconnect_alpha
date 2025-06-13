import React from 'react';
import InspirationForm from './InspirationForm'; // To be created in the next step
import { Lightbulb } from 'lucide-react'; // Assuming icons are used per step

/**
 * Step 1: Inspiration Component
 * This component serves as the entry point and orchestrator for the "Inspiration" step
 * in the trip customization flow. It primarily renders the InspirationForm and passes
 * down necessary props for managing trip data and navigation.
 *
 * @param {object} props - Props passed from the TripCustomizationOrchestrator.
 * @param {object} props.tripData - The current state of the trip being customized.
 * @param {function} props.updateTripData - Function to update parts of the tripData.
 * @param {function} props.onNext - Callback function to proceed to the next step.
 *                                  This function (onNextForStep from orchestrator)
 *                                  handles saving progress (which includes creating the trip if new)
 *                                  and then navigating.
 * @param {function} props.createTrip - Function to create a new trip draft (from useTripData).
 *                                      While onNext handles creation implicitly via saveTripProgress,
 *                                      it's passed in case direct creation logic is preferred by InspirationForm.
 *                                      However, the primary flow should rely on onNext.
 * @param {string|null} props.tripId - The ID of the current trip, if it exists.
 * @param {string|null} props.token - The user's authentication token.
 * @param {boolean} props.isLoading - Loading state from the main orchestrator (e.g., when saving/creating).
 * @returns {JSX.Element} The Step1InspirationComponent.
 */
const Step1InspirationComponent = ({
  tripData,
  updateTripData,
  onNext, // This is onNextForStep from the orchestrator
  createTrip, // This is createTrip from useTripData
  tripId,
  token,
  isLoading
}) => {
  // This component is now primarily a wrapper.
  // The detailed form logic, local state for inspiration type, example trips,
  // AI image handling, and the actual "Next" button click handler (which validates title
  // and then calls `onNext`) will be inside `InspirationForm.js`.

  // The `onNext` prop (which is `onNextForStep` from the orchestrator)
  // already handles calling `saveTripProgress`. `saveTripProgress` in turn
  // calls `createTrip` if `tripId` is null and `tripData.title` is present.
  // So, `InspirationForm` just needs to ensure `tripData.title` is set via `updateTripData`
  // before its internal "Next" button calls this `onNext` prop.

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-3 mb-2">
        <Lightbulb className="h-8 w-8 text-blue-600" />
        <h2 className="text-2xl font-semibold text-gray-800">Trip Inspiration</h2>
      </div>
      <p className="text-gray-600">
        Let's start by gathering some inspiration for your adventure. How would you like to begin?
      </p>
      
      <InspirationForm
        tripData={tripData}
        updateTripData={updateTripData}
        onProceedToNextStep={onNext} // Pass the orchestrator's onNext function
        // createTrip={createTrip} // createTrip is implicitly handled by onNext via saveTripProgress
        currentTripId={tripId} // Pass currentTripId for context if needed by form
        token={token}
        isLoading={isLoading} // Pass general loading state
      />
      {/* 
        The actual "Next: Core Details" button will be part of InspirationForm.
        That button, when clicked, will first ensure tripData.title is set,
        then call the onProceedToNextStep (which is the onNext prop from here).
      */}
    </div>
  );
};

export default Step1InspirationComponent;
