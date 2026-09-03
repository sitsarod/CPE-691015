// frontend/src/services/faceImageAPI.ts
import { apiFetch, apiFetchBlob } from "@/services/apiClient";
import { AdminFaceImage, FaceImage, FaceImageStatus, FacePose } from "@/types/faceImage";

/** [GET] รูปใบหน้าของตัวเองทั้งหมด พร้อมสถานะแต่ละท่า */
export async function fetchMyFaceImages(): Promise<FaceImage[]> {
  const res = await apiFetch<{ data: FaceImage[] }>("/face-images/me");
  return res.data ?? [];
}

/** [POST] อัปโหลดรูปหนึ่งท่า — ตอบ pending ทันที แล้ว worker สร้าง embedding ต่อเบื้องหลัง */
export async function uploadFaceImage(pose: FacePose, photo: Blob): Promise<FaceImage> {
  const form = new FormData();
  form.append("pose", pose);
  // ต้องมี filename ใน part ไม่งั้น c.FormFile ฝั่ง Go อ่านไม่เจอ (ชื่อไม่ถูกใช้ต่อ)
  form.append("photo", photo, `face-${pose}.jpg`);

  const res = await apiFetch<{ message: string; data: FaceImage }>("/face-images", {
    method: "POST",
    body: form,
  });
  return res.data;
}

/** [DELETE] ลบรูปหนึ่งใบ (ใช้ตอนถ่ายใหม่) */
export async function deleteFaceImage(id: number): Promise<void> {
  await apiFetch<{ message: string }>(`/face-images/${id}`, { method: "DELETE" });
}

/**
 * [GET] ดึงเนื้อรูปมาแสดง — ต้องเป็น blob เพราะไฟล์อยู่บน Cloudinary โหมด authenticated
 * ที่เปิดจาก URL ไม่ได้ ต้องผ่าน backend ที่ตรวจสิทธิ์ (แนบ token)
 *
 * ⚠️ ผู้เรียกต้อง URL.revokeObjectURL() ตอนเลิกใช้
 */
export async function fetchFaceImageObjectURL(id: number): Promise<string> {
  const blob = await apiFetchBlob(`/face-images/${id}/raw`);
  return URL.createObjectURL(blob);
}

// ─── ฝั่งแอดมิน ───

/** [GET] คิวรูปที่ต้องตรวจ — ไม่ส่ง status = เอาทุกสถานะ */
export async function fetchFaceImagesForAdmin(
  status?: FaceImageStatus
): Promise<AdminFaceImage[]> {
  const qs = status ? `?status=${status}` : "";
  const res = await apiFetch<{ data: AdminFaceImage[] }>(`/admin/face-images${qs}`);
  return res.data ?? [];
}

/** [PATCH] บันทึกผลการตรวจ — reject ต้องมีเหตุผล และจะลบไฟล์ออกจากคลาวด์ทันที */
export async function reviewFaceImage(
  id: number,
  action: "approve" | "reject",
  reason?: string
): Promise<void> {
  await apiFetch<{ message: string }>(`/admin/face-images/${id}/review`, {
    method: "PATCH",
    body: JSON.stringify({ action, reason: reason ?? "" }),
  });
}
