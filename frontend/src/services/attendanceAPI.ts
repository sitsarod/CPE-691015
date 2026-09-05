import { apiFetch } from "./apiClient";
import type {
  OpenablePackage,
  OpenSessionSummary,
  AttendanceSession,
  CheckInResult,
  CoachCheckInResult,
  ScanCheckIn,
  FaceScanResult,
  UpdateAttendanceResult,
  AttendanceHistoryItem,
  CoachHistoryItem,
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
// รับ QR ของโค้ชด้วย ต้องดู kind ก่อน — backend เป็นคนแยกเพราะหน้าเว็บเห็นแค่สตริง QR
//
// หมายเหตุ: endpoint /lookup (ถามว่า QR นี้เป็นใครโดยไม่บันทึก) ยังอยู่ฝั่ง backend
// แต่หน้าเว็บเลิกเรียกแล้วตั้งแต่ตัดขั้นให้แอดมินกดยืนยันตัวตนออก
export async function checkInByQR(sessionId: number, qrCode: string): Promise<ScanCheckIn> {
  const res = await apiFetch<Envelope<ScanCheckIn>>(`/attendance/sessions/${sessionId}/check-in`, {
    method: "POST",
    body: JSON.stringify({ qr_code: qrCode }),
  });
  return res.data;
}

// ─── สแกนใบหน้า ───

function facePhotoForm(frame: Blob): FormData {
  const form = new FormData();
  // ต้องมี filename ไม่งั้น c.FormFile ฝั่ง Go อ่านไม่เจอ
  form.append("photo", frame, "frame.jpg");
  return form;
}

/**
 * [POST] จังหวะ 1 — ถามว่าใบหน้าในเฟรมนี้คือใคร ยังไม่บันทึกอะไร
 *
 * ⚠️ ถูกเรียกทุก ~1.5 วินาทีตลอดเวลาที่กล้องเปิด เฟรมส่วนใหญ่จะไม่มีหน้าคน
 * ผู้เรียกต้องกลืน error เงียบ ๆ ไม่ใช่เด้งข้อความทุกครั้ง
 */
export async function faceLookup(sessionId: number, frame: Blob): Promise<FaceScanResult> {
  const res = await apiFetch<Envelope<FaceScanResult>>(
    `/attendance/sessions/${sessionId}/face-lookup`,
    { method: "POST", body: facePhotoForm(frame) }
  );
  return res.data;
}

/**
 * [POST] จังหวะ 2 — บันทึกจริง + หักโควตา
 *
 * ⚠️ ส่ง "รูป" เท่านั้น ห้ามเพิ่ม enrollment_id ที่ได้จาก faceLookup เข้ามาใน body
 * backend หาตัวตนใหม่จากรูปทุกครั้งและไม่อ่าน id ใด ๆ จาก client เลย
 * (เหตุผลเดียวกับ checkInByQR ด้านบน)
 */
export async function faceCheckIn(sessionId: number, frame: Blob): Promise<CheckInResult> {
  const res = await apiFetch<Envelope<CheckInResult>>(
    `/attendance/sessions/${sessionId}/face-check-in`,
    { method: "POST", body: facePhotoForm(frame) }
  );
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

// [POST] แอดมินเช็คชื่อให้โค้ชเอง — โค้ชลืม QR
export async function manualCoachCheckIn(
  sessionId: number,
  coachId: number,
  remarks?: string
): Promise<CoachCheckInResult> {
  const res = await apiFetch<Envelope<CoachCheckInResult>>(
    `/attendance/sessions/${sessionId}/coach-manual`,
    { method: "POST", body: JSON.stringify({ coach_id: coachId, remarks: remarks ?? "" }) }
  );
  return res.data;
}

// [PATCH] แก้สถานะของโค้ชย้อนหลัง — ไม่มีโควตาให้ปรับเหมือนของนักเรียน
export async function updateCoachAttendanceStatus(
  attendanceId: number,
  status: AttendanceStatus,
  remarks?: string
): Promise<void> {
  await apiFetch<Envelope<unknown>>(`/attendance/coach-records/${attendanceId}`, {
    method: "PATCH",
    body: JSON.stringify({ status, remarks: remarks ?? "" }),
  });
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

// [GET] ประวัติเข้าสอนของโค้ช — ใช้ตัวกรองชุดเดียวกับ fetchHistory
//
// แยก endpoint เพราะฟิลด์สองฝั่งไม่ทับกัน ผู้เรียกต้องยิงคู่กันแล้วรวมเองด้วย session_id
export async function fetchCoachHistory(params?: {
  courseId?: number;
  date?: string;
}): Promise<CoachHistoryItem[]> {
  const qs = new URLSearchParams();
  if (params?.courseId) qs.set("course_id", String(params.courseId));
  if (params?.date) qs.set("date", params.date);

  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await apiFetch<Envelope<CoachHistoryItem[]>>(`/attendance/coach-history${suffix}`);
  return res.data ?? [];
}
