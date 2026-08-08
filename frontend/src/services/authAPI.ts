// frontend/src/services/authAPI.ts
import { apiFetch } from "@/services/apiClient";
import { AuthResponseDTO, LoginReq, RegisterCustomerReq, UserResponseDTO, VerifyOTPReq, VerifyOTPResponseDTO } from "@/types/auth";


// [POST] เข้าสู่ระบบ
export async function loginAPI(data: LoginReq): Promise<AuthResponseDTO> {
  return await apiFetch<AuthResponseDTO>("/auth/login", {
    method: "POST",
    body: JSON.stringify(data),
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

// [POST] ส่งรหัส OTP
export async function sendOTPAPI(email: string): Promise<{ message: string }> {
  return await apiFetch<{ message: string }>("/auth/send-otp", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

// [POST] ยืนยันรหัส OTP
export async function verifyOTPAPI(data: VerifyOTPReq): Promise<VerifyOTPResponseDTO> {
  return await apiFetch<VerifyOTPResponseDTO>("/auth/verify-otp", {
    method: "POST",
    body: JSON.stringify(data),
  });
}