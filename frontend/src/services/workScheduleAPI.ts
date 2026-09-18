// frontend/src/services/workScheduleAPI.ts
// เรียก endpoint ฝั่ง admin สำหรับดู/สร้าง/ลบตารางสอน (assign งานให้โค้ช)
import { apiFetch } from "@/services/apiClient";

// รายการตารางสอน 1 คาบ (ตรงกับ models.WorkSchedule ที่ preload Coach + Course มา)
export interface WorkScheduleAdmin {
  ID: number;
  date: string; // อาจเป็น "2026-08-17T00:00:00Z" — ใช้ .split("T")[0] เวลาเทียบวัน
  start_time: string;
  end_time: string;
  description: string;
  court_number: string;
  coach_id: number;
  course_id: number;
  course?: { course_name: string };
}

// ข้อมูลตอน assign คาบสอนใหม่ (ตรงกับ dto.CreateWorkScheduleRequest)
export interface CreateWorkScheduleInput {
  coach_id: number;
  course_id: number;
  date: string; // YYYY-MM-DD
  start_time: string; // HH:MM
  end_time: string; // HH:MM
  court_number: string;
  description: string;
  ignore_availability?: boolean;
  package_id?: number;
  package_schedule_id?: number;
}

// โค้ชที่ถูก assign ให้คาบเรียนหนึ่ง
export interface WeekSessionCoach {
  work_schedule_id: number;
  coach_id: number;
  coach_name: string;
  court_number: string;
  /** มอบหมายนอกกฎปกติ — แอดมินติ๊กฉุกเฉิน หรือโค้ชสแกนเองหน้างาน */
  is_emergency: boolean;
}

// คาบเรียน 1 คาบในสัปดาห์ (ขยายจาก PackageSchedule เป็นวันที่จริง)
export interface WeekSession {
  package_id: number;
  package_schedule_id: number;
  course_id: number;
  course_name: string;
  date: string; // YYYY-MM-DD
  day_of_week: string;
  start_time: string;
  end_time: string;
  assigned_coaches: WeekSessionCoach[];
  /** จำนวนนักเรียนที่ยืนยันมาเรียน (going) — รวมข้าม package ของคลาสนี้แล้ว */
  going_count: number;
  /** จำนวนนักเรียนที่มีสิทธิ์เรียนคาบนี้ทั้งหมด */
  total_count: number;
}

// [GET] ดึงคาบเรียนของทุก package ในสัปดาห์ (เฉพาะที่มี enrollment active)
export async function getWeekSessions(weekStart: string): Promise<WeekSession[]> {
  const res = await apiFetch<WeekSession[]>(`/schedule-sessions?week_start=${weekStart}`, { method: "GET" });
  // เซสชันที่ยังไม่มีโค้ช backend ส่ง assigned_coaches เป็น null — การันตีเป็น array เสมอ
  // (จอนี้สร้างมาเพื่อโชว์เซสชันที่ยังไม่มอบหมายโดยเฉพาะ เคสนี้จึงเกิดบ่อย)
  return (res || []).map(s => ({ ...s, assigned_coaches: s.assigned_coaches ?? [] }));
}

// [GET] ดึงตารางสอนของทุกโค้ช (admin) — ใช้เรนเดอร์ปฏิทินรวมทั้งสัปดาห์
export async function getAllWorkSchedules(): Promise<WorkScheduleAdmin[]> {
  const res = await apiFetch<WorkScheduleAdmin[]>("/work-schedules", { method: "GET" });
  return res || [];
}

// [POST] admin assign คาบสอนใหม่ให้โค้ช (backend ตรวจเวลาว่าง/เวลาชน/สนามซ้อนให้เอง)
export async function createWorkSchedule(data: CreateWorkScheduleInput): Promise<WorkScheduleAdmin> {
  return await apiFetch<WorkScheduleAdmin>("/work-schedules", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// [DELETE] admin ลบ/ยกเลิกคาบสอน
export async function deleteWorkSchedule(id: number): Promise<void> {
  await apiFetch<{ message: string }>(`/work-schedules/${id}`, { method: "DELETE" });
}
