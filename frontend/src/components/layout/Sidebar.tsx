import React from 'react';
import Icons from '../ui/Icons';
import { ROLE_CONFIGS } from '../../constants/navigation';

interface SidebarProps {
  role: 'student' | 'coach' | 'admin';
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
}

export default function Sidebar({
  role,
  currentTab,
  setCurrentTab,
  mobileMenuOpen,
  setMobileMenuOpen,
}: SidebarProps) {
  const config = ROLE_CONFIGS[role] || ROLE_CONFIGS.student;

  return (
    <aside className={`w-full md:w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 md:sticky md:top-0 md:h-screen z-20 transition-all ${
      mobileMenuOpen ? 'block' : 'hidden md:flex'
    }`}>
      {/* Brand Header */}
      <div className="p-6 border-b border-slate-200 hidden md:flex items-center gap-2">
        <div className="w-10 h-10 rounded-lg bg-orange-primary flex items-center justify-center font-bold text-white text-xl shadow-sm shadow-orange-primary/10">S</div>
        <div>
          <h1 className="font-bold text-sm text-slate-800 tracking-wider uppercase">SMASH ACADEMY</h1>
          <p className="text-[10px] text-green-accent font-bold uppercase">{config.title}</p>
        </div>
      </div>

      {/* User Card */}
      <div className="p-6 border-b border-slate-100 flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-2xl">
          {config.user.avatar}
        </div>
        <div className="overflow-hidden">
          <h2 className="font-bold text-sm text-slate-800 truncate">{config.user.name}</h2>
          <p className="text-xs text-slate-500 truncate">{config.user.email}</p>
        </div>
      </div>

      {/* Menu Items */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {config.menu.map((item) => {
          const IconComponent = Icons[item.iconName] || Icons.Home;
          return (
            <button
              key={item.id}
              onClick={() => {
                setCurrentTab(item.id);
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold transition-all cursor-pointer ${
                currentTab === item.id
                  ? 'bg-orange-primary text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <IconComponent className="w-5 h-5" />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Sidebar Footer / Log out */}
      <div className="p-4 border-t border-slate-150">
        <button 
          onClick={() => window.location.href = '/'}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold text-rose-500 hover:bg-rose-50 hover:text-rose-600 transition-all cursor-pointer"
        >
          <Icons.Logout className="w-5 h-5" />
          ออกจากระบบ (Log Out)
        </button>
      </div>
    </aside>
  );
}
