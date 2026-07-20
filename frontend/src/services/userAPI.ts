import { apiFetch } from "@/services/apiClient";


export interface UserProfileResponseDTO {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isStudent: boolean;
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
}

// [GET] ดึงข้อมูลโปรไฟล์ผู้ใช้ตาม ID
export async function getUserProfileAPI(userId: number): Promise<UserProfileResponseDTO> {
  return await apiFetch<UserProfileResponseDTO>(`/users/${userId}`, {
    method: "GET",
  });
}

// [PATCH] อัปเดตข้อมูลโปรไฟล์ส่วนตัว
export async function updateUserProfileAPI(
  userId: number, 
  data: UpdateProfileInput
): Promise<UserProfileResponseDTO> {
  return await apiFetch<UserProfileResponseDTO>(`/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// [GET] ดึงรายชื่อนักเรียนทั้งหมด (สำหรับ Coach / Admin)
export async function getActiveStudentsAPI(): Promise<StudentListResponseDTO[]> {
  return await apiFetch<StudentListResponseDTO[]>("/users/students", {
    method: "GET",
  });
}