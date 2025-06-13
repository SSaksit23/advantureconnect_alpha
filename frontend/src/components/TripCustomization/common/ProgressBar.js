import React from 'react';

/**
 * A progress bar component for multi-step flows.
 * Displays the current step and allows navigation by clicking on steps.
 *
 * @param {object} props - The component's props.
 * @param {Array<object>} props.steps - An array of step objects. Each object should have:
 *   - `id` (number|string): A unique identifier for the step.
 *   - `name` (string): The display name of the step.
 *   - `icon` (JSX.Element): A React component to be used as the icon for the step.
 * @param {number|string} props.currentStepId - The ID of the currently active step.
 * @param {function} props.onStepClick - A callback function that is invoked when a step is clicked.
 *                                       It receives the `stepId` as an argument. The parent component
 *                                       is responsible for handling navigation logic (e.g., allowing/disallowing jumps).
 * @returns {JSX.Element} The ProgressBar component.
 */
const ProgressBar = ({ steps = [], currentStepId, onStepClick }) => {
  if (!steps || steps.length === 0) {
    return null; // Don't render if no steps are provided
  }

  const currentStepIndex = steps.findIndex(step => step.id === currentStepId);
  const progressPercentage = currentStepIndex >= 0 ? ((currentStepIndex + 1) / steps.length) * 100 : 0;

  return (
    <div className="mb-8 w-full"> {/* Removed max-w-2xl mx-auto to allow parent control */}
      <div className="flex justify-between mb-2 text-xs sm:text-sm">
        {steps.map(step => {
          const isCompleted = currentStepIndex > steps.findIndex(s => s.id === step.id);
          const isCurrent = step.id === currentStepId;
          
          let textColor = 'text-gray-400 hover:text-gray-600';
          if (isCurrent) {
            textColor = 'text-blue-700 font-bold';
          } else if (isCompleted) {
            textColor = 'text-blue-600 font-semibold';
          }

          const iconSizeClass = isCurrent ? 'h-6 w-6' : 'h-5 w-5';

          return (
            <button
              type="button"
              key={step.id}
              className={`flex-1 text-center cursor-pointer transition-all duration-300 ease-in-out focus:outline-none group ${textColor}`}
              onClick={() => onStepClick(step.id)}
              aria-current={isCurrent ? 'step' : undefined}
              aria-label={`Go to step ${step.name}`}
            >
              <div className={`mx-auto transition-transform duration-300 ${isCurrent ? 'transform scale-110' : 'group-hover:scale-105'}`}>
                {React.cloneElement(step.icon, {
                  className: `${iconSizeClass} mx-auto ${isCurrent ? 'text-blue-700' : isCompleted ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-600'}`,
                })}
              </div>
              <span className={`block mt-1 text-xs ${isCurrent ? 'font-bold' : 'font-medium'}`}>{step.name}</span>
            </button>
          );
        })}
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
        <div
          className="bg-blue-600 h-2.5 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progressPercentage}%` }}
          aria-valuenow={progressPercentage}
          aria-valuemin="0"
          aria-valuemax="100"
          role="progressbar"
          aria-label="Trip customization progress"
        ></div>
      </div>
    </div>
  );
};

export default ProgressBar;
