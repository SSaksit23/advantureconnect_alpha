import { useState, useCallback } from 'react';
import { STEPS } from '../../../constants/tripCustomization'; // Adjusted path to global constants

/**
 * Custom hook for managing navigation within the trip customization flow.
 * It handles the current step and provides functions to move to the next or previous step.
 *
 * @returns {object} An object containing:
 *  - `currentStep` (number|string): The ID of the current active step (from STEPS array).
 *  - `setCurrentStep` (function): Function to directly set the current step by its ID.
 *  - `handleNext` (function): Function to navigate to the next step.
 *  - `handlePrev` (function): Function to navigate to the previous step.
 *  - `isFirstStep` (boolean): True if the current step is the first step.
 *  - `isLastStep` (boolean): True if the current step is the last step.
 *  - `totalSteps` (number): The total number of steps in the flow.
 *  - `getCurrentStepConfig` (function): Function to get the configuration object for the current step.
 */
const useTripNavigation = () => {
  const [currentStep, setCurrentStep] = useState(STEPS.length > 0 ? STEPS[0].id : null);

  const totalSteps = STEPS.length;

  const handleNext = useCallback(() => {
    setCurrentStep((prevStepId) => {
      const currentIndex = STEPS.findIndex(step => step.id === prevStepId);
      if (currentIndex >= 0 && currentIndex < totalSteps - 1) {
        return STEPS[currentIndex + 1].id;
      }
      return prevStepId; // Stay on the last step if already there
    });
  }, [totalSteps]);

  const handlePrev = useCallback(() => {
    setCurrentStep((prevStepId) => {
      const currentIndex = STEPS.findIndex(step => step.id === prevStepId);
      if (currentIndex > 0) {
        return STEPS[currentIndex - 1].id;
      }
      return prevStepId; // Stay on the first step if already there
    });
  }, []);

  const isFirstStep = STEPS.length > 0 ? currentStep === STEPS[0].id : true;
  const isLastStep = STEPS.length > 0 ? currentStep === STEPS[totalSteps - 1].id : true;

  const getCurrentStepConfig = useCallback(() => {
    return STEPS.find(step => step.id === currentStep) || null;
  }, [currentStep]);

  return {
    currentStep,
    setCurrentStep, // Allows direct navigation, e.g., from progress bar by step ID
    handleNext,
    handlePrev,
    isFirstStep,
    isLastStep,
    totalSteps,
    getCurrentStepConfig,
  };
};

export default useTripNavigation;
