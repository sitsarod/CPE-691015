// อัตราส่วนแนะนำจำนวนโค้ช: โค้ช 1 คนต่อนักเรียนกี่คน
// เก็บใน localStorage เพื่อให้แอดมินตั้งค่าเองได้จากหน้าจัดตารางสอน (ค่าเริ่มต้น 6)

export const DEFAULT_STUDENTS_PER_COACH = 6;
const STORAGE_KEY = "students_per_coach";

/** โหลดค่าที่ตั้งไว้ (คืนค่าเริ่มต้นถ้ายังไม่เคยตั้ง/ไม่ถูกต้อง) */
export function loadStudentsPerCoach(): number {
  if (typeof window === "undefined") return DEFAULT_STUDENTS_PER_COACH;
  const v = parseInt(window.localStorage.getItem(STORAGE_KEY) ?? "", 10);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_STUDENTS_PER_COACH;
}

/** บันทึกค่าที่ตั้งใหม่ (บังคับให้เป็นจำนวนเต็มบวก) */
export function saveStudentsPerCoach(n: number): void {
  if (typeof window === "undefined") return;
  const safe = Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_STUDENTS_PER_COACH;
  window.localStorage.setItem(STORAGE_KEY, String(safe));
}

/** จำนวนโค้ชที่ควรมีจากจำนวนนักเรียนที่ยืนยันมาเรียน */
export function suggestedCoaches(going: number, perCoach: number): number {
  return going > 0 && perCoach > 0 ? Math.ceil(going / perCoach) : 0;
}
