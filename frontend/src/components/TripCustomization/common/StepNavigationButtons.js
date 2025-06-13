import React from 'react';
import { ChevronLeft, ChevronRight, Save, SkipForward, Loader2 } from 'lucide-react';

/**
 * A reusable navigation buttons component for multi-step forms or flows.
 * Provides "Previous", "Next", "Save Progress", and an optional "Skip" button.
 *
 * @param {object} props - The component's props.
 * @param {function} props.onPrev - Callback function for the "Previous" button.
 * @param {function} props.onNext - Callback function for the "Next" button.
 * @param {function} props.onSaveProgress - Callback function for the "Save Progress" button.
 * @param {function} [props.onSkip] - (Optional) Callback function for the "Skip" button.
 * @param {boolean} [props.isFirstStep=false] - True if this is the first step (hides "Previous").
 * @param {boolean} [props.isLastStep=false] - True if this is the last step (changes "Next" button text).
 * @param {string} [props.nextStepName] - (Optional) Name of the next step, used in "Next" button label.
 * @param {string} [props.skipStepName] - (Optional) Name of the current step, used in "Skip" button label.
 * @param {boolean} [props.canSave=true] - True if "Save Progress" should be enabled.
 * @param {boolean} [props.isLoading=false] - True if an operation is in progress (disables all buttons).
 * @param {boolean} [props.isNextDisabled=false] - True if the "Next" button should be disabled due to validation, etc.
 * @param {string} [props.nextButtonText] - (Optional) Custom text for the "Next" button. If not provided, defaults based on isLastStep and nextStepName.
 * @param {string} [props.finishButtonText="Finish & Review"] - (Optional) Text for the "Next" button on the last step.
 * @returns {JSX.Element} The StepNavigationButtons component.
 */
const StepNavigationButtons = ({
  onPrev,
  onNext,
  onSaveProgress,
  onSkip,
  isFirstStep = false,
  isLastStep = false,
  nextStepName,
  skipStepName,
  canSave = true,
  isLoading = false,
  isNextDisabled = false,
  nextButtonText,
  finishButtonText = "Finish & Review",
}) => {
  const getNextButtonText = () => {
    if (nextButtonText) return nextButtonText;
    if (isLastStep) return finishButtonText;
    return nextStepName ? `Next: ${nextStepName}` : 'Next';
  };

  return (
    <div className="flex flex-col sm:flex-row justify-between items-center mt-6 sm:mt-8 space-y-3 sm:space-y-0">
      {/* Previous Button */}
      <div>
        {!isFirstStep && (
          <button
            type="button"
            onClick={onPrev}
            disabled={isLoading}
            className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            aria-label="Go to previous step"
          >
            {isLoading && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
            <ChevronLeft className="h-5 w-5 mr-1 sm:mr-2" />
            Previous
          </button>
        )}
      </div>

      {/* Right-aligned Buttons: Save, Skip, Next */}
      <div className="flex flex-col sm:flex-row items-center space-y-3 sm:space-y-0 sm:space-x-2">
        {onSaveProgress && (
            <button
            type="button"
            onClick={onSaveProgress}
            disabled={isLoading || !canSave}
            className="w-full sm:w-auto px-4 py-2 border border-transparent text-sm font-medium rounded-md text-green-700 bg-green-100 hover:bg-green-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            aria-label="Save current progress"
            >
            {isLoading && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
            <Save className="h-5 w-5 mr-1 sm:mr-2" />
            Save Progress
            </button>
        )}

        {onSkip && skipStepName && (
          <button
            type="button"
            onClick={onSkip}
            disabled={isLoading}
            className="w-full sm:w-auto px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            aria-label={`Skip ${skipStepName} step`}
          >
            {isLoading && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
            <SkipForward className="h-5 w-5 mr-1 sm:mr-2" />
            Skip {skipStepName}
          </button>
        )}

        <button
          type="button"
          onClick={onNext}
          disabled={isLoading || isNextDisabled}
          className="w-full sm:w-auto px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          aria-label={isLastStep ? "Finish and review trip" : "Go to next step"}
        >
          {isLoading && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
          {getNextButtonText()}
          {!isLastStep && <ChevronRight className="h-5 w-5 ml-1 sm:ml-2" />}
        </button>
      </div>
    </div>
  );
};

export default StepNavigationButtons;
