"use client";

import React, { useEffect, useState } from 'react';
import Button from '@/components/Button';

export default function ProfilePage() {
  const [firstName, setFirstName] = useState<string>("นักเรียน");
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'posts' |  'tagged'>('posts');

  useEffect(() => {
    const savedName = localStorage.getItem("firstName");
    const savedEmail = localStorage.getItem("email");

    if (savedName) setFirstName(savedName);

    if (savedEmail) {
      const qrValue = `QR_${savedEmail}`;
      const generatedUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrValue)}`;
      setQrCodeUrl(generatedUrl);
    } else {
      setQrCodeUrl(null);
    }
  }, []);

  return (
    <div className="w-full min-h-[calc(100vh-96px)] bg-gray-50 flex items-center justify-center p-4 md:p-8">
      
      <div className="bg-white w-full max-w-5xl p-10 md:p-16 rounded-3xl shadow-sm text-left">

        {/* Profile Section สไตล์ IG */}
        <div className="flex flex-col mb-6">
          
          {/* ข้อมูลภาพโปรไฟล์ + ตัวหนังสือ */}
          <div className="flex flex-row items-center gap-8 md:gap-14">
            <div className="relative flex-shrink-0">
              <div className="w-28 h-28 md:w-36 md:h-36 rounded-full border-4 border-gray-100 overflow-hidden bg-gray-100 shadow-xs">
                <img 
                  src="/slide3.jpg" 
                  alt="User Avatar" 
                  className="w-full h-full object-cover" 
                />
              </div>
            </div>

            <div className="flex flex-col space-y-4 w-full">
              <div className="flex items-center gap-2">
                <h2 className="text-2xl md:text-4xl font-black text-gray-900 tracking-tight">{firstName}</h2>
              </div>
              
              <div className="flex flex-row items-center gap-6 text-sm md:text-lg text-gray-600 font-medium">
                <span><strong className="text-gray-900 font-bold">0</strong> posts</span>
                <span><strong className="text-gray-900 font-bold">182</strong> followers</span>
              </div>
            </div>
          </div>

          {/* ปุ่ม Edit profile / View QR Code */}
          <div className="flex flex-row gap-4 w-full mt-8">
            <Button 
              variant="outline" 
              type="button" 
              onClick={() => window.location.href = '/customer/settings/profile'}
              className="flex-1 md:flex-initial py-3 text-sm md:text-base bg-gray-50 hover:bg-gray-100 border border-gray-200"
            >
              Edit profile
            </Button>

            <Button 
              variant="outline" 
              type="button"
              onClick={() =>window.location.href = '/customer/profile/viewQR'}
              className="flex-1 md:flex-initial py-3 text-sm md:text-base bg-gray-50 hover:bg-gray-100 border border-gray-200"
            >
              View QR Code
            </Button>
          </div>

        </div>

        {/* แถบจัด Tab Menu สไตล์ IG สลับสถานะไฮไลต์เส้นบนอัตโนมัติ */}
        <div className="w-full border-t border-gray-200 flex justify-center gap-12 md:gap-16 text-gray-400">
          
          {/* Tab 1: Posts */}
          <button 
            type="button" 
            onClick={() => setActiveTab('posts')}
            className={`flex items-center gap-2 py-3 border-t-2 text-xs md:text-sm tracking-widest uppercase -mt-[2px] cursor-pointer transition-all ${
              activeTab === 'posts' ? 'border-gray-900 text-gray-900 font-bold' : 'border-transparent text-gray-400 font-semibold hover:text-gray-600'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
            </svg>
            Posts
          </button>

          <button 
            type="button" 
            onClick={() => setActiveTab('tagged')}
            className={`flex items-center gap-2 py-3 border-t-2 text-xs md:text-sm tracking-widest uppercase -mt-[2px] cursor-pointer transition-all ${
              activeTab === 'tagged' ? 'border-gray-900 text-gray-900 font-bold' : 'border-transparent text-gray-400 font-semibold hover:text-gray-600'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            </svg>
            Evaluation
          </button>
        </div>
        
      </div>
    </div>
  );
}