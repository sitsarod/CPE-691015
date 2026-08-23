export type AttendanceStatus = "present" | "absent" | "leave";

export type CheckInMethod = "qr_code" | "manual" | "face_scan" | "system";

export type SessionStatus = "open" | "closed";

// ─── เปิดรอบ ─────────────────────────────────────────────────────────────────

export interface OpenablePackage {
  package_id: number;
  course_id: number;
  course_name: string;

  sessions_count: number;
  student_count: number;

  day_of_week: string;
  start_time: string;
  end_time: string;

  existing_session_id: number | null;
  existing_session_status?: SessionStatus;
}

// ─── รอบและรายชื่อ ───────────────────────────────────────────────────────────

export interface RosterItem {
  enrollment_id: number;
  customer_id: number;
  user_id: number;
  full_name: string;
  nickname: string;

  total_sessions: number;
  remaining_sessions: number;

  // null = ยังไม่มีบันทึกในรอบนี้ (ยังไม่ได้เช็คชื่อ)
  attendance_id: number | null;
  status?: AttendanceStatus;
  check_in_method?: CheckInMethod;
  check_in_time: string | null;
  remarks?: string;
}

export interface AttendanceSession {
  id: number;
  package_id: number;
  course_name: string;
  session_date: string;

  status: SessionStatus;
  opened_at: string;
  closed_at: string | null;

  schedule_start_time: string;
  schedule_end_time: string;

  // รับการเช็คชื่อได้จริงไหม — รอบที่ "เปิดอยู่แต่เลยเวลาแล้ว" ยังดูรายชื่อและปิดรอบได้
  // แต่สแกนไม่ได้ อย่าดูแค่ status
  can_scan: boolean;

  roster: RosterItem[];

  present_count: number;
  absent_count: number;
  leave_count: number;
  pending_count: number;
}

// รอบที่ยังเปิดค้างอยู่ — ทางกลับเข้าไปปิดรอบที่หลุดจาก OpenablePackage ไปแล้ว
export interface OpenSessionSummary {
  id: number;
  package_id: number;
  course_name: string;
  session_date: string;

  schedule_start_time: string;
  schedule_end_time: string;
  opened_at: string;

  // จำนวนคนที่จะถูกมาร์คขาดเรียนถ้าปิดรอบตอนนี้
  pending_count: number;
  total_count: number;

  // false = เลยเวลาคาบแล้ว เหลือแค่เข้าไปดูรายชื่อและปิดรอบ
  can_scan: boolean;
}

// ─── สแกน ────────────────────────────────────────────────────────────────────

// ผลของจังหวะที่ 1 — ยังไม่มีการบันทึกอะไรลงฐานข้อมูล
export interface ScanResult {
  enrollment_id: number;
  full_name: string;
  nickname: string;
  course_name: string;

  total_sessions: number;
  remaining_sessions: number;

  // false = ให้แสดง reason แทนปุ่มยืนยัน
  can_check_in: boolean;
  reason?: string;
}

// ผลของจังหวะที่ 2 — บันทึกแล้วและโควตาถูกหักแล้ว
export interface CheckInResult {
  attendance_id: number;
  enrollment_id: number;
  full_name: string;
  nickname: string;

  check_in_method: CheckInMethod;
  check_in_time: string;

  remaining_sessions: number;
}

// ─── แก้สถานะย้อนหลัง ────────────────────────────────────────────────────────

export interface UpdateAttendanceResult {
  attendance_id: number;
  enrollment_id: number;
  from_status: AttendanceStatus;
  to_status: AttendanceStatus;

  // -1 หัก · 0 ไม่เปลี่ยน · +1 คืน
  quota_delta: number;
  remaining_sessions: number;
}

// ─── ประวัติ ─────────────────────────────────────────────────────────────────

export interface AttendanceHistoryItem {
  attendance_id: number;
  session_id: number | null;
  session_date: string;

  enrollment_id: number;
  full_name: string;
  nickname: string;
  course_name: string;

  status: AttendanceStatus;
  check_in_method: CheckInMethod;
  check_in_time: string;
  remarks?: string;

  // null = นักเรียนสแกนเอง · มีค่า = แอดมินบันทึกหรือแก้ให้
  recorded_by_user_id: number | null;
}

// ─── ป้ายภาษาไทยที่ใช้ร่วมกันทุกหน้า ─────────────────────────────────────────

export const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "มาเรียน",
  absent: "ขาดเรียน",
  leave: "ลา",
};

export const METHOD_LABEL: Record<CheckInMethod, string> = {
  qr_code: "สแกน QR",
  manual: "แอดมินเช็คให้",
  face_scan: "สแกนใบหน้า",
  system: "ระบบมาร์คตอนปิดรอบ",
};
