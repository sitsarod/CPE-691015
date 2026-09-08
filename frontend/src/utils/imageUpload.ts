// ยูทิลิตี้กลางสำหรับตรวจสอบและอัปโหลดไฟล์รูปขึ้น Cloudinary (ผ่าน endpoint /upload ของ backend)

// จำกัดขนาดให้ตรงกับ backend (controllers/upload.go: MaxImageUploadBytes = 5 MB)
// ถ้าตั้งเกินกว่านี้ ไฟล์จะผ่าน client แต่ไป reject ที่ server ทำให้ผู้ใช้งง
export const MAX_UPLOAD_MB = 5;

// ชนิดรูปที่ backend ยอมรับ — ต้องตรงกับ imageExtByType ใน controllers/upload.go
// ไม่รวม svg (ฝัง <script> ได้ = ช่องทาง XSS) และไม่รวม gif
// (ภาพเคลื่อนไหว 256 สี คุณภาพต่ำ ไฟล์ใหญ่ ไม่เหมาะกับรูปถ่าย)
export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";

/**
 * ตรวจขนาดไฟล์ ถ้าเกิน MAX_UPLOAD_MB จะคืนข้อความ error (ไทย) ไม่งั้นคืน null
 */
export function validateImageSize(file: File): string | null {
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(1);
    return `ไฟล์มีขนาด ${sizeMB} MB ซึ่งเกินขีดจำกัด ${MAX_UPLOAD_MB} MB\nกรุณาย่อขนาดรูปหรือบีบอัดก่อนอัปโหลด`;
  }
  return null;
}

// ชนิดรูปที่รับได้ — ต้องตรงกับ IMAGE_ACCEPT และ backend
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * ตรวจว่าไฟล์เป็นรูปจริงและขนาดไม่เกิน (เช็คฝั่ง client ก่อนยิงไป backend)
 * — เช็คชนิด: ต้องเป็น jpg/png/webp เท่านั้น (ไม่รับ svg = XSS, ไม่รับ gif)
 * — เช็คขนาด: ไม่เกิน MAX_UPLOAD_MB
 *
 * หมายเหตุ: นี่เป็นแค่ด่านแรก backend ยังตรวจซ้ำจากเนื้อไฟล์จริงอีกชั้น (ปลอม type มาไม่ผ่าน)
 */
export function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return "ชนิดไฟล์นี้ไม่รองรับ กรุณาเลือกไฟล์ .jpg .png หรือ .webp";
  }
  return validateImageSize(file);
}

/**
 * อัปโหลดรูปขึ้น Cloudinary ผ่าน POST /upload แล้วคืน secure URL
 * @param folder โฟลเดอร์ย่อยที่ backend อนุญาต: "profile" | "slip" | "news" | "home"
 */
export async function uploadImage(file: File, folder: string): Promise<string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const form = new FormData();
  form.append("file", file);
  form.append("folder", folder);

  const baseUrl = process.env.NEXT_PUBLIC_API_URL;
  const res = await fetch(`${baseUrl}/upload`, {
    method: "POST",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: form,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "อัปโหลดรูปภาพไม่สำเร็จ");
  }
  return data.url as string;
}
