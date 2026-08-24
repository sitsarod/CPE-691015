// frontend/src/services/authAPI.ts
import { apiFetch } from "@/services/apiClient";
import { AuthResponseDTO, LoginReq, RefreshResponseDTO, RegisterCustomerReq, UserResponseDTO } from "@/types/auth";


// [POST] เข้าสู่ระบบ
export async function loginAPI(data: LoginReq): Promise<AuthResponseDTO> {
  return await apiFetch<AuthResponseDTO>("/auth/login", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// [POST] ขอ access token ใหม่ด้วย refresh token
export async function refreshTokenAPI(refreshToken: string): Promise<RefreshResponseDTO> {
  return await apiFetch<RefreshResponseDTO>("/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  });
}

// [POST] สมัครสมาชิก
export async function registerAPI(data: RegisterCustomerReq): Promise<AuthResponseDTO> {
  return await apiFetch<AuthResponseDTO>("/auth/register", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// [POST] ค้นหาบัญชีผู้ใช้
export async function findAccountAPI(identifier: string): Promise<UserResponseDTO> {
  const res = await apiFetch<{ status: string; user: UserResponseDTO }>("/users/find", {
    method: "POST",
    body: JSON.stringify({ identifier }),
  });
  return res.user;
}

// ⚠️ sendOTPAPI / verifyOTPAPI ถูกลบออกแล้ว อย่าเพิ่มกลับมา
//
// เส้นเดิม (/auth/send-otp, /auth/verify-otp) ยอมให้ผ่านด้วยเลข 123456 ตายตัว
// ตอนนี้ย้ายไปที่ services/passwordAPI.ts ซึ่งใช้ OTP จริงที่ส่งทางอีเมล
