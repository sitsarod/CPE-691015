export type AttendanceStatus = "present" | "absent";

export type CheckInMethod = "qr_code" | "manual" | "face_scan" | "system";

export type SessionStatus = "open" | "closed";

// ─── เปิดรอบ ─────────────────────────────────────────────────────────────────

/** แพ็กเกจหนึ่งใบที่เรียนอยู่ในคาบเดียวกัน — คาบเดียวมีได้หลายใบ (8/12/16/20 ครั้ง) */
export interface ClassPackage {
  id: number;
  sessions_count: number;
  price: number;
  student_count: number;
  /** ใบที่รอบเช็คชื่อยึดไว้ (id น้อยสุดของคาบ) */
  is_anchor: boolean;
}

export interface OpenablePackage {
  package_id: number;
  course_id: number;
  course_name: string;

  package_count: number;
  student_count: number;
  confirmed_count: number;
  packages: ClassPackage[];

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

  is_confirmed: boolean;
  is_off_schedule: boolean;

  // null = ยังไม่มีบันทึกในรอบนี้ (ยังไม่ได้เช็คชื่อ)
  attendance_id: number | null;
  status?: AttendanceStatus;
  check_in_method?: CheckInMethod;
  check_in_time: string | null;
  remarks?: string;
}

// โค้ชหนึ่งคนในรายชื่อของรอบ — มาจากตารางงาน ไม่ใช่ enrollment เหมือนนักเรียน
export interface CoachRosterItem {
  coach_id: number;
  full_name: string;
  nickname: string;

  court_number: string; // เว้นว่างได้ (ยังไม่ระบุสนาม)

  // true = กรณีฉุกเฉิน — สแกนเองหน้างาน หรือแอดมินติ๊กไว้ตอน assign
  is_emergency: boolean;

  // false = ตอนนี้ไม่มีตารางงานของคาบนี้แล้ว แต่มีบันทึกเช็คชื่อค้างอยู่
  is_scheduled: boolean;

  // null = ยังไม่เช็คชื่อ
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

  packages: ClassPackage[];
  roster: RosterItem[];
  walk_in_candidates: RosterItem[];

  coaches: CoachRosterItem[];

  confirmed_count: number;
  present_count: number;
  absent_count: number;
  off_schedule_count: number;
  pending_count: number;

  // null = ยังไม่ได้ออกบิลค่าสนาม · มีวันที่แต่ยอดรวมเป็น null = ออกบิลทางอื่น (ฟอร์มหารเฉลี่ย/รอบเก่า)
  court_fee_total: number | null;
  court_billed_at: string | null;
}

// ประวัติการเข้าเรียนหนึ่งครั้งที่นักเรียนเห็นของตัวเอง
export interface MyAttendanceItem {
  attendance_id: number;
  course_name: string;
  // null = บันทึกนอกรอบเช็คชื่อ (ข้อมูลเก่า) ใช้ check_in_time แทน
  session_date: string | null;
  schedule_start_time?: string;
  schedule_end_time?: string;
  status: AttendanceStatus;
  check_in_method: CheckInMethod;
  check_in_time: string;
  is_off_schedule: boolean;
}

export interface MyAttendanceHistory {
  items: MyAttendanceItem[];
  total: number;
  present_count: number;
  absent_count: number;
}

// รอบที่ปิดแล้วแต่ยังไม่ได้ออกบิลค่าสนาม
export interface UnbilledCourtSession {
  id: number;
  course_name: string;
  session_date: string;
  schedule_start_time: string;
  schedule_end_time: string;
  closed_at: string | null;
  payer_count: number;
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

  is_confirmed: boolean;

  // false = ให้แสดง reason แทนปุ่มยืนยัน
  can_check_in: boolean;
  reason?: string;
}

// ผลของจังหวะที่ 1 ตอนสแกนใบหน้า — ยังไม่บันทึกอะไร
//
// confidence = ความเหมือนของอันดับ 1 (0–1)
// margin = อันดับ 1 นำอันดับ 2 อยู่เท่าไร · ต่ำแปลว่ามีคนหน้าคล้ายในคาบนี้
export interface FaceScanResult extends ScanResult {
  matched: boolean;
  confidence: number;
  margin: number;
}

// ผลของจังหวะที่ 2 — บันทึกแล้วและโควตาถูกหักแล้ว
export interface CheckInResult {
  attendance_id: number;
  enrollment_id: number;
  full_name: string;
  nickname: string;

