// frontend/src/services/postAPI.ts
import { apiFetch, apiFetchBlob } from "@/services/apiClient";
import type { PostItem, PostType } from "@/types/post";

// [GET] โพสต์ (รูป+วิดีโอ) ทั้งหมดที่นักเรียนที่ล็อกอินอยู่ถูกแท็กไว้ เรียงล่าสุดก่อน
export async function fetchMyPosts(): Promise<PostItem[]> {
  const res = await apiFetch<{ data: PostItem[] }>("/students/posts/me");
  return res.data ?? [];
}

/**
 * [GET] ดึงเนื้อรูป/วิดีโอของโพสต์มาแสดง — ต้องเป็น blob เพราะไฟล์เก็บแบบ private
 * ต้องแนบ token ซึ่ง <img>/<video src> ทำไม่ได้ (เหมือน fetchFaceImageObjectURL)
 *
 * ⚠️ ผู้เรียกต้อง URL.revokeObjectURL() ตอนเลิกใช้
 */
export async function fetchPostObjectURL(type: PostType, rawId: number): Promise<string> {
  const path = type === "video" ? `/videos/${rawId}/raw` : `/photo-posts/${rawId}/raw`;
  const blob = await apiFetchBlob(path);
  return URL.createObjectURL(blob);
}
