import { apiFetch, apiFetchBlob } from "./apiClient";
import type {
  OpenablePackage,
  OpenSessionSummary,
  AttendanceSession,
  CheckInResult,
  CoachCheckInResult,
  ScanCheckIn,
  FaceLookup,
  UpdateAttendanceResult,
  AttendanceHistoryItem,
  CoachHistoryItem,
  AttendanceStatus,
  MissedClass,
  ResolveMissedClassResult,
  UnbilledCourtSession,
} from "@/types/attendance";

interface Envelope<T> {
  data: T;
  message?: string;
  total?: number;
}

// หนึ่งหน้าของประวัติ · total = จำนวนแถวทั้งหมดที่ตรงตัวกรอง ไม่ใช่จำนวนในหน้านี้
export interface HistoryPage<T> {
  items: T[];
  total: number;
}

// ตัวกรองร่วมของประวัตินักเรียนและประวัติโค้ช — ต้องส่งชุดเดียวกันทั้งสองฝั่ง
export interface HistoryFilters {
  courseId?: number;
  from?: string;
  to?: string;
  q?: string;
}

function historyQuery(filters?: HistoryFilters): URLSearchParams {
  const qs = new URLSearchParams();
  if (filters?.courseId) qs.set("course_id", String(filters.courseId));
  if (filters?.from) qs.set("from", filters.from);
  if (filters?.to) qs.set("to", filters.to);
  if (filters?.q?.trim()) qs.set("q", filters.q.trim());
  return qs;
}

const ALREADY_CHECKED_IN_HINTS = ["เช็คชื่อในรอบนี้ไปแล้ว", "เช็คชื่อคาบนี้ไปแล้ว"];

export function isAlreadyCheckedIn(message: string | undefined): boolean {
  if (!message) return false;
  return ALREADY_CHECKED_IN_HINTS.some((hint) => message.includes(hint));
}

// [GET] แพ็กเกจที่ตอนนี้อยู่ในคาบเรียน จึงเปิดรอบเช็คชื่อได้
export async function fetchOpenablePackages(): Promise<OpenablePackage[]> {
  const res = await apiFetch<Envelope<OpenablePackage[]>>("/attendance/openable");
  return res.data ?? [];
}

// [POST] เปิดรอบเช็คชื่อของแพ็กเกจนี้สำหรับวันนี้
export async function openSession(packageId: number): Promise<AttendanceSession> {
  const res = await apiFetch<Envelope<AttendanceSession>>("/attendance/sessions", {
    method: "POST",
    body: JSON.stringify({ package_id: packageId }),
  });
  return res.data;
}

// [GET] รอบที่ยังเปิดค้างอยู่ทั้งหมด
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
  form.append("photo", frame, "frame.jpg");
  return form;
}

// [POST] จังหวะ 1 — ถามว่าใบหน้าในเฟรมนี้คือใคร ยังไม่บันทึกอะไร
export async function faceLookup(sessionId: number, frame: Blob): Promise<FaceLookup> {
  const res = await apiFetch<Envelope<FaceLookup>>(
    `/attendance/sessions/${sessionId}/face-lookup`,
    { method: "POST", body: facePhotoForm(frame) }
  );
  return res.data;
}

