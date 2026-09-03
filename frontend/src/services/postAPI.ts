// frontend/src/services/postAPI.ts
import { apiFetch } from "@/services/apiClient";
import type { PostItem } from "@/types/post";

// [GET] โพสต์ (รูป+วิดีโอ) ทั้งหมดที่นักเรียนที่ล็อกอินอยู่ถูกแท็กไว้ เรียงล่าสุดก่อน
export async function fetchMyPosts(): Promise<PostItem[]> {
  const res = await apiFetch<{ data: PostItem[] }>("/students/posts/me");
  return res.data ?? [];
}
