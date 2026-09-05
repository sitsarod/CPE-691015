// frontend/src/services/detectAPI.ts
import { apiFetch } from "@/services/apiClient";
import type { AssignResult, UploadPhotoPostResult, UploadVideoResult } from "@/types/detect";

// [POST] อัปโหลดวิดีโอ — backend รันการตรวจจับใบหน้าจำลอง (mock) ให้อัตโนมัติ คืนรายชื่อที่เจอเบื้องต้น
export async function uploadDetectVideo(file: File): Promise<UploadVideoResult> {
  const form = new FormData();
  form.append("video", file, file.name);
  const res = await apiFetch<{ message: string; data: UploadVideoResult }>("/videos", {
    method: "POST",
    body: form,
  });
  return res.data;
}

// [POST] อัปโหลดรูป — ส่ง courseId ไปด้วยเพื่อให้ระบบจำแนกใบหน้าเทียบกับนักเรียนของคอร์สนั้น
// ผลที่ได้เป็นแค่ "ข้อเสนอ" ยังไม่ได้แท็กใครจริง ต้องยืนยันผ่าน assignPhotoStudents อีกที
export async function uploadDetectPhoto(file: File, courseId: number): Promise<UploadPhotoPostResult> {
  const form = new FormData();
  form.append("photo", file, file.name);
  form.append("course_id", String(courseId));
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
