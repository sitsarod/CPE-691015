"use client";

import Link from "next/link";
import Image from "next/image";
import { Bell, MessageSquareText, Settings } from "lucide-react";

export default function CustomerTopbar() {
  return (
    <header className="fixed top-0 left-0 w-full h-24 bg-white flex items-center justify-between px-8 border-b border-gray-200 z-50">
      
      <Link href="/customer" className="flex items-center">
        <Image
          src="/logo.png"
          alt="Koyama"
          width={180}
          height={50}
          className="object-contain"
          priority
        />
      </Link>

      <div className="flex items-center gap-8">
        
        <button className="text-[#CC0000] hover:opacity-80 transition relative flex items-center justify-center w-10 h-10">
          <Bell className="w-7 h-7" />
          <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-600 rounded-full border-2 border-white"></span>
        </button>

        <button className="flex items-center gap-3 text-gray-700 hover:text-red-600 transition font-bold text-[16px]">
          <MessageSquareText className="w-7 h-7 text-[#CC0000]" />
          <span className="hidden md:inline">สอบถาม</span>
        </button>

        <button className="flex items-center gap-3 text-gray-700 hover:text-red-600 transition font-bold text-[16px]">
          <Settings className="w-7 h-7 text-[#CC0000]" />
          <span className="hidden md:inline">ตั้งค่า</span>
        </button>

      </div>
    </header>
  );
}