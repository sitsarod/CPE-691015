// frontend/src/services/coachAPI.ts
import {
  CoachProfile,
  CoachPaymentType,
  AvailabilitySlot,
  WorkScheduleItem,
  CoachWageEntry
} from "@/types/coach";
import { apiFetch } from "@/services/apiClient";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL;

// ===== ส่วนของแอดมิน: จัดการข้อมูลโค้ช (list / create / update / delete) =====

// ข้อมูลโค้ชแบบย่อ ใช้ในหน้าตารางรายชื่อ (ตรงกับ dto.CoachResponse)
export interface CoachListItem {
  id: number;
  user_id: number;
  firstName: string;
  lastName: string;
  email: string;
  nickname: string;
  specialization: string;
  coach_license: string;
  profile_picture: string;
  phone: string;
  lineId?: string;
  facebook?: string;
}

// ข้อมูลสำหรับสร้างโค้ชใหม่ (ตรงกับ dto.CreateCoachRequest — แอดมินกรอกทั้งหมด)
export interface CreateCoachInput {
  user_id: number;
  phone: string;
  lineId?: string;   // ไม่บังคับ
  facebook?: string; // ไม่บังคับ
  uid: string;
  address: string;
  birth_date: string; // YYYY-MM-DD
  nickname: string;
  profile_picture: string;
  specialization: string;
  coach_license: string;
  bank_account: string;
  payment_info: string;
  prompt_pay?: string; // พร้อมเพย์ (ไม่บังคับ)
  payment_type: CoachPaymentType;
  pay_rate: number;
}

// ข้อมูลที่แก้ไขได้ผ่าน PATCH /coaches/:id (ข้อมูลทั่วไป)
/**
 * ข้อมูลที่ "โค้ชแก้เองได้" ผ่าน PATCH /coaches/:id
 *
 * ตามนโยบายของทีม เจ้าตัวแก้ได้เฉพาะช่องทางติดต่อ
 * ส่วนชื่อเล่น บัญชีธนาคาร และข้อมูลจ่ายเงิน ย้ายไปให้แอดมินแก้ผ่าน
 * adminUpdateUserAPI (PATCH /admin/users/:id) แล้ว
 */
export interface UpdateCoachInput {
  phone?: string;
  lineId?: string;
  facebook?: string;
  address?: string;
  profile_picture?: string;
}

/**
 * ข้อมูลรับเงินที่โค้ชแก้เองได้ผ่าน PATCH /coaches/:id/bank
 *
 * แยก endpoint จาก updateCoachAPI เพราะเส้นนี้ต้องยืนยันรหัสผ่านซ้ำ
 * (step-up authentication) — กันกรณีคนอื่นได้ session ของโค้ชไปแล้วเปลี่ยน
 * ปลายทางเงินเดือน ซึ่งกว่าจะรู้ตัวก็สิ้นเดือนแล้ว
 *
 * แอดมินเรียกเส้นนี้ไม่ได้ (backend คืน 403) เพราะไม่รู้รหัสผ่านโค้ชอยู่แล้ว
 */
export interface UpdateCoachBankInput {
  /** รหัสผ่านปัจจุบันของโค้ช ใช้ยืนยันตัวตนเท่านั้น ไม่ได้เปลี่ยนรหัสผ่าน */
  currentPassword: string;
  bank_account: string;
  payment_info: string;
  prompt_pay?: string; // พร้อมเพย์ (ไม่บังคับ)
}

// [PATCH] โค้ชแก้ข้อมูลบัญชีรับเงินของตัวเอง (ต้องยืนยันรหัสผ่าน)
export async function updateCoachBankAccountAPI(
  coachId: number,
  data: UpdateCoachBankInput
): Promise<CoachProfile> {
  return await apiFetch<CoachProfile>(`/coaches/${coachId}/bank`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// ข้อมูลที่แอดมินแก้ได้ผ่าน PATCH /coaches/:id/level (ระดับ + ค่าจ้าง)
export interface AdminUpdateCoachInput {
  specialization?: string;
  coach_license?: string;
  payment_type?: CoachPaymentType;
  pay_rate?: number;
}

interface Wrapped<T> {
  data: T;
}

// [GET] แอดมินดึงรายชื่อโค้ชทั้งหมด
export async function getAllCoachesAPI(): Promise<CoachListItem[]> {
  const res = await apiFetch<Wrapped<CoachListItem[]>>("/coaches", {
    method: "GET",
  });
  return res.data || [];
}

// [GET] ดึงข้อมูลโค้ช 1 คนแบบละเอียด (ใช้กับหน้ารายละเอียด/แก้ไข)
export async function getCoachDetailAPI(coachId: number): Promise<CoachProfile> {
  return await apiFetch<CoachProfile>(`/coaches/${coachId}`, { method: "GET" });
}

// [POST] แอดมินสร้างโปรไฟล์โค้ชใหม่ (ต้องมี user_id ของผู้ใช้ที่มี role = coach อยู่แล้ว)
export async function createCoachAPI(
  data: CreateCoachInput
): Promise<CoachListItem> {
  return await apiFetch<CoachListItem>("/coaches", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// [PATCH] แก้ไขข้อมูลทั่วไปของโค้ช
export async function updateCoachAPI(
  coachId: number,
  data: UpdateCoachInput
): Promise<CoachListItem> {
  return await apiFetch<CoachListItem>(`/coaches/${coachId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// [PATCH] แอดมินแก้ระดับ (specialization) และค่าจ้างต่อครั้งของโค้ช
export async function adminUpdateCoachLevelAPI(
  coachId: number,
  data: AdminUpdateCoachInput
): Promise<CoachListItem> {
  return await apiFetch<CoachListItem>(`/coaches/${coachId}/level`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// [DELETE] แอดมินลบโปรไฟล์โค้ช
export async function deleteCoachAPI(coachId: number): Promise<void> {
  await apiFetch<{ message: string }>(`/coaches/${coachId}`, {
    method: "DELETE",
  });
}

/**
 * ดึงโปรไฟล์ของโค้ชที่ล็อกอินอยู่ โดยให้ apiFetch แนบ token ให้เอง
 *
 * ต่างจาก fetchMyCoachProfile ด้านล่างตรงที่ไม่ต้องรับ token เข้ามาเป็นพารามิเตอร์
 * (ตัวเก่ายังอยู่เพราะมีหน้าอื่นเรียกใช้ ค่อยย้ายมาใช้ตัวนี้ทีหลัง)
 */
export async function getMyCoachProfileAPI(): Promise<CoachProfile> {
  return await apiFetch<CoachProfile>("/coaches/me", { method: "GET" });
}

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

// ดึงข้อมูลโค้ช 1 คนตาม id (admin หรือเจ้าของ) — ใช้ดึง payment_type/pay_rate มาคำนวณค่าจ้าง
export async function fetchCoachById(coachId: number, token: string): Promise<CoachProfile> {
  const response = await fetch(`${BASE_URL}/coaches/${coachId}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    }
  });
  const resData = await response.json();
  if (!response.ok) {
    throw new Error(resData.error || "ไม่สามารถดึงข้อมูลโค้ชได้");
  }
  return resData;
}

// แถวเวลาว่างแบบรวมทุกโค้ช (มี coach_id ติดมาด้วย) จาก endpoint /coach-availabilities
export interface CoachAvailabilityRow {
  coach_id: number;
  day_of_week: string;
  start_time: string;
  end_time: string;
}

// [GET] ดึงเวลาว่างของโค้ชทุกคนในครั้งเดียว (admin) — เลี่ยงการยิงทีละคน (N+1)
export async function fetchAllCoachAvailabilities(): Promise<CoachAvailabilityRow[]> {
  const res = await apiFetch<CoachAvailabilityRow[]>("/coach-availabilities", { method: "GET" });
  return res || [];
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
