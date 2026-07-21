"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Bell, Settings, User, LogOut } from "lucide-react";

export default function CoachTopbar() {
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
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("user_id");
    localStorage.removeItem("firstName");
    localStorage.removeItem("lastName");
    localStorage.removeItem("email");

    router.push("/");
    router.refresh();
  };

  return (
    <header className="fixed top-0 left-0 w-full h-24 bg-white flex items-center justify-between px-8 border-b border-gray-200 z-50">

      <Link href="/coach/dashboard" className="flex items-center">
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
                href="/coach/profile"
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
