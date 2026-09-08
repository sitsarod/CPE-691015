"use client";

import { clearSession } from "@/services/session";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { MessageCircleMore, Settings, User, LogOut, ShieldCheck, ScanFace } from "lucide-react";
import NotificationBell, { NOTIFICATION_STREAM_EVENT } from "@/components/NotificationBell";
import { OPEN_CHAT_EVENT, chatOwner, chatSessionKey, chatLastViewedKey } from "@/components/ChatWidget";
import { autoQaAPI } from "@/services/autoQaAPI";
import { useVisibleInterval } from "@/hooks/useVisibleInterval";

export default function CustomerTopbar() {
  const router = useRouter();

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // จำนวนข้อความตอบกลับใหม่จากแอดมินที่ยังไม่ได้เปิดดู (badge สีแดงบนปุ่ม "สอบถาม")
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsSettingsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // เช็คข้อความตอบกลับใหม่จากแอดมิน (เทียบกับเวลาที่เปิดกล่องแชทครั้งล่าสุด)
  // ไม่ยิง request เลยถ้ายังไม่เคยเริ่มแชท (ไม่มี session ใน localStorage)
  const checkUnread = useCallback(async () => {
    try {
      const owner = chatOwner();
      const sessionId = localStorage.getItem(chatSessionKey(owner));
      if (!sessionId) {
        setUnreadCount(0);
        return;
      }
      const lastViewedRaw = localStorage.getItem(chatLastViewedKey(owner));
      const lastViewed = lastViewedRaw ? new Date(lastViewedRaw).getTime() : 0;

      const session = await autoQaAPI.getChatSessionById(Number(sessionId));
      const count = (session.auto_qas || []).filter(
        (qa) => qa.mode === "admin_reply" && new Date(qa.created_at).getTime() > lastViewed
      ).length;
      setUnreadCount(count);
    } catch {
      // เงียบไว้ — ไม่ให้ error กระทบ topbar หลัก
    }
  }, []);

  // โหลดตอน mount และรีเฟรชทันทีเมื่อแอดมินตอบกลับจริง (สัญญาณ SSE จาก NotificationBell — ดู
  // CreateNotification ฝั่ง backend ใน AdminReply) แทนการรอ poll ตามรอบ
  useEffect(() => {
    checkUnread();
    window.addEventListener(NOTIFICATION_STREAM_EVENT, checkUnread);
    return () => window.removeEventListener(NOTIFICATION_STREAM_EVENT, checkUnread);
  }, [checkUnread]);

  // poll สำรองทุก 60 วิ เผื่อ SSE หลุดชั่วคราว หรือเพิ่งเริ่มแชทแบบผู้เยี่ยมชม (ไม่มี SSE เพราะไม่ได้ล็อกอิน)
  // หยุดอัตโนมัติเมื่อผู้ใช้ย่อ/สลับแท็บออกไป — เดิมยิงทุก 10 วิไม่หยุดแม้ไม่ได้ใช้งาน
  useVisibleInterval(checkUnread, 60000);

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
        
        <NotificationBell viewAllHref="/customer/notifications" />

        {/* ปุ่ม "สอบถาม" เปิดกล่องแชทของลูกค้า (ChatWidget) ผ่าน event กลาง */}
        <button
          onClick={() => {
            setUnreadCount(0);
            window.dispatchEvent(new CustomEvent(OPEN_CHAT_EVENT));
          }}
          className="relative flex items-center gap-3 text-gray-700 hover:text-red-600 transition font-bold text-[16px]"
        >
          <span className="relative inline-flex">
            <MessageCircleMore className="w-7 h-7 text-[#CC0000]" />
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-[#CC0000] border border-white text-white text-[10px] font-bold leading-none">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </span>
          <span className="hidden md:inline">สอบถาม</span>
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
                href="/customer/profile"
                onClick={() => setIsSettingsOpen(false)}
                className="px-4 py-2.5 text-gray-700 hover:bg-[#FFF0F0] hover:text-[#CC0000] flex items-center gap-3 transition-colors font-medium"
              >
                <User className="w-5 h-5" />
                ตั้งค่าโปรไฟล์
              </Link>

              <Link
                href="/customer/settings/privacy"
                onClick={() => setIsSettingsOpen(false)}
                className="px-4 py-2.5 text-gray-700 hover:bg-[#FFF0F0] hover:text-[#CC0000] flex items-center gap-3 transition-colors font-medium"
              >
                <ShieldCheck className="w-5 h-5" />
                ความเป็นส่วนตัว
              </Link>

              <Link
                href="/customer/settings/face"
                onClick={() => setIsSettingsOpen(false)}
                className="px-4 py-2.5 text-gray-700 hover:bg-[#FFF0F0] hover:text-[#CC0000] flex items-center gap-3 transition-colors font-medium"
              >
                <ScanFace className="w-5 h-5" />
                ลงทะเบียนใบหน้า
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