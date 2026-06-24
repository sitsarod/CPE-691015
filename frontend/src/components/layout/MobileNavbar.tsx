import React from 'react';
import { ROLE_CONFIGS } from '../../constants/navigation';

interface MobileNavbarProps {
  role: 'student' | 'coach' | 'admin';
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
}

export default function MobileNavbar({
  role,
  mobileMenuOpen,
  setMobileMenuOpen,
}: MobileNavbarProps) {
  const config = ROLE_CONFIGS[role] || ROLE_CONFIGS.student;

  return (
    <div className="md:hidden flex items-center justify-between px-6 h-16 bg-white border-b border-slate-200 sticky top-0 z-30">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded bg-orange-primary flex items-center justify-center font-bold text-white">S</div>
        <span className="font-bold text-sm tracking-wider uppercase text-slate-800">{config.title}</span>
      </div>
      <button 
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        className="text-slate-500 hover:text-slate-800 focus:outline-none"
        aria-label="Toggle Menu"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          {mobileMenuOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>
    </div>
  );
}
