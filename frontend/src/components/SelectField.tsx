import React from 'react';

interface SelectFieldProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  required?: boolean;
  containerClassName?: string;
  options: { label: string; value: string }[];
}

export default function SelectField({
  label,
  required,
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
        className={`w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-primary text-base bg-white text-gray-900 ${className}`}
      >
        <option value="">{`เลือก${label}ของคุณ`}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}