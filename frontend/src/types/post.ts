// ประเภทข้อมูลของ "โพสต์" (รูป/วิดีโอที่นักเรียนถูกแท็กอยู่) — แสดงในแท็บ Posts ของโปรไฟล์

export type PostType = "photo" | "video";

export interface PostItem {
  id: number;
  type: PostType;
  media_url: string;
  created_at: string;
}