  check_in_method: CheckInMethod;
  check_in_time: string;

  is_off_schedule: boolean;

  remaining_sessions: number;
}

// ผลของโค้ชเช็คชื่อ — ไม่มีโควตาหรือ "มาไม่ตรงวัน" เพราะโค้ชไม่ได้ซื้อคอร์ส
export interface CoachCheckInResult {
  attendance_id: number;
  coach_id: number;
  full_name: string;
  nickname: string;

  check_in_method: CheckInMethod;
  check_in_time: string;
  session_date: string; // YYYY-MM-DD

  // false = ยังไม่ได้ถูก assign คาบนี้ ระบบสร้างตารางงานให้อัตโนมัติตอนสแกน
  is_scheduled: boolean;
}

// จังหวะที่ 1 ตอนโค้ชสแกนใบหน้า — ไม่มีโควตา/คอร์สเหมือนนักเรียน
export interface CoachFaceScanResult {
  coach_id: number;
  full_name: string;
  nickname: string;

  confidence: number;
  margin: number;

  can_check_in: boolean;
  reason?: string;
}

// กล้องตัวเดียวรับทั้งสองฝ่าย — kind บอกว่าฟิลด์ไหนใช้ได้
export type FaceLookup =
  | { kind: "student"; student: FaceScanResult; coach?: undefined }
  | { kind: "coach"; coach: CoachFaceScanResult; student?: undefined };

// kind บอกว่าฟิลด์ไหนใช้ได้ · เขียนเป็น union เพื่อให้ TS บังคับเช็คก่อนแตะฟิลด์
export type ScanCheckIn =
  | { kind: "student"; student: CheckInResult; coach?: undefined }
  | { kind: "coach"; coach: CoachCheckInResult; student?: undefined };

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

  // สแนปช็อตเวลาคาบของรอบ — ว่างเมื่อ session_id เป็น null
  schedule_start_time?: string;
  schedule_end_time?: string;

  enrollment_id: number;
  full_name: string;
  nickname: string;
  course_name: string;

  status: AttendanceStatus;
  check_in_method: CheckInMethod;
  check_in_time: string;
  is_off_schedule: boolean;
  remarks?: string;

  // null = นักเรียนสแกนเอง · มีค่า = แอดมินบันทึกหรือแก้ให้
  recorded_by_user_id: number | null;
}

// ประวัติเข้าสอนของโค้ชในหน้าประวัติของแอดมิน
//
// แยกลิสต์จากของนักเรียนเพราะฟิลด์ไม่ทับกัน หน้าเว็บรวมเข้ารอบเดียวกันด้วย session_id
export interface CoachHistoryItem {
  attendance_id: number;
  session_id: number;
  coach_id: number;
  full_name: string;
  nickname: string;

  status: AttendanceStatus;
  check_in_method: CheckInMethod;
  check_in_time: string;
  remarks?: string;

  // false = ตอนเช็คชื่อยังไม่ได้ถูก assign คาบนี้
  is_scheduled: boolean;
}

// ─── คาบที่สอนไปแล้วแต่ไม่เคยมีรอบเช็คชื่อ ───────────────────────────────────
//
// ค่าจ้างของโค้ชนับจากคาบที่ "มีรอบเช็คชื่อปิดแล้ว" เท่านั้น
// ถ้าแอดมินลืมเปิดรอบ หรือเปิดไม่ทันช่วงที่ระบบอนุญาต (คาบ ±30 นาที)
// คาบนั้นจะไม่มีทางถูกนับเป็นเงินได้อีกเลย โดยไม่มี error ให้ใครเห็น
//
// รายการนี้คือ "เงินที่ยังไม่ถูกนับให้โค้ช" ไม่ใช่รายงานเชิงสถิติ

export interface MissedClassCoach {
  coach_id: number;
  full_name: string;
  nickname: string;

  // true = คาบนี้ถูกมอบหมายนอกกฎ (แอดมินติ๊กฉุกเฉิน หรือระบบสร้างให้ตอนโค้ชสแกน)
  is_emergency: boolean;
}

export interface MissedClassStudent {
  customer_id: number;
  full_name: string;
  nickname: string;
}

// หนึ่งรายการ = หนึ่ง "คลาส" ไม่ใช่หนึ่งโค้ช — คลาสเดียวมีโค้ชหลายคนได้
// และต้องตัดสินใจพร้อมกันทั้งคลาส เพราะการสร้างรอบขึ้นมาหนึ่งรอบ
// มีผลกับค่าจ้างของทุกคนในคลาสนั้นทันที
export interface MissedClass {
  work_schedule_id: number; // ตัวแทนของคลาส ใช้ส่งกลับตอนเคลียร์
  course_id: number;
  course_name: string;

