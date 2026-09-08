"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { MessageSquareText, Settings, User, LogOut, LayoutDashboard, Clock } from "lucide-react";
import NotificationBell, { NOTIFICATION_STREAM_EVENT } from "@/components/NotificationBell";
import { autoQaAPI } from "@/services/autoQaAPI";
import { ChatSession } from "@/types/autoQa";
import { useVisibleInterval } from "@/hooks/useVisibleInterval";

// ยิง event นี้เมื่อแอดมินเปิดดูห้องแชทหนึ่ง ๆ แล้ว (จากหน้า /admin/chat-sessions)
// เพื่อให้ badge ที่ปุ่ม "สอบถาม" อัปเดตจำนวนที่ยังไม่อ่านทันทีโดยไม่ต้องรอรอบ poll ถัดไป
export const ADMIN_CHAT_VIEWED_EVENT = "koyama:admin-chat-viewed";

// คีย์ localStorage เก็บเวลาที่แอดมิน "เปิดดู" ห้องแชทแต่ละห้องล่าสุด
export const adminChatLastViewedKey = (sessionId: number) => `admin_chat_last_viewed_${sessionId}`;

// ถ้าข้อความล่าสุดของลูกค้ายังไม่ถูกตอบนานเกินนี้ (ในห้องที่ยังเปิดอยู่) ถือว่า "รอนาน" ต้องรีบตอบ
export const URGENT_WAIT_MS = 5 * 60 * 1000; // 5 นาที

export interface AdminChatNotificationItem {
  id: number;
  guestName: string;
  preview: string;
  latestAt: string;
  waitingMs: number;
  isUrgent: boolean;
}

// สร้างรายการแจ้งเตือน "ใครทักมา" — เฉพาะห้องที่มีข้อความใหม่ของลูกค้าที่แอดมินยังไม่ได้เปิดดู
// เรียงห้องที่รอนาน (isUrgent) ไว้บนสุด แล้วตามด้วยข้อความใหม่ล่าสุดก่อน
function computeAdminNotifications(sessions: ChatSession[]): AdminChatNotificationItem[] {
  if (typeof window === "undefined") return [];
  const items: AdminChatNotificationItem[] = [];
  for (const s of sessions) {
    const qas = s.auto_qas || [];
    if (qas.length === 0) continue;
    const latest = qas.reduce((a, b) => (new Date(a.created_at).getTime() > new Date(b.created_at).getTime() ? a : b));
    if (latest.mode === "admin_reply") continue; // ข้อความล่าสุดเป็นของแอดมินเองอยู่แล้ว ไม่นับ
    const lastViewedRaw = localStorage.getItem(adminChatLastViewedKey(s.id));
    const lastViewed = lastViewedRaw ? Number(lastViewedRaw) : 0;
    const latestTime = new Date(latest.created_at).getTime();
    if (latestTime <= lastViewed) continue;
    const waitingMs = s.status === "active" ? Date.now() - latestTime : 0;
    items.push({
      id: s.id,
      guestName: s.guest_name?.trim() || "ผู้เยี่ยมชม",
      preview: latest.question?.trim() || (latest.attachment_url ? "[ไฟล์แนบ]" : ""),
      latestAt: latest.created_at,
      waitingMs,
      isUrgent: s.status === "active" && waitingMs >= URGENT_WAIT_MS,
    });
  }
  items.sort((a, b) => {
    if (a.isUrgent !== b.isUrgent) return a.isUrgent ? -1 : 1;
    return new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime();
  });
  return items;
}

// นับจำนวนห้องแชทที่มีข้อความล่าสุดเป็นของลูกค้า (ไม่ใช่ admin_reply) และใหม่กว่าครั้งล่าสุดที่แอดมินเปิดดู
function computeAdminUnreadCount(sessions: ChatSession[]): number {
  return computeAdminNotifications(sessions).length;
}

// แปลงเวลาที่รอเป็นข้อความอ่านง่าย เช่น "รอ 12 นาที", "รอ 2 ชม."
export function formatWaitElapsed(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "เพิ่งทัก";
  if (minutes < 60) return `รอ ${minutes} นาที`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `รอ ${hours} ชม.`;
  const days = Math.floor(hours / 24);
  return `รอ ${days} วัน`;
}

