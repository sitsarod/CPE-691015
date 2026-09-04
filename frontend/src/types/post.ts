// ประเภทข้อมูลของ "โพสต์" (รูป/วิดีโอที่นักเรียนถูกแท็กอยู่) — แสดงในแท็บ Posts ของโปรไฟล์

export type PostType = "photo" | "video";

// ไม่มี media_url ตรงๆ ให้ใช้เป็น <img src>/<video src> ได้ — เนื้อไฟล์ต้องผ่าน endpoint
// ที่เช็คสิทธิ์ก่อนเสมอ (แนบ token) ประกอบ path เองจาก type + raw_id แล้ว fetch เป็น blob
// (ดู services/postAPI.ts: fetchPostObjectURL และ components/PostMediaThumb.tsx)
export interface PostItem {
  id: number;
  type: PostType;
  raw_id: number;
  created_at: string;
}
