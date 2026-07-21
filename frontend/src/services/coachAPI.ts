// frontend/src/services/coachAPI.ts
import {
  CoachProfile,
  AvailabilitySlot,
  WorkScheduleItem,
  CoachWageEntry
} from "@/types/coach";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL;

// ดึงข้อมูลโปรไฟล์ของโค้ชที่ล็อกอินอยู่ (resolve coach_id จาก JWT ที่ backend เอง)
export async function fetchMyCoachProfile(token: string): Promise<CoachProfile> {
  const response = await fetch(`${BASE_URL}/coaches/me`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    }
  });
  const resData = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || "ไม่สามารถดึงข้อมูลโปรไฟล์โค้ชได้");
  }
  return resData;
}

// ดึงตารางเวลาว่างของโค้ช
export async function fetchCoachAvailability(coachId: number, token: string): Promise<AvailabilitySlot[]> {
  const response = await fetch(`${BASE_URL}/coaches/${coachId}/availability`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    }
  });
  const resData = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || "ไม่สามารถดึงข้อมูลเวลาว่างได้");
  }
  return resData || [];
}

// บันทึกตารางเวลาว่างทั้งชุด (แทนที่ของเดิมทั้งหมด)
export async function updateCoachAvailability(coachId: number, slots: AvailabilitySlot[], token: string): Promise<AvailabilitySlot[]> {
  const response = await fetch(`${BASE_URL}/coaches/${coachId}/availability`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({ availabilities: slots })
  });
  const resData = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || "บันทึกตารางเวลาว่างไม่สำเร็จ");
  }
  return resData || [];
}

// ดึงตารางงาน (คาบสอน) ของโค้ช
export async function fetchCoachSchedules(coachId: number, token: string): Promise<WorkScheduleItem[]> {
  const response = await fetch(`${BASE_URL}/coaches/${coachId}/work-schedules`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    }
  });
  const resData = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || "ไม่สามารถดึงข้อมูลตารางงานได้");
  }
  return resData || [];
}

// ดึงประวัติค่าจ้างของโค้ช
export async function fetchCoachWages(coachId: number, token: string): Promise<CoachWageEntry[]> {
  const response = await fetch(`${BASE_URL}/coaches/${coachId}/expenses`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    }
  });
  const resData = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || "ไม่สามารถดึงข้อมูลค่าจ้างได้");
  }
  return resData.data || [];
}