  date: string; // YYYY-MM-DD
  start_time: string;
  end_time: string;

  coaches: MissedClassCoach[];

  // นักเรียนที่กดยืนยันว่าจะมาเรียนคาบนี้ไว้
  students: MissedClassStudent[];
}

export interface ResolveMissedClassResult {
  session_id: number;
  package_id: number;
  date: string;
  start_time: string;
  end_time: string;

  present_coach_ids: number[];
  absent_coach_ids: number[];
}

// ─── ป้ายภาษาไทยที่ใช้ร่วมกันทุกหน้า ─────────────────────────────────────────

export const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "มาเรียน",
  absent: "ขาดเรียน",
};

export const STATUS_TONE: Record<AttendanceStatus, string> = {
  present: "bg-green-100 text-green-700",
  absent: "bg-red-100 text-red-700",
};

export const OFF_SCHEDULE_LABEL = "นอกเหนือจากยืนยัน";
export const OFF_SCHEDULE_TONE = "bg-amber-100 text-amber-700";

// สถานะเก่าที่ถอดออกแล้วแต่ยังมีแถวค้างอยู่ในฐานข้อมูล
const LEGACY_LABEL: Record<string, string> = {
  leave: "ลา (เลิกใช้แล้ว)",
};

export function statusLabel(status: string): string {
  return STATUS_LABEL[status as AttendanceStatus] ?? LEGACY_LABEL[status] ?? status;
}

export function statusTone(status: string): string {
  return STATUS_TONE[status as AttendanceStatus] ?? "bg-gray-100 text-gray-600";
}

// ป้ายเดียวต่อหนึ่งแถว — ป้ายที่เจาะจงกว่ากินป้ายกว้างไป
export function displayStatus(status: string, isOffSchedule: boolean) {
  if (isOffSchedule && status === "present") {
    return { label: OFF_SCHEDULE_LABEL, tone: OFF_SCHEDULE_TONE };
  }
  return { label: statusLabel(status), tone: statusTone(status) };
}

// ฝั่งโค้ชใช้คำคนละชุด — โค้ชมา "สอน" ไม่ได้มา "เรียน"
// สีใช้ร่วมกันได้ (statusTone) เพราะความหมาย มา/ไม่มา เหมือนกัน
export const COACH_STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "มาสอน",
  absent: "ไม่ได้มาสอน",
};

export function coachStatusLabel(status: string): string {
  return COACH_STATUS_LABEL[status as AttendanceStatus] ?? status;
}

/**
 * คำอธิบายผลของแต่ละสถานะฝั่งโค้ช — แสดงในโมดัลแก้สถานะก่อนแอดมินกดยืนยัน
 *
 * ⚠️ ข้อความนี้พูดเรื่องเงิน ต้องตรงกับ backend เสมอ
 *
 * เดิมเขียนว่า "ไม่กระทบค่าจ้าง" ซึ่งตรงกับพฤติกรรมสมัยนั้นจริง (การนับคาบ
 * ไม่ได้ดูสถานะเช็คชื่อเลย โค้ชขาดงานก็ยังได้เงินเต็ม) แต่ตอนนี้แก้แล้ว
 * คาบที่มีสถานะ absent จะไม่ถูกนับ ข้อความเดิมจึงกลายเป็นการบอกแอดมินผิด
 * ในเรื่องที่เป็นเงินจริง
 *
 * เก็บไว้ที่เดียวให้ทุกหน้าดึงไปใช้ จะได้ไม่มีหน้าไหนตกค้างเป็นข้อความเก่า
 * (ดู services/coach_workschedule.go — taughtScheduleScope)
 */
export const COACH_STATUS_NOTE: Record<AttendanceStatus, string> = {
  present: "บันทึกว่ามาสอนคาบนี้ · นับเป็นคาบที่ได้ค่าจ้าง",
  absent: "บันทึกว่าไม่ได้มาสอน · คาบนี้จะไม่ถูกนับค่าจ้าง",
};

export const METHOD_LABEL: Record<CheckInMethod, string> = {
  qr_code: "สแกน QR",
  manual: "แอดมินเช็คให้",
  face_scan: "สแกนใบหน้า",
  system: "ระบบมาร์คตอนปิดรอบ",
};
