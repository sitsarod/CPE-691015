"use client";

import React from 'react';

export default function EditSidebar() {
  return (
    <div className="w-80 border-r border-gray-200 p-6 hidden md:flex flex-col space-y-6 bg-white">
      <h2 className="text-2xl font-bold px-2">Settings</h2>
      
      <div className="flex flex-col space-y-1">
        <span className="text-xs font-bold text-gray-500 px-2 pb-2">How you use Instagram</span>
        
        <div className="flex items-center gap-3 px-3 py-3 bg-gray-50 rounded-xl font-bold text-sm cursor-pointer text-gray-900">
          <span className="text-base">👤</span>
          <span>Edit profile</span>
        </div>
        
        <div className="flex items-center gap-3 px-3 py-3 hover:bg-gray-50 rounded-xl font-medium text-sm text-gray-500 cursor-pointer transition-colors">
          <span className="text-base">🔔</span>
          <span>Notifications</span>
        </div>
      </div>
    </div>
  );
}