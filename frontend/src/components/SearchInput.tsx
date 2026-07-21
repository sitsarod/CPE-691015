import React from 'react';
import { Search } from 'lucide-react';

interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  containerClassName?: string;
}

export default function SearchInput({
  containerClassName = "",
  className = "",
  ...props
}: SearchInputProps) {
  return (
    <div className={`relative ${containerClassName}`}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
      <input
        type="text"
        {...props}
        className={`pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#CC0000] text-sm text-gray-900 bg-white ${className}`}
      />
    </div>
  );
}