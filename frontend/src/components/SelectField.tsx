import React from 'react';

interface SelectFieldProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  required?: boolean;
  error?: string;
  containerClassName?: string;
  options: { label: string; value: string }[];
}

export default function SelectField({
  label,
  required = false,
  error, 
  containerClassName = "",
  options,
  className = "",
  ...props
}: SelectFieldProps) {
  return (
    <div className={`w-full flex flex-col space-y-1.5 ${containerClassName}`}>
      <label className="text-sm font-semibold text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>

      <select
        {...props}
        required={required}
        className={`w-full px-4 py-3 border rounded-xl text-base bg-white text-gray-900 transition-colors focus:outline-none 
          ${
            error 
              ? "border-red-500 focus:border-red-500" 
              : "border-gray-200 focus:border-orange-primary"
          } 
          disabled:bg-gray-100 disabled:text-gray-500 disabled:border-gray-200 disabled:cursor-not-allowed ${className}`}
      >
        <option value="">{`เลือก${label}ของคุณ`}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {error && <span className="text-xs text-red-500 font-medium">{error}</span>}
    </div>
  );
}