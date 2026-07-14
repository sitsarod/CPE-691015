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
  
  const baseStyle = "inline-flex items-center justify-center w-full py-2.5 min-w-[140px] rounded-full font-bold text-sm transition-all text-center";
  
  const variants = {
    primary: "bg-green-500 hover:bg-green-700 text-white shadow-md shadow-green-600/30",
    secondary: "bg-orange-500 hover:bg-orange-600 text-white shadow-md shadow-orange-500/30",
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