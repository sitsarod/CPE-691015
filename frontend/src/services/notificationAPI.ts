// frontend/src/services/notificationAPI.ts
const BASE_URL = process.env.NEXT_PUBLIC_API_URL;

export interface NotificationDTO {
  id: number;
  type: string;
  signature: string;
  title: string;
  body: string;
  href: string;
  tone: "danger" | "warning" | "info" | "success" | "";
  read: boolean;
  created_at: string;
}

// รายการที่หน้าเว็บ derive แล้วส่งไป sync
//
// ⚠️ ยังไม่ถูกใช้ ณ ตอนนี้ — ระบบแจ้งเตือนเป็น event-driven แล้ว (backend สร้างเองตอนเกิด
// event จริง เช่น ออกบิล/ยืนยันสลิป/มอบหมายคาบ) เก็บ syncNotifications ไว้ใช้อนาคต
// สำหรับแจ้งเตือนที่ "backend ไม่รู้/ทำแทนไม่ได้" ซึ่งต้องพึ่ง state ฝั่ง client เช่น
//   • เบราว์เซอร์/อุปกรณ์ไม่รองรับกล้อง (เช็คชื่อด้วยใบหน้าไม่ได้)
//   • standing reminder ที่ derive จาก state ปัจจุบัน เช่น "คุณมีบิลค้าง 3 ใบ"
// วิธีใช้: derive เป็น SyncNotificationItem[] แล้วเรียก syncNotifications(items, token)
// การ dedup ด้วย (type, signature) ฝั่ง backend กันการซ้ำให้อยู่แล้ว
export interface SyncNotificationItem {
  type: string;
  signature: string;
  title: string;
  body?: string;
  href?: string;
  tone?: string;
}

function authHeaders(token: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

// ดึงแจ้งเตือน + จำนวนที่ยังไม่อ่าน
export async function fetchNotifications(
  token: string
): Promise<{ data: NotificationDTO[]; unread: number }> {
  const res = await fetch(`${BASE_URL}/notifications`, {
    method: "GET",
    headers: authHeaders(token),
  });
  const resData = await res.json();
  if (!res.ok) throw new Error(resData.error || "ดึงการแจ้งเตือนไม่สำเร็จ");
  return { data: resData.data || [], unread: resData.unread || 0 };
}

// sync แจ้งเตือนที่ derive มา (เพิ่มเฉพาะที่ยังไม่มี)
// ยังไม่มีใครเรียกใช้ตอนนี้ — เก็บไว้ใช้อนาคต (ดูรายละเอียดที่ interface SyncNotificationItem ด้านบน)
export async function syncNotifications(
  items: SyncNotificationItem[],
  token: string
): Promise<void> {
  const res = await fetch(`${BASE_URL}/notifications/sync`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ items }),
  });
  if (!res.ok) {
    const resData = await res.json().catch(() => ({}));
    throw new Error(resData.error || "sync การแจ้งเตือนไม่สำเร็จ");
  }
}

// ทำเครื่องหมายว่าอ่านแล้วรายการเดียว
export async function markNotificationRead(id: number, token: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/notifications/${id}/read`, {
    method: "PATCH",
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const resData = await res.json().catch(() => ({}));
    throw new Error(resData.error || "อัปเดตสถานะอ่านไม่สำเร็จ");
  }
}

// ทำเครื่องหมายว่าอ่านทั้งหมด
export async function markAllNotificationsRead(token: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/notifications/read-all`, {
    method: "POST",
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const resData = await res.json().catch(() => ({}));
    throw new Error(resData.error || "อัปเดตสถานะอ่านไม่สำเร็จ");
  }
}

// ล้างประวัติแจ้งเตือนทั้งหมด
export async function clearNotifications(token: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/notifications`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const resData = await res.json().catch(() => ({}));
    throw new Error(resData.error || "ล้างประวัติไม่สำเร็จ");
  }
}
