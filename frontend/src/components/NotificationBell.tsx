"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, X, History } from "lucide-react";
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type NotificationDTO,
} from "@/services/notificationAPI";

// ยิง event นี้ทุกครั้งที่ SSE stream ของ Notification ทั่วไปส่งสัญญาณ "มีแจ้งเตือนใหม่" มา
// ให้ badge อื่นๆ ในหน้าเว็บ (เช่น badge ห้องแชท "สอบถาม" ของแอดมิน) อาศัย event นี้รีเฟรชตัวเอง
// แทนการเปิด SSE connection ซ้ำซ้อน หรือ poll เซิร์ฟเวอร์เป็นระยะด้วยตัวเอง
export const NOTIFICATION_STREAM_EVENT = "koyama:notification-stream";

const TONE_DOT: Record<string, string> = {
  danger: "bg-rose-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
  success: "bg-emerald-500",
};

const timeAgo = (iso: string): string => {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "";
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "เมื่อสักครู่";
  if (m < 60) return `${m} นาทีที่แล้ว`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ชม.ที่แล้ว`;
  const d = Math.floor(h / 24);
  return `${d} วันที่แล้ว`;
};

export default function NotificationBell({
  viewAllHref,
}: {
  /** ลิงก์หน้าประวัติเต็มตาม role เช่น "/admin/notifications" */
  viewAllHref: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<NotificationDTO[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const { data, unread } = await fetchNotifications(token);
      setNotifs(data);
      setUnread(unread);
    } catch {
      /* เงียบไว้ ไม่รบกวนผู้ใช้ */
    }
  }, []);

  // โหลดครั้งแรก + รีเฟรชเมื่อกลับมาโฟกัสหน้าต่าง (throttle 15 วิ)
  useEffect(() => {
    let lastFetch = 0;
    const THROTTLE = 15_000;
    const maybe = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastFetch < THROTTLE) return;
      lastFetch = Date.now();
      refresh();
    };
    lastFetch = Date.now();
    refresh();
    window.addEventListener("focus", maybe);
    document.addEventListener("visibilitychange", maybe);
    return () => {
      window.removeEventListener("focus", maybe);
      document.removeEventListener("visibilitychange", maybe);
    };
  }, [refresh]);

  // SSE: รับสัญญาณเรียลไทม์ "มีแจ้งเตือนใหม่" แล้วโหลดข้อมูลทันที (ไม่ต้องรอ refetch)
  // มี reconnect เอง เผื่อ access token หมดอายุ (EventSource ไม่ reconnect ให้กรณี HTTP error)
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL;
    if (!base) return;
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = () => {
      const token = localStorage.getItem("token");
      if (!token || closed) return;
      es = new EventSource(`${base}/notifications/stream?token=${encodeURIComponent(token)}`);
      es.addEventListener("notify", () => {
        refresh();
        window.dispatchEvent(new Event(NOTIFICATION_STREAM_EVENT));
      });
      es.onerror = () => {
        es?.close();
        if (closed) return;
        if (retry) clearTimeout(retry);
        retry = setTimeout(connect, 5000); // เชื่อมใหม่ด้วย token ล่าสุด
      };
    };
    connect();

    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      es?.close();
    };
  }, [refresh]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const markRead = (n: NotificationDTO) => {
    if (n.read) return;
    setNotifs((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    setUnread((u) => Math.max(0, u - 1));
    const token = localStorage.getItem("token");
    if (token) markNotificationRead(n.id, token).catch(() => refresh());
  };

  const markAll = () => {
    setNotifs((prev) => prev.map((x) => ({ ...x, read: true })));
    setUnread(0);
    const token = localStorage.getItem("token");
    if (token) markAllNotificationsRead(token).catch(() => refresh());
  };

  const openItem = (n: NotificationDTO) => {
    markRead(n);
    setOpen(false);
    if (n.href) router.push(n.href);
  };

  const recent = notifs.slice(0, 8);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="การแจ้งเตือน"
        className="text-[#CC0000] hover:opacity-80 transition relative flex items-center justify-center w-10 h-10"
      >
        <Bell className="w-7 h-7" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-600 text-white text-[10px] font-bold rounded-full border-2 border-white flex items-center justify-center leading-none tabular-nums">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-4 top-16 w-auto sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-4 sm:w-[340px] sm:max-w-[calc(100vw-2rem)] bg-white border border-gray-200 rounded-2xl shadow-xl z-50 animate-in fade-in slide-in-from-top-2 duration-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="font-bold text-gray-900">การแจ้งเตือน</span>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button
                  onClick={markAll}
                  title="ทำเครื่องหมายว่าอ่านทั้งหมด"
                  className="p-1.5 rounded-lg text-gray-400 hover:text-[#CC0000] hover:bg-[#FFF0F0] transition-colors"
                >
                  <Check className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                title="ปิด"
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="max-h-[50vh] overflow-y-auto no-scrollbar">
            {recent.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-gray-400">
                ไม่มีการแจ้งเตือนในขณะนี้
              </div>
            ) : (
              recent.map((n) => (
                <button
                  key={n.id}
                  onClick={() => openItem(n)}
                  className={`w-full text-left px-4 py-3 flex gap-3 border-b border-gray-50 last:border-0 transition-colors hover:bg-gray-50 ${
                    !n.read ? "bg-[#FFF7F7]" : ""
                  }`}
                >
                  <span className={`mt-1.5 shrink-0 w-2 h-2 rounded-full ${TONE_DOT[n.tone] || "bg-blue-500"}`} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-900 truncate">{n.title}</span>
                      {!n.read && <span className="shrink-0 w-2 h-2 rounded-full bg-[#CC0000]" />}
                    </span>
                    {n.body && (
                      <span className="mt-0.5 block text-xs text-gray-500 leading-snug">{n.body}</span>
                    )}
                    <span className="mt-1 block text-[11px] text-gray-400">{timeAgo(n.created_at)}</span>
                  </span>
                </button>
              ))
            )}
          </div>

          <button
            onClick={() => {
              setOpen(false);
              router.push(viewAllHref);
            }}
            className="w-full flex items-center justify-center gap-1.5 px-4 py-3 border-t border-gray-100 text-sm font-semibold text-[#CC0000] hover:bg-[#FFF0F0] transition-colors"
          >
            <History className="w-4 h-4" />
            ดูประวัติการแจ้งเตือนทั้งหมด
          </button>
        </div>
      )}
    </div>
  );
}
