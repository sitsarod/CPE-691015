// frontend/src/services/courtAPI.ts
// จัดการสนาม (admin): ดู/เพิ่ม/แก้ชื่อ/ลบ
import { apiFetch } from "@/services/apiClient";

export interface Court {
  ID: number;
  name: string;
  is_active: boolean;
}

// [GET] รายการสนามทั้งหมด
export async function getCourts(): Promise<Court[]> {
  const res = await apiFetch<Court[]>("/courts", { method: "GET" });
  return res || [];
}

// [POST] เพิ่มสนามใหม่
export async function createCourt(name: string): Promise<Court> {
  return await apiFetch<Court>("/courts", { method: "POST", body: JSON.stringify({ name }) });
}

// [PATCH] แก้ชื่อ/สถานะสนาม
export async function updateCourt(id: number, data: { name?: string; is_active?: boolean }): Promise<Court> {
  return await apiFetch<Court>(`/courts/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

// [DELETE] ลบสนาม
export async function deleteCourt(id: number): Promise<void> {
  await apiFetch<{ message: string }>(`/courts/${id}`, { method: "DELETE" });
}
