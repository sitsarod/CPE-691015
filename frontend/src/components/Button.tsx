import React from "react";
import Link from "next/link";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline";
  href?: string;
  children: React.ReactNode;
  className?: string;
}

export default function Button({ 
  variant = "primary", 
  href, 
  children, 
  className = "", 
  
  ...props 
}: ButtonProps) {
  
  const baseStyle = "inline-flex items-center justify-center w-full py-2.5 min-w-[140px] rounded-lg font-bold text-sm transition-all text-center";
  const baseStyle = "inline-flex items-center justify-center w-full py-2.5 min-w-[140px] rounded-lg font-bold text-sm transition-all text-center";
  
  const variants = {
    primary: "bg-red-500 hover:bg-red-700 text-white shadow-md shadow-red-600/30",
    secondary: "bg-white border-2 border-[#CC0000] text-[#CC0000] font-black hover:bg-[#CC0000] hover:text-white transition-colors duration-300",
    outline: "border-1 border-slate-200 text-slate-700 hover:bg-slate-50",
  };

  const combinedClassName = `${baseStyle} ${variants[variant]} ${className}`;

  if (href) {
    return (
      <Link href={href} className={combinedClassName}>
        {children}
      </Link>
    );
  }

  return (
    <button className={combinedClassName} {...props}>
      {children}
    </button>
  );
}