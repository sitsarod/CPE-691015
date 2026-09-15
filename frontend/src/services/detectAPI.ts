// frontend/src/services/detectAPI.ts
import { apiFetch } from "@/services/apiClient";
import type { AssignResult, UploadPhotoPostResult, UploadVideoResult } from "@/types/detect";

// [POST] อัปโหลดวิดีโอ — ระบบจำแนกใบหน้าเทียบกับนักเรียนทั้งโรงเรียนให้อัตโนมัติ ไม่ต้องเลือกคอร์ส
// (เหมือน uploadDetectPhoto ทุกอย่าง) ผลที่ได้เป็นแค่ "ข้อเสนอ" ยังไม่ได้แท็กใครจริง
// ต้องยืนยันผ่าน assignVideoStudents อีกที
export async function uploadDetectVideo(file: File): Promise<UploadVideoResult> {
  const form = new FormData();
  form.append("video", file, file.name);
  const res = await apiFetch<{ message: string; data: UploadVideoResult }>("/videos", {
    method: "POST",
    body: form,
  });
  return res.data;
}

// [POST] อัปโหลดรูป — ระบบจำแนกใบหน้าเทียบกับนักเรียนทั้งโรงเรียนให้อัตโนมัติ ไม่ต้องเลือกคอร์ส
// ผลที่ได้เป็นแค่ "ข้อเสนอ" ยังไม่ได้แท็กใครจริง ต้องยืนยันผ่าน assignPhotoStudents อีกที
export async function uploadDetectPhoto(file: File): Promise<UploadPhotoPostResult> {
  const form = new FormData();
  form.append("photo", file, file.name);
  const res = await apiFetch<{ message: string; data: UploadPhotoPostResult }>("/photo-posts", {
    method: "POST",
    body: form,
  });
  return res.data;
}

// [POST] ยืนยัน/แก้ไขรายชื่อผู้เรียนในวิดีโอ — ส่งรายชื่อทั้งชุดทับของเดิมเสมอ (ไม่ใช่ diff)
export async function assignVideoStudents(rawVideoId: number, studentIds: number[]): Promise<AssignResult> {
  return apiFetch<AssignResult>(`/videos/${rawVideoId}/assign`, {
    method: "POST",
    body: JSON.stringify({ student_ids: studentIds }),
  });
}

// [POST] ยืนยัน/แก้ไขรายชื่อผู้เรียนในรูป — ส่งรายชื่อทั้งชุดทับของเดิมเสมอ (ไม่ใช่ diff)
export async function assignPhotoStudents(rawPhotoId: number, studentIds: number[]): Promise<AssignResult> {
  return apiFetch<AssignResult>(`/photo-posts/${rawPhotoId}/assign`, {
    method: "POST",
    body: JSON.stringify({ student_ids: studentIds }),
  });
}
