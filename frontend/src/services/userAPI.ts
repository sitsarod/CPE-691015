import { apiFetch } from "@/services/apiClient";
import {
  UserProfileResponseDTO,
  UpdateProfileInput,
  StudentListResponseDTO,
} from "@/types/user";

// ข้อมูลสำหรับให้แอดมินสร้างผู้ใช้ใหม่ (ตรงกับ models.User ฝั่ง backend)
export interface CreateUserInput {
  role: "admin" | "coach" | "customer";
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

// backend ห่อ response ไว้ใน { data: ... } ทุกเส้นของ user
interface Wrapped<T> {
  data: T;
}

// [GET] ดึงข้อมูลโปรไฟล์ผู้ใช้ตาม ID (สำหรับหน้าแก้ไข Profile)
export async function getUserProfileAPI(userId: number): Promise<UserProfileResponseDTO> {
  const res = await apiFetch<Wrapped<UserProfileResponseDTO>>(`/users/${userId}`, {
    method: "GET",
  });
  return res.data;
}

// [GET] ดึงข้อมูลสมาชิก/ผู้ใช้ทั้งหมดในระบบ ( Admin / Coach / Customer )
export async function getAllUsersAPI(): Promise<UserProfileResponseDTO[]> {
  const res = await apiFetch<Wrapped<UserProfileResponseDTO[]>>("/admin/users", {
    method: "GET",
  });
  return res.data || [];
}

// [PATCH] อัปเดตข้อมูลโปรไฟล์ส่วนตัว
export async function updateUserProfileAPI(
  userId: number,
  data: UpdateProfileInput
): Promise<UserProfileResponseDTO> {
  const res = await apiFetch<Wrapped<UserProfileResponseDTO>>(`/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return res.data;
}

// [GET] ดึงรายชื่อนักเรียนทั้งหมด (สำหรับ Coach / Admin)
export async function getActiveStudentsAPI(): Promise<StudentListResponseDTO[]> {
  const res = await apiFetch<Wrapped<StudentListResponseDTO[]>>("/admin/students", {
    method: "GET",
  });
  return res.data || [];
}

// [POST] แอดมินสร้างผู้ใช้ใหม่ (สมาชิก / โค้ช / แอดมิน)
export async function createUserAPI(
  data: CreateUserInput
): Promise<UserProfileResponseDTO> {
  const res = await apiFetch<Wrapped<UserProfileResponseDTO>>("/admin/create", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res.data;
}


/** โปรไฟล์ผู้เรียนแบบเต็ม (ตรงกับ dto.AdminCustomerDetail) */
export interface AdminCustomerDetail {
  /** รหัสประจำตัว เช่น KYS0001 — แสดงอย่างเดียว เซิร์ฟเวอร์ออกให้ตอนสร้างบัญชี */
  memberCode: string;
  nickname: string;
  gender: string;
  birthDate: string;
  phoneNumber: string;
  lineId: string;
  facebook: string;
  parentEmail: string;
  parentPhoneNumber: string;
  status: string;
  faceConsentStatus: string;
}

/** โปรไฟล์โค้ชแบบเต็ม (ตรงกับ dto.AdminCoachDetail) */
export interface AdminCoachDetail {
  /** รหัสประจำตัว เช่น KYC0001 — เดินเลขแยกจากผู้เรียน */
  memberCode: string;
  nickname: string;
  phone: string;
  lineId: string;
  facebook: string;
  uid: string;
  birth_date: string;
  address: string;
  profile_picture: string;
  specialization: string;
  coach_license: string;
  bank_account: string;
  payment_info: string;
  prompt_pay: string;
  payment_type: string;
  pay_rate: number;
}

/** ตรงกับ dto.AdminUserDetailResponse */
export interface AdminUserDetail {
  id: number;
  role: string;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: string;
  customer?: AdminCustomerDetail;
  coach?: AdminCoachDetail;
}

/**
 * [GET] แอดมินดูข้อมูลสมาชิกแบบเต็ม รวมโปรไฟล์ตามบทบาท
 *
 * ต่างจาก getUserProfileAPI ตรงที่เส้นนี้คืนโปรไฟล์โค้ชมาด้วย
 * และคืนฟิลด์ของผู้เรียนครบกว่า (สถานะความยินยอม ฯลฯ)
 */
export async function adminGetUserDetailAPI(userId: number): Promise<AdminUserDetail> {
  const res = await apiFetch<Wrapped<AdminUserDetail>>(`/admin/users/${userId}`, {
    method: "GET",
  });
  return res.data;
}
/** โปรไฟล์ผู้เรียนตอนสร้าง (ตรงกับ dto.AdminCreateCustomerProfile) */
export interface AdminCreateCustomerProfile {
  nickname: string;
  gender: string;
  /** ISO string เช่น 2010-01-15T00:00:00.000Z */
  birthDate: string | null;
  phoneNumber: string;
  lineId?: string;
  facebook?: string;
  parentEmail?: string;
  parentPhoneNumber?: string;
}

/** โปรไฟล์โค้ชตอนสร้าง (ตรงกับ dto.AdminCreateCoachProfile) */
export interface AdminCreateCoachProfile {
  nickname: string;
  phone: string;
  uid: string;
  /** รูปแบบ YYYY-MM-DD */
  birth_date: string;
  address: string;
  specialization: string;
  coach_license: string;
  bank_account: string;
  payment_info: string;
  prompt_pay?: string; // พร้อมเพย์ (ไม่บังคับ)
  payment_type: string;
  pay_rate: number;
  lineId?: string;
  facebook?: string;
  profile_picture?: string;
}

/** ตรงกับ dto.AdminCreateUserRequest */
export interface AdminCreateUserInput {
  role: "admin" | "coach" | "customer";
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  customer?: AdminCreateCustomerProfile;
  coach?: AdminCreateCoachProfile;
}

/**
 * [POST] แอดมินสร้างสมาชิกใหม่พร้อมโปรไฟล์ตามบทบาท
 *
 * เซิร์ฟเวอร์สร้าง user และโปรไฟล์ในทรานแซกชันเดียว ถ้าพลาดตรงไหนจะไม่เกิดอะไรขึ้นเลย
 * ไม่มีทางได้ user ที่ไม่มีโปรไฟล์ค้างในระบบเหมือนวิธีเดิมที่ยิงสองครั้ง
 */
export async function adminCreateUserAPI(
  data: AdminCreateUserInput
): Promise<UserProfileResponseDTO> {
  const res = await apiFetch<Wrapped<UserProfileResponseDTO>>("/admin/users", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res.data;
}

/** ข้อมูลโปรไฟล์โค้ชที่แอดมินแก้ได้ (ตรงกับ dto.AdminUpdateCoachProfile) */
export interface AdminUpdateCoachProfile {
  nickname?: string;
  phone?: string;
  lineId?: string;
  facebook?: string;
  uid?: string;
  birth_date?: string;
  address?: string;
  profile_picture?: string;
  specialization?: string;
  coach_license?: string;
  bank_account?: string;
  payment_info?: string;
  prompt_pay?: string;
  payment_type?: string;
  pay_rate?: number;
}

/** ข้อมูลโปรไฟล์ผู้เรียนที่แอดมินแก้ได้ (ตรงกับ dto.AdminUpdateCustomerProfile) */
export interface AdminUpdateCustomerProfile {
  nickname?: string;
  gender?: string;
  birthDate?: string;
  phoneNumber?: string;
  lineId?: string;
  facebook?: string;
  parentEmail?: string;
  parentPhoneNumber?: string;
  status?: string;
}

/** ตรงกับ dto.AdminUpdateUserRequest */
export interface AdminUpdateUserInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  customer?: AdminUpdateCustomerProfile;
  coach?: AdminUpdateCoachProfile;
}

/**
 * [PATCH] แอดมินแก้ข้อมูลสมาชิก รวมข้อมูลตัวตนและการเงินที่เจ้าตัวแก้เองไม่ได้
 *
 * รับ users.id (ไม่ใช่ coaches.id หรือ customers.id)
 */
export async function adminUpdateUserAPI(
  userId: number,
  data: AdminUpdateUserInput
): Promise<void> {
  await apiFetch<{ message: string }>(`/admin/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// [DELETE] แอดมินลบผู้ใช้ตาม ID
export async function deleteUserAPI(userId: number): Promise<void> {
  await apiFetch<{ message: string }>(`/admin/${userId}`, {
    method: "DELETE",
  });
}
export type { StudentListResponseDTO, UserProfileResponseDTO };