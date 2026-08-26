import { AuthResponseDTO } from "@/types/auth";

/**
 * ที่เดียวที่เขียนและล้างข้อมูลผู้ใช้ใน localStorage
 *
 * ─── ปัญหาที่แก้ ───
 *
 * เดิมหน้าเข้าสู่ระบบกับหน้าสมัครสมาชิกต่างคนต่างเขียนคีย์เอง เจ็ดบรรทัดคล้าย ๆ กัน
 * แต่ไม่เหมือนกันเป๊ะ — หน้าสมัครสมาชิก "ลืมเขียน lastName"
 *
 * ผลคือ แถบเมนูด้านข้างทั้งสามบทบาทกับหน้าจ่ายเงินของโค้ช ซึ่งอ่าน lastName
 * จะแสดงแค่ชื่อต้นหลังสมัครเสร็จ อาการแบบนี้หายากมากเพราะเกิดเฉพาะเส้นทางเดียว
 * และหายไปเองทันทีที่ผู้ใช้ล็อกอินใหม่
 *
 * ⚠️ ถ้าจะเพิ่มคีย์ใหม่ ให้เพิ่มที่นี่ที่เดียว อย่าไปเขียนตรง ๆ ในหน้าอื่น
 */

/** คีย์ทั้งหมดที่ระบบเก็บไว้ รวมไว้ที่เดียวเพื่อให้ล้างได้ครบตอนออกจากระบบ */
const SESSION_KEYS = [
  "token",
  "refresh_token",
  "role",
  "firstName",
  "lastName",
  "email",
  "user_id",

  // ─── คีย์เก่าที่เลิกใช้แล้ว แต่ยังต้องล้าง ───
  //
  // เครื่องของคนที่เคยใช้เวอร์ชันก่อนอาจมีค่าพวกนี้ค้างอยู่ ถ้าไม่ล้าง
  // ข้อมูลส่วนตัวจะค้างในเครื่องต่อไปเรื่อย ๆ แม้ออกจากระบบแล้ว
  //
  // user_name / user_email ไม่เคยถูกเขียนโดยระบบเลย แต่โค้ดเก่าพยายามลบมัน
  // เก็บไว้ในรายการเพื่อความปลอดภัย ลบทิ้งได้เมื่อมั่นใจว่าไม่มีเครื่องไหนเหลือแล้ว
  "user_name",
  "user_email",
  "qrImage",
] as const;

/**
 * บันทึกข้อมูลผู้ใช้หลังเข้าสู่ระบบหรือสมัครสมาชิกสำเร็จ
 *
 * ⚠️ ไม่เก็บ qrImage แล้ว
 *
 * ของเดิมเก็บไว้ แต่ตรวจทั้งโปรเจกต์แล้วไม่มีใครอ่านค่านั้นเลยสักที่
 * แถมหน้าเข้าสู่ระบบยังเผลอเก็บข้อความ "data:image/png;base64,..." ตรง ๆ
 * เป็นค่าสำรองตอนไม่มีรูป ซึ่งไม่ใช่รูปจริงและจะขึ้นเป็นรูปเสียถ้ามีคนเอาไปแสดง
 *
 * QR ประจำตัวดึงจาก API ตอนที่ต้องใช้ได้อยู่แล้ว ไม่ต้องเก็บค้างไว้
 */
export function saveSession(data: AuthResponseDTO): void {
  localStorage.setItem("token", data.token);
  if (data.refreshToken) localStorage.setItem("refresh_token", data.refreshToken);

  localStorage.setItem("role", data.user.role);
  localStorage.setItem("firstName", data.user.firstName);
  localStorage.setItem("lastName", data.user.lastName ?? "");
  localStorage.setItem("email", data.user.email);
  localStorage.setItem("user_id", data.user.id.toString());
}

/**
 * ล้างข้อมูลผู้ใช้ทั้งหมดตอนออกจากระบบ
 *
 * ⚠️ ลบทีละคีย์ ไม่ใช้ localStorage.clear()
 *
 * เพราะ clear() จะล้างของทุกอย่างในโดเมนนี้ รวมถึงค่าที่ส่วนอื่นเก็บไว้
 * ซึ่งไม่เกี่ยวกับการล็อกอินเลย
 */
export function clearSession(): void {
  for (const key of SESSION_KEYS) {
    localStorage.removeItem(key);
  }
}
