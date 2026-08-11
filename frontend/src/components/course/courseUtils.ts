// ตัวช่วยคำนวณข้อมูลที่ "อนุมานได้" จากแพ็กเกจ โดยไม่ต้องเพิ่มฟิลด์ใน DB
//
// ค่าพวกนี้ (ระยะเวลาต่อครั้ง, ที่นั่งเหลือ, ช่วงราคา) คำนวณจาก
// sessions_count / hours_count / price / max_seats / current_enrollments ที่มีอยู่แล้ว
// จึงไม่ต้องเก็บซ้ำใน DB ให้เสี่ยงข้อมูลไม่ตรงกัน

import { CoursePackageDTO, PackageScheduleInfoDTO } from "@/types/course";

/** ชื่อวันภาษาอังกฤษที่ backend เก็บ → ภาษาไทยแบบสั้น */
const DAY_LABEL: Record<string, string> = {
  Monday: "จันทร์",
  Tuesday: "อังคาร",
  Wednesday: "พุธ",
  Thursday: "พฤหัสบดี",
  Friday: "ศุกร์",
  Saturday: "เสาร์",
  Sunday: "อาทิตย์",
};

const DAY_ORDER = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export function dayLabel(day: string): string {
  return DAY_LABEL[day] ?? day;
}

/**
 * แพ็กเกจส่วนใหญ่ตั้งเวลาเดียวกันหลายวัน (เช่น จ./พ./ศ. 18:00-20:00)
 * ถ้าแสดงทีละบรรทัดจะซ้ำและยาวเกินจำเป็น จึงจับกลุ่มตามช่วงเวลาให้เหลือบรรทัดเดียว
 */
export function groupSchedulesByTime(
  schedules: PackageScheduleInfoDTO[] | undefined
): { days: string[]; startTime: string; endTime: string }[] {
  if (!schedules || schedules.length === 0) return [];

  const buckets = new Map<
    string,
    { days: string[]; startTime: string; endTime: string }
  >();

  for (const s of schedules) {
    const key = `${s.start_time}-${s.end_time}`;
    const existing = buckets.get(key);
    if (existing) {
      if (!existing.days.includes(s.day_of_week)) existing.days.push(s.day_of_week);
    } else {
      buckets.set(key, {
        days: [s.day_of_week],
        startTime: s.start_time,
        endTime: s.end_time,
      });
    }
  }

  const result = Array.from(buckets.values());
  for (const group of result) {
    group.days.sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
  }
  return result;
}

/**
 * เรียงตารางเรียนตามลำดับวันในสัปดาห์ โดยไม่รวบวันที่เวลาตรงกันเข้าด้วยกัน
 * ใช้กับที่ที่ต้องการเห็นทุกวันแยกบรรทัดพร้อมเวลาของตัวเอง
 */
export function sortSchedulesByDay(
  schedules: PackageScheduleInfoDTO[] | undefined
): PackageScheduleInfoDTO[] {
  if (!schedules || schedules.length === 0) return [];

  return [...schedules].sort((a, b) => {
    const dayDiff =
      DAY_ORDER.indexOf(a.day_of_week) - DAY_ORDER.indexOf(b.day_of_week);
    if (dayDiff !== 0) return dayDiff;
    return a.start_time.localeCompare(b.start_time);
  });
}

/** ระยะเวลาต่อครั้ง (ชั่วโมง) */
export function hoursPerSession(pkg: CoursePackageDTO): number {
  if (!pkg.sessions_count || !pkg.hours_count) return 0;
  return pkg.hours_count / pkg.sessions_count;
}

export function seatsTaken(pkg: CoursePackageDTO): number {
  return pkg.current_enrollments ?? 0;
}

export function seatsTotal(pkg: CoursePackageDTO): number {
  return pkg.max_seats ?? 0;
}

export function seatsLeft(pkg: CoursePackageDTO): number {
  return Math.max(0, seatsTotal(pkg) - seatsTaken(pkg));
}

export function isFull(pkg: CoursePackageDTO): boolean {
  return seatsTotal(pkg) > 0 && seatsLeft(pkg) <= 0;
}

/** เหลือน้อยกว่าหรือเท่ากับ 3 ที่ แต่ยังไม่เต็ม — ใช้ขึ้นป้ายเตือน */
export function isAlmostFull(pkg: CoursePackageDTO): boolean {
  const left = seatsLeft(pkg);
  return !isFull(pkg) && seatsTotal(pkg) > 0 && left > 0 && left <= 3;
}

/** สัดส่วนที่นั่งที่ถูกจองแล้ว (0-100) สำหรับวาดแถบความคืบหน้า */
export function seatsFillPercent(pkg: CoursePackageDTO): number {
  const total = seatsTotal(pkg);
  if (total <= 0) return 0;
  return Math.min(100, Math.round((seatsTaken(pkg) / total) * 100));
}

/** จัดรูปแบบราคา — ราคา 0 หมายถึงยังไม่ได้ตั้งราคา ไม่ใช่ "ฟรี" */
export function formatPrice(price: number): string {
  if (!price) return "สอบถามราคา";
  return `${price.toLocaleString("th-TH")} บาท`;
}

/** จัดรูปแบบตัวเลขทศนิยมแบบสั้น (1.5 → "1.5", 2 → "2") */
export function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** ช่วงราคาของคอร์ส สำหรับแสดงในการ์ดสรุป */
export function priceRange(
  packages: CoursePackageDTO[] | undefined
): { min: number; max: number } | null {
  const prices = (packages ?? []).map((p) => p.price).filter((p) => p > 0);
  if (prices.length === 0) return null;
  return { min: Math.min(...prices), max: Math.max(...prices) };
}
