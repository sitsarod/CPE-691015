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

// [DELETE] แอดมินลบผู้ใช้ตาม ID
export async function deleteUserAPI(userId: number): Promise<void> {
  await apiFetch<{ message: string }>(`/admin/${userId}`, {
    method: "DELETE",
  });
}
export type { StudentListResponseDTO, UserProfileResponseDTO };