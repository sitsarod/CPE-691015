// ยูทิลิตี้กลางสำหรับตรวจสอบไฟล์รูปก่อนอัปโหลดขึ้น Cloudinary
// (Cloudinary free plan รับไฟล์รูปสูงสุด 10 MB)

export const MAX_UPLOAD_MB = 10;

/**
 * ตรวจขนาดไฟล์ ถ้าเกิน MAX_UPLOAD_MB จะคืนข้อความ error (ไทย) ไม่งั้นคืน null
 * ใช้เตือนผู้ใช้ "ก่อน" ยิงไฟล์ไป backend
 */
export function validateImageSize(file: File): string | null {
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(1);
    return `ไฟล์มีขนาด ${sizeMB} MB ซึ่งเกินขีดจำกัด ${MAX_UPLOAD_MB} MB\nกรุณาย่อขนาดรูปหรือบีบอัดก่อนอัปโหลด`;
  }
  return null;
}
