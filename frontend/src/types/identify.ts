// frontend/src/types/identify.ts

/**
 * ข้อมูลที่ได้จากขั้นตอน "ค้นหาบัญชี" ในหน้าลืมรหัสผ่าน
 *
 * ⚠️ backend คืนเฉพาะค่าที่ปิดบังแล้ว (masked) เพราะ POST /users/find
 * เรียกได้โดยไม่ต้องล็อกอิน ถ้าคืนอีเมล/เบอร์เต็มจะกลายเป็นช่องกวาดรายชื่อสมาชิก
 *
 * ค่าที่ได้ตรงนี้ใช้ "แสดงให้เจ้าของยืนยันว่าใช่บัญชีตัวเอง" เท่านั้น
 * ห้ามเอาไปส่งกลับให้ backend เพื่อระบุตัวตน — ขั้นตอนถัดไปต้องใช้
 * identifier ที่ผู้ใช้พิมพ์เองแทน
 */
export interface IdentifyUserData {
  /** เช่น s*****i@gmail.com */
  maskedEmail?: string;
  /** เช่น 08x-xxx-5678 (ว่างถ้าบัญชีไม่มีเบอร์) */
  maskedPhone?: string;

  /** identifier ที่ผู้ใช้พิมพ์เข้ามา เก็บไว้ใช้ในขั้นตอนถัดไป */
  identifier?: string;

  resetToken?: string;
}

export type IdentifyNextHandler = (data?: IdentifyUserData) => void;
