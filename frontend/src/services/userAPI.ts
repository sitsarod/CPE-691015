import { apiFetch } from "@/services/apiClient";

export interface UserProfileResponseDTO {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isStudent: boolean;

  nickname?: string;
  phoneNumber?: string;
  birthDate?: string;
  gender?: string;
  parentEmail?: string;
  parentPhoneNumber?: string;
  status?: string;
}

export interface StudentListResponseDTO {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  nickname: string;
  phoneNumber: string;
}

export interface UpdateProfileInput {
  email?: string;
  firstName?: string;
  lastName?: string;
  nickname?: string;
  phoneNumber?: string;
  parentEmail?: string;
  parentPhoneNumber?: string;
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