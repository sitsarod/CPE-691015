import React from "react";
import Link from "next/link";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline";
  href?: string;
  children: React.ReactNode;
}

export default function Button({ 
  variant = "primary", 
  href, 
  children, 
  className = "", 
  ...props 
}: ButtonProps) {
  
  const baseStyle = "inline-flex items-center justify-center px-6 py-2.5 rounded-full font-bold text-sm transition-all";
  
  const variants = {
    primary: "bg-green-600 hover:bg-green-700 text-white shadow-md shadow-green-600/30",
    secondary: "bg-orange-500 hover:bg-orange-600 text-white shadow-md shadow-orange-500/30",
    outline: "border-2 border-slate-200 text-slate-700 hover:bg-slate-50",
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