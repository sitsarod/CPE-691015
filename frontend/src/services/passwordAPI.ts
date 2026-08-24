import { apiFetch } from "@/services/apiClient";

/**
 * ระบบกู้และเปลี่ยนรหัสผ่าน
 *
 * ⚠️ ทุกเส้นส่ง identifier ที่ "ผู้ใช้พิมพ์เอง" ไม่ใช่ค่า masked ที่ได้จาก
 * /users/find เพราะค่า masked ถูกปิดบังไปแล้ว (s*****i@gmail.com)
 * ใช้ระบุตัวตนไม่ได้
 */

// [POST] ขอรหัสยืนยันทางอีเมล
//
// ⚠️ ตอบสำเร็จเสมอ แม้ไม่มีบัญชีนั้นในระบบ — เป็นพฤติกรรมที่ตั้งใจ
// ถ้าตอบต่างกัน คนที่ไล่ยิงอีเมลจะรู้ว่าอีเมลไหนมีสมาชิกอยู่จริง
export async function requestPasswordOTPAPI(identifier: string): Promise<{ message: string }> {
  return await apiFetch<{ message: string }>("/auth/password/request-otp", {
    method: "POST",
    body: JSON.stringify({ identifier }),
  });
}

// [POST] ยืนยันรหัส 6 หลัก แล้วได้ token อายุสั้นไว้ใช้ตั้งรหัสผ่านใหม่
export async function verifyPasswordOTPAPI(identifier: string, otp: string): Promise<string> {
  const res = await apiFetch<{ data: { resetToken: string } }>("/auth/password/verify-otp", {
    method: "POST",
    body: JSON.stringify({ identifier, otp }),
  });
  return res.data.resetToken;
}

// [POST] ตั้งรหัสผ่านใหม่ด้วย token ที่ได้จากขั้นตอนยืนยัน
export async function resetPasswordAPI(
  resetToken: string,
  newPassword: string
): Promise<{ message: string }> {
  return await apiFetch<{ message: string }>("/auth/password/reset", {
    method: "POST",
    body: JSON.stringify({ resetToken, newPassword }),
  });
}

// [PATCH] ผู้ที่ล็อกอินอยู่เปลี่ยนรหัสผ่านของตัวเอง (ต้องกรอกรหัสเดิม)
export async function changePasswordAPI(
  currentPassword: string,
  newPassword: string
): Promise<{ message: string }> {
  return await apiFetch<{ message: string }>("/me/password", {
    method: "PATCH",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}
