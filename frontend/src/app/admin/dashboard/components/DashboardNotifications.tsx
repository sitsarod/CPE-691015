"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Check, History, Loader2 } from "lucide-react";
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type NotificationDTO,
} from "@/services/notificationAPI";

const TONE_DOT: Record<string, string> = {
  danger: "bg-rose-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
  success: "bg-emerald-500",
};

const timeAgo = (iso: string): string => {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "";
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return "เมื่อสักครู่";
  if (m < 60) return `${m} นาทีที่แล้ว`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ชม.ที่แล้ว`;
  const d = Math.floor(h / 24);
  return `${d} วันที่แล้ว`;
};

const VIEW_ALL_HREF = "/admin/notifications";
const MAX_ITEMS = 6;

// การ์ดแจ้งเตือนบนแดชบอร์ด — ใช้ฟีดจริงจาก notificationAPI (ตัวเดียวกับกระดิ่งบน topbar)
// มี SSE เรียลไทม์ + refetch ตอนกลับมาโฟกัสหน้าต่าง แสดงได้ทั้งจอเล็กและจอใหญ่
export default function DashboardNotifications() {
  const router = useRouter();
  const [notifs, setNotifs] = useState<NotificationDTO[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const { data, unread } = await fetchNotifications(token);
      setNotifs(data);
      setUnread(unread);
    } catch {
      /* เงียบไว้ ไม่รบกวนผู้ใช้ */
    } finally {
      setLoading(false);
    }
  }, []);

  // โหลดครั้งแรก + รีเฟรชเมื่อกลับมาโฟกัส (throttle 15 วิ)
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

  // SSE: อัปเดตสดเมื่อมีแจ้งเตือนใหม่ (reconnect เผื่อ token หมดอายุ)
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
      es.addEventListener("notify", () => refresh());
      es.onerror = () => {
        es?.close();
        if (closed) return;
        if (retry) clearTimeout(retry);
        retry = setTimeout(connect, 5000);
      };
    };
    connect();

    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      es?.close();
    };
  }, [refresh]);

  const markRead = (n: NotificationDTO) => {
    if (n.read) return;
    setNotifs((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    setUnread((u) => Math.max(0, u - 1));
    const token = localStorage.getItem("token");
    if (token) markNotificationRead(n.id, token).catch(() => refresh());
  };

  const markAll = () => {
    if (unread === 0) return;
    setNotifs((prev) => prev.map((x) => ({ ...x, read: true })));
    setUnread(0);
    const token = localStorage.getItem("token");
    if (token) markAllNotificationsRead(token).catch(() => refresh());
  };

  const openItem = (n: NotificationDTO) => {
    markRead(n);
    if (n.href) router.push(n.href);
  };

  const recent = notifs.slice(0, MAX_ITEMS);

  return (
    <div className="flex flex-col rounded-2xl border border-gray-200/80 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-6">
        <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
          <Bell className="h-5 w-5 text-gray-400" />
          การแจ้งเตือน
          {unread > 0 && (
            <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-[#CC0000] px-1.5 py-0.5 text-[11px] font-bold leading-none text-white tabular-nums">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </h2>
        {unread > 0 && (
          <button
            onClick={markAll}
            className="inline-flex items-center gap-1 text-xs font-semibold text-gray-400 transition hover:text-[#CC0000]"
          >
            <Check className="h-3.5 w-3.5" />
            อ่านทั้งหมด
          </button>
        )}
      </div>

      {/* List */}
      <div className="mt-4 flex-1">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            กำลังโหลด...
          </div>
        ) : recent.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-gray-100 text-gray-300">
              <Bell className="h-6 w-6" />
            </div>
            <p className="text-sm text-gray-400">ยังไม่มีการแจ้งเตือน</p>
          </div>
        ) : (
          <ul>
            {recent.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => openItem(n)}
                  className={`flex w-full gap-3 border-t border-gray-50 px-6 py-3 text-left transition-colors hover:bg-gray-50 ${
                    !n.read ? "bg-[#FFF7F7]" : ""
                  }`}
                >
                  <span
                    className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${TONE_DOT[n.tone] || "bg-blue-500"}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-bold text-gray-900">{n.title}</span>
                      {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-[#CC0000]" />}
                    </span>
                    {n.body && (
                      <span className="mt-0.5 block text-xs leading-snug text-gray-500">{n.body}</span>
                    )}
                    <span className="mt-1 block text-[11px] text-gray-400">{timeAgo(n.created_at)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer */}
      <Link
        href={VIEW_ALL_HREF}
        className="flex items-center justify-center gap-1.5 border-t border-gray-100 px-6 py-3 text-sm font-semibold text-[#CC0000] transition-colors hover:bg-[#FFF0F0]"
      >
        <History className="h-4 w-4" />
        ดูประวัติการแจ้งเตือนทั้งหมด
      </Link>
    </div>
  );
}
