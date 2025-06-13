import React from 'react';

/**
 * A reusable input field component.
 *
 * @param {object} props - The component's props.
 * @param {string} props.label - The label for the input field.
 * @param {string} [props.type="text"] - The type of the input field (e.g., "text", "number", "email", "password", "date").
 * @param {string|number} props.value - The current value of the input field.
 * @param {function} props.onChange - The function to call when the input value changes.
 * @param {string} [props.placeholder] - The placeholder text for the input field.
 * @param {string} [props.error] - An error message to display below the input field.
 * @param {boolean} [props.disabled=false] - Whether the input field is disabled.
 * @param {string} [props.name] - The name attribute for the input field.
 * @param {string|number} [props.min] - The minimum value for number or date inputs.
 * @param {string|number} [props.max] - The maximum value for number or date inputs.
 * @param {string|number} [props.step] - The step attribute for number inputs.
 * @param {boolean} [props.required=false] - Whether the input field is required (displays a red asterisk).
 * @returns {JSX.Element} The InputField component.
 */
const InputField = ({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  error,
  disabled = false,
  name,
  min,
  max,
  step,
  required = false
}) => (
  <div>
    <label htmlFor={name || label.toLowerCase().replace(/\s+/g, '-')} className="block text-sm font-medium text-gray-700">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    <input
      id={name || label.toLowerCase().replace(/\s+/g, '-')}
      type={type}
      name={name}
      value={value || ''} // Ensure value is not undefined for controlled components
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      min={min}
      max={max}
      step={step}
      required={required} // HTML5 validation
      className={`mt-1 block w-full px-3 py-2 border ${
        error ? 'border-red-500' : 'border-gray-300'
      } rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100 disabled:cursor-not-allowed`}
    />
    {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
  </div>
);

export default InputField;
