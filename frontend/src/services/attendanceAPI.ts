import { apiFetch } from "./apiClient";
import type {
  OpenablePackage,
  OpenSessionSummary,
  AttendanceSession,
  CheckInResult,
  UpdateAttendanceResult,
  AttendanceHistoryItem,
  AttendanceStatus,
} from "@/types/attendance";

interface Envelope<T> {
  data: T;
  message?: string;
}

// [GET] แพ็กเกจที่ตอนนี้อยู่ในคาบเรียน จึงเปิดรอบเช็คชื่อได้
export async function fetchOpenablePackages(): Promise<OpenablePackage[]> {
  const res = await apiFetch<Envelope<OpenablePackage[]>>("/attendance/openable");
  return res.data ?? [];
}

// [POST] เปิดรอบเช็คชื่อของแพ็กเกจนี้สำหรับวันนี้
//
// 409 = เปิดไปแล้ว หรือยังไม่ถึงเวลาคาบ · ข้อความจาก backend อ่านรู้เรื่องอยู่แล้ว
export async function openSession(packageId: number): Promise<AttendanceSession> {
  const res = await apiFetch<Envelope<AttendanceSession>>("/attendance/sessions", {
    method: "POST",
    body: JSON.stringify({ package_id: packageId }),
  });
  return res.data;
}

// [GET] รอบที่ยังเปิดค้างอยู่ทั้งหมด
//
// ต้องเรียกคู่กับ fetchOpenablePackages บนหน้าเลือกแพ็กเกจ ไม่งั้นรอบที่ลืมปิดจะหาไม่เจอ
export async function fetchOpenSessions(): Promise<OpenSessionSummary[]> {
  const res = await apiFetch<Envelope<OpenSessionSummary[]>>("/attendance/sessions");
  return res.data ?? [];
}

// [GET] รอบพร้อมรายชื่อและตัวเลขสรุป
export async function fetchSession(sessionId: number): Promise<AttendanceSession> {
  const res = await apiFetch<Envelope<AttendanceSession>>(`/attendance/sessions/${sessionId}`);
  return res.data;
}

// [POST] สแกนแล้วบันทึกจริงในครั้งเดียว โควตาถูกหักที่นี่
//
// ⚠️ ส่ง qr_code เท่านั้น ห้ามเพิ่ม enrollment_id เข้ามาใน body
// backend หาตัวตนใหม่จาก QR ทุกครั้งและไม่อ่าน enrollment_id เลยในเส้นนี้
// คนที่แก้ค่าใน devtools จึงเช็คชื่อให้คนอื่นไม่ได้
//
// หมายเหตุ: endpoint /lookup (ถามว่า QR นี้เป็นใครโดยไม่บันทึก) ยังอยู่ฝั่ง backend
// แต่หน้าเว็บเลิกเรียกแล้วตั้งแต่ตัดขั้นให้แอดมินกดยืนยันตัวตนออก
export async function checkInByQR(sessionId: number, qrCode: string): Promise<CheckInResult> {
  const res = await apiFetch<Envelope<CheckInResult>>(`/attendance/sessions/${sessionId}/check-in`, {
    method: "POST",
    body: JSON.stringify({ qr_code: qrCode }),
  });
  return res.data;
}

// [POST] แอดมินติ๊กเช็คชื่อให้เอง — กรณีนักเรียนลืมเอา QR มา
export async function manualCheckIn(
  sessionId: number,
  enrollmentId: number,
  remarks?: string
): Promise<CheckInResult> {
  const res = await apiFetch<Envelope<CheckInResult>>(`/attendance/sessions/${sessionId}/manual`, {
    method: "POST",
    body: JSON.stringify({ enrollment_id: enrollmentId, remarks: remarks ?? "" }),
  });
  return res.data;
}

// [PATCH] ปิดรอบ — คนที่ไม่ได้เช็คชื่อจะถูกมาร์ค absent และถูกหักโควตาทันที
export async function closeSession(sessionId: number): Promise<AttendanceSession> {
  const res = await apiFetch<Envelope<AttendanceSession>>(
    `/attendance/sessions/${sessionId}/close`,
    { method: "PATCH" }
  );
  return res.data;
}

// [PATCH] แก้สถานะย้อนหลัง — ใช้ตอนนักเรียนแจ้งลาแล้วมาปรับให้ทีหลัง
//
// กติกาโควตา: present หัก · absent หัก · leave ไม่หัก
// การเปลี่ยนเป็น leave จึงคืนโควตา 1 ครั้ง และเปลี่ยนออกจาก leave จะหักคืน
export async function updateAttendanceStatus(
  attendanceId: number,
  status: AttendanceStatus,
  remarks?: string
): Promise<UpdateAttendanceResult> {
  const res = await apiFetch<Envelope<UpdateAttendanceResult>>(
    `/attendance/records/${attendanceId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ status, remarks: remarks ?? "" }),
    }
  );
  return res.data;
}

// [GET] ประวัติย้อนหลัง กรองตามคอร์สและวันได้
//
// backend จำกัดไว้ 500 แถวต่อครั้ง (maxHistoryRows) จึงควรส่งวันมาด้วยเสมอ
export async function fetchHistory(params?: {
  courseId?: number;
  date?: string;
}): Promise<AttendanceHistoryItem[]> {
  const qs = new URLSearchParams();
  if (params?.courseId) qs.set("course_id", String(params.courseId));
  if (params?.date) qs.set("date", params.date);

  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await apiFetch<Envelope<AttendanceHistoryItem[]>>(`/attendance/history${suffix}`);
  return res.data ?? [];
}
