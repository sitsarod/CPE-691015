import React from 'react';

interface InputFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  required?: boolean;
  error?: string;
  containerClassName?: string;
}

export default function InputField({
  label,
  required = false,
  error,
  containerClassName = "",
  className = "",
  ...props
}: InputFieldProps) {
  return (
    <div className={`w-full flex flex-col space-y-1.5 ${containerClassName}`}>
      <label className="text-sm font-semibold text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        {...props}
        required={required}
        className={`w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-primary text-base bg-white text-gray-900 disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed ${className}`}
      />
      {error && <span className="text-xs text-red-500 font-medium">{error}</span>}
    </div>
  );
}