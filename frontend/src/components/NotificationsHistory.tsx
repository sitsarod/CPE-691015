"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, Trash2, Loader2 } from "lucide-react";
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  clearNotifications,
  type NotificationDTO,
} from "@/services/notificationAPI";

const TONE_DOT: Record<string, string> = {
  danger: "bg-rose-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
  success: "bg-emerald-500",
};

const fmtFull = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// หน้าประวัติการแจ้งเตือนเต็ม — ใช้ร่วมกันทุก role (ตัวตนมาจาก JWT)
export default function NotificationsHistory() {
  const router = useRouter();
  const [notifs, setNotifs] = useState<NotificationDTO[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
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
      /* เงียบไว้ */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // SSE: อัปเดตรายการสด ๆ เมื่อมีแจ้งเตือนใหม่ (มี reconnect เผื่อ token หมดอายุ)
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
      es.addEventListener("notify", () => load());
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
  }, [load]);

  const handleOpen = (n: NotificationDTO) => {
    if (!n.read) {
      setNotifs((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      const token = localStorage.getItem("token");
      if (token) markNotificationRead(n.id, token).catch(() => load());
    }
    if (n.href) router.push(n.href);
  };

  const handleMarkAll = async () => {
    if (unread === 0) return;
    setBusy(true);
    setNotifs((prev) => prev.map((x) => ({ ...x, read: true })));
    setUnread(0);
    const token = localStorage.getItem("token");
    try {
      if (token) await markAllNotificationsRead(token);
    } finally {
      setBusy(false);
    }
  };

  const handleClear = async () => {
    if (notifs.length === 0) return;
    if (!window.confirm("ล้างประวัติการแจ้งเตือนทั้งหมด?")) return;
    setBusy(true);
    const token = localStorage.getItem("token");
    try {
      if (token) await clearNotifications(token);
      setNotifs([]);
      setUnread(0);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header (editorial) */}
      <div className="flex flex-col gap-4 border-b border-gray-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="text-[11.5px] font-medium uppercase tracking-[0.2em] text-[#CC0000]">Notifications</span>
          <h1 className="mt-1.5 text-3xl font-semibold tracking-tight text-gray-900">การแจ้งเตือน</h1>
          <p className="mt-1.5 text-[13px] font-light text-gray-500">
            {unread > 0 ? `มี ${unread} รายการที่ยังไม่ได้อ่าน` : "อ่านครบทุกรายการแล้ว"} · อัปเดตสดอัตโนมัติ
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleMarkAll}
            disabled={busy || unread === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:border-[#CC0000] hover:text-[#CC0000] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <CheckCheck className="h-4 w-4" />
            อ่านทั้งหมด
          </button>
          <button
            onClick={handleClear}
            disabled={busy || notifs.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:border-rose-400 hover:text-rose-600 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Trash2 className="h-4 w-4" />
            ล้างประวัติ
          </button>
        </div>
      </div>

      {/* List */}
      <div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            กำลังโหลด...
          </div>
        ) : notifs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-gray-100 text-gray-300">
              <Bell className="h-7 w-7" />
            </div>
            <p className="text-sm text-gray-400">ยังไม่มีการแจ้งเตือน</p>
          </div>
        ) : (
          <ul className="border-t border-gray-200">
            {notifs.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => handleOpen(n)}
                  className={`w-full text-left px-2 py-4 flex gap-4 border-b border-gray-100 transition-colors hover:bg-gray-50 ${
                    !n.read ? "bg-[#FFF7F7]" : ""
                  }`}
                >
                  <span className={`mt-1.5 shrink-0 w-2.5 h-2.5 rounded-full ${TONE_DOT[n.tone] || "bg-blue-500"}`} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-900">{n.title}</span>
                      {!n.read && <span className="shrink-0 w-2 h-2 rounded-full bg-[#CC0000]" />}
                    </span>
                    {n.body && <span className="mt-0.5 block text-sm text-gray-600 leading-snug">{n.body}</span>}
                    <span className="mt-1 block text-xs text-gray-400">{fmtFull(n.created_at)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