// [POST] จังหวะ 2 — บันทึกจริง + หักโควตา
export async function faceCheckIn(sessionId: number, frame: Blob): Promise<ScanCheckIn> {
  const res = await apiFetch<Envelope<ScanCheckIn>>(
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

// [PATCH] ปิดรอบ — คนที่ยืนยันว่าจะมาแล้วไม่มาจะถูกมาร์ค absent
// ส่งค่าสนามรวมของคาบมาด้วยจะออกบิลค่าสนามให้คนในรอบทันที
export async function closeSession(
  sessionId: number,
  courtFeeTotal?: number
): Promise<AttendanceSession> {
  const res = await apiFetch<Envelope<AttendanceSession>>(
    `/attendance/sessions/${sessionId}/close`,
    {
      method: "PATCH",
      body: JSON.stringify(courtFeeTotal ? { court_fee_total: courtFeeTotal } : {}),
    }
  );
  return res.data;
}

// [POST] ออกบิลค่าสนามให้รอบที่ปิดแล้วแต่ยังไม่ได้ออกบิล
export async function billCourtFee(
  sessionId: number,
  courtFeeTotal: number
): Promise<AttendanceSession> {
  const res = await apiFetch<Envelope<AttendanceSession>>(
    `/attendance/sessions/${sessionId}/court-fee`,
    { method: "POST", body: JSON.stringify({ court_fee_total: courtFeeTotal }) }
  );
  return res.data;
}

// [DELETE] ยกเลิกบิลค่าสนามทั้งรอบเพื่อออกใหม่ — ทำได้เฉพาะตอนยังไม่มีใครจ่าย
export async function cancelCourtFee(sessionId: number): Promise<AttendanceSession> {
  const res = await apiFetch<Envelope<AttendanceSession>>(
    `/attendance/sessions/${sessionId}/court-fee`,
    { method: "DELETE" }
  );
  return res.data;
}

// [GET] รอบที่ปิดแล้วแต่ยังไม่ได้ออกบิลค่าสนาม
export async function fetchUnbilledCourtSessions(): Promise<UnbilledCourtSession[]> {
  const res = await apiFetch<Envelope<UnbilledCourtSession[]>>("/attendance/court-fee/pending");
  return res.data ?? [];
}

// [PATCH] แก้สถานะย้อนหลัง — ใช้ตอนคนมาเรียนจริงแต่ลืมสแกน แล้วมาปรับให้ทีหลัง
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

// [GET] ประวัติย้อนหลังหนึ่งหน้า — กรองตามคอร์ส ช่วงวัน และชื่อได้
export async function fetchHistory(
  filters?: HistoryFilters,
  page?: { limit?: number; offset?: number }
): Promise<HistoryPage<AttendanceHistoryItem>> {
  const qs = historyQuery(filters);
  if (page?.limit) qs.set("limit", String(page.limit));
  if (page?.offset) qs.set("offset", String(page.offset));

  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await apiFetch<Envelope<AttendanceHistoryItem[]>>(`/attendance/history${suffix}`);
  return { items: res.data ?? [], total: res.total ?? 0 };
}

// [GET] ประวัติเข้าสอนของโค้ช — ใช้ตัวกรองชุดเดียวกับ fetchHistory
export async function fetchCoachHistory(
  filters?: HistoryFilters,
  sessionIds?: number[]
): Promise<CoachHistoryItem[]> {
  const qs = historyQuery(filters);
  if (sessionIds?.length) qs.set("session_ids", sessionIds.join(","));

  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await apiFetch<Envelope<CoachHistoryItem[]>>(`/attendance/coach-history${suffix}`);
  return res.data ?? [];
}

// [GET] ดาวน์โหลดประวัติทั้งช่วงเป็น CSV — ไม่มีเพดานแถว ไม่แบ่งหน้า
export async function downloadHistoryCsv(
  filters?: HistoryFilters,
  type?: "student" | "coach"
): Promise<void> {
  const qs = historyQuery(filters);
  if (type === "coach") qs.set("type", "coach");

  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const blob = await apiFetchBlob(`/attendance/history/export${suffix}`);

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${type === "coach" ? "coach-attendance" : "attendance"}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// [GET] คาบที่ผ่านวันมาแล้ว มีโค้ชถูกมอบหมาย แต่ไม่มีรอบเช็คชื่อที่ปิดแล้ว
export async function fetchMissedClasses(): Promise<MissedClass[]> {
  const res = await apiFetch<Envelope<MissedClass[]>>("/attendance/missed-classes");
  return res.data ?? [];
}

// [POST] เคลียร์คาบที่ค้าง — สร้างรอบเช็คชื่อย้อนหลังพร้อมบันทึกว่าใครมาสอนบ้าง
export async function resolveMissedClass(
  workScheduleId: number,
  coaches: { coach_id: number; status: AttendanceStatus; remarks?: string }[],
): Promise<ResolveMissedClassResult> {
  const res = await apiFetch<Envelope<ResolveMissedClassResult>>(
    "/attendance/missed-classes/resolve",
    {
      method: "POST",
      body: JSON.stringify({ work_schedule_id: workScheduleId, coaches }),
    },
  );
  return res.data;
}