export default function CustomerTopbar() {
  const router = useRouter();

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<AdminChatNotificationItem[]>([]);
  const [isChatDropdownOpen, setIsChatDropdownOpen] = useState(false);
  const chatDropdownRef = useRef<HTMLDivElement>(null);

  const loadUnreadCount = useCallback(async () => {
    try {
      const sessions = await autoQaAPI.getAllChatSessions();
      const items = computeAdminNotifications(Array.isArray(sessions) ? sessions : []);
      setNotifications(items);
      setUnreadCount(items.length);
    } catch (err) {
      console.error("Failed to load chat unread count", err);
    }
  }, []);

  // โหลดตอน mount, รีเฟรชทันทีเมื่อแอดมินเปิดดูห้องแชท/กลับมาโฟกัสแท็บ,
  // และรีเฟรชทันทีเมื่อมีข้อความลูกค้าเข้ามาจริงๆ (สัญญาณ SSE จาก NotificationBell — ดู
  // NotifyAdmins ฝั่ง backend ที่ยิงตอนลูกค้าส่งข้อความใหม่) แทนที่จะต้องรอ poll ตามรอบ
  useEffect(() => {
    loadUnreadCount();
    window.addEventListener(ADMIN_CHAT_VIEWED_EVENT, loadUnreadCount);
    window.addEventListener("focus", loadUnreadCount);
    window.addEventListener(NOTIFICATION_STREAM_EVENT, loadUnreadCount);
    return () => {
      window.removeEventListener(ADMIN_CHAT_VIEWED_EVENT, loadUnreadCount);
      window.removeEventListener("focus", loadUnreadCount);
      window.removeEventListener(NOTIFICATION_STREAM_EVENT, loadUnreadCount);
    };
  }, [loadUnreadCount]);

  // poll สำรองทุก 2 นาที เผื่อ SSE หลุดชั่วคราว (ตัวหลักคือ event ด้านบนซึ่งเกิดทันทีที่มีข้อความจริง)
  // ยังคงหยุดโดยอัตโนมัติเมื่อแอดมินย่อ/สลับแท็บออกไป ไม่ยิง request ตอนไม่มีใครดูอยู่
  useVisibleInterval(loadUnreadCount, 120000);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsSettingsOpen(false);
      }
      if (chatDropdownRef.current && !chatDropdownRef.current.contains(event.target as Node)) {
        setIsChatDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const urgentCount = notifications.filter((n) => n.isUrgent).length;

  const goToSession = (sessionId: number) => {
    setIsChatDropdownOpen(false);
    router.push(`/admin/chat-sessions?session=${sessionId}`);
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("user_id");
    localStorage.removeItem("user_name");
    localStorage.removeItem("user_email");

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

        {/* ปุ่ม "จัดการแชท" */}
        <div className="relative" ref={chatDropdownRef}>
          <button
            onClick={() => setIsChatDropdownOpen((v) => !v)}
            className={`flex items-center gap-3 transition font-bold text-[16px] ${isChatDropdownOpen ? "text-red-600" : "text-gray-700 hover:text-red-600"}`}
          >
            <span className="relative inline-flex">
              <MessageSquareText className="w-7 h-7 text-[#CC0000]" />
              {unreadCount > 0 && (
                <span
                  className={`absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full text-white text-[10px] font-bold leading-none border-2 border-white ${
                    urgentCount > 0 ? "bg-orange-500 animate-pulse" : "bg-[#CC0000]"
                  }`}
                >
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </span>
            <span className="hidden md:inline">จัดการแชท</span>
          </button>

          {isChatDropdownOpen && (
            <div className="absolute right-0 mt-6 w-80 bg-white border border-gray-200 rounded-xl shadow-lg py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="px-4 py-2 flex items-center justify-between border-b border-gray-100 mb-1">
                <span className="font-bold text-gray-800 text-sm">ข้อความจากลูกค้า</span>
                {urgentCount > 0 && (
                  <span className="text-[11px] font-semibold text-orange-600 flex items-center gap-1">
                    <Clock size={12} /> รอนาน {urgentCount} ห้อง
                  </span>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-gray-400">ไม่มีข้อความใหม่</p>
                ) : (
                  notifications.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => goToSession(n.id)}
                      className="w-full text-left px-4 py-2.5 hover:bg-[#FFF0F0] transition-colors flex flex-col gap-0.5"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-gray-900 text-sm truncate">{n.guestName}</span>
                        {n.isUrgent && (
                          <span className="text-[10px] font-semibold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-full flex items-center gap-1 flex-shrink-0">
                            <Clock size={10} /> {formatWaitElapsed(n.waitingMs)}
                          </span>
                        )}
                      </span>
                      {n.preview && (
                        <span className="text-xs text-gray-500 truncate">{n.preview}</span>
                      )}
                    </button>
                  ))
                )}
              </div>
              <div className="border-t border-gray-100 mt-1 pt-1">
                <button
                  onClick={() => { setIsChatDropdownOpen(false); router.push("/admin/chat-sessions"); }}
                  className="w-full text-center px-4 py-2 text-sm font-medium text-[#CC0000] hover:bg-[#FFF0F0] transition-colors"
                >
                  ดูการสนทนาทั้งหมด
                </button>
              </div>
            </div>
          )}
        </div>

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