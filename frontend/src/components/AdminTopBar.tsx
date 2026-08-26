"use client";

import { clearSession } from "@/services/session";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { MessageSquareText, Settings, User, LogOut, LayoutDashboard } from "lucide-react";
import NotificationBell from "@/components/NotificationBell";

export default function CustomerTopbar() {
  const router = useRouter();

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsSettingsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => {
    // ⚠️ ห้ามลบคีย์ทีละตัวตรงนี้ ให้เพิ่มที่ services/session.ts แทน
    //
    // เดิมสามหน้าลบกันคนละชุดและผิดกันทั้งสาม: สองหน้าลบ "user_name" กับ
    // "user_email" ซึ่งเป็นคีย์ที่ระบบไม่เคยเขียนเลย (ของจริงคือ firstName /
    // lastName / email) จึงเหลือชื่อกับอีเมลค้างในเครื่องหลังออกจากระบบ
    //
    // และไม่มีหน้าไหนลบ refresh_token เลยสักหน้า ซึ่งอันตรายที่สุด
    // เพราะ token ตัวนั้นอายุ 7 วันและใช้ขอสิทธิ์เข้าระบบใหม่ได้
    clearSession();

    router.push("/");
    
    router.refresh(); 
  };

  return (
    <header className="fixed top-0 left-0 w-full h-24 bg-white flex items-center justify-between px-8 border-b border-gray-200 z-50">
      
      <Link href="/customer/dashboard" className="flex items-center">
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
        
        <NotificationBell viewAllHref="/admin/notifications" />

        {/* ปุ่ม "สอบถาม" เปิดหน้าจัดการแชท (Chat Sessions) — ย้ายมาจากเมนู sidebar เดิม */}
        <button
          onClick={() => router.push("/admin/chat-sessions")}
          className="flex items-center gap-3 text-gray-700 hover:text-red-600 transition font-bold text-[16px]"
        >
          <MessageSquareText className="w-7 h-7 text-[#CC0000]" />
          <span className="hidden md:inline">จัดการแชท</span>
        </button>

        <div className="relative" ref={dropdownRef}>
          <button 
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            className={`flex items-center gap-3 transition font-bold text-[16px] ${isSettingsOpen ? "text-red-600" : "text-gray-700 hover:text-red-600"}`}
          >
            <Settings className="w-7 h-7 text-[#CC0000]" />
            <span className="hidden md:inline">ตั้งค่า</span>
          </button>

          {isSettingsOpen && (
            <div className="absolute right-0 mt-6 w-48 bg-white border border-gray-200 rounded-xl shadow-lg py-2 flex flex-col z-50 animate-in fade-in slide-in-from-top-2 duration-200">
              
              <Link
                href="/admin/settings"
                onClick={() => setIsSettingsOpen(false)}
                className="px-4 py-2.5 text-gray-700 hover:bg-[#FFF0F0] hover:text-[#CC0000] flex items-center gap-3 transition-colors font-medium"
              >
                <LayoutDashboard className="w-5 h-5" />
                ตั้งค่าหน้าแรก
              </Link>

              <Link
                href="/admin/profile"
                onClick={() => setIsSettingsOpen(false)}
                className="px-4 py-2.5 text-gray-700 hover:bg-[#FFF0F0] hover:text-[#CC0000] flex items-center gap-3 transition-colors font-medium"
              >
                <User className="w-5 h-5" />
                ตั้งค่าโปรไฟล์
              </Link>

              <hr className="my-1 border-gray-100" />
              
              <button
                onClick={handleLogout}
                className="px-4 py-2.5 text-red-600 hover:bg-[#FFF0F0] flex items-center gap-3 transition-colors w-full text-left font-bold"
              >
                <LogOut className="w-5 h-5" />
                ออกจากระบบ
              </button>
            </div>
          )}
        </div>

      </div>
    </header>
  );
}