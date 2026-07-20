// frontend/src/services/authAPI.ts
import { apiFetch } from "@/services/apiClient";

export interface LoginReq {
  email: string;     
  password: string;  
}

export interface FindAccountReq {
  identifier: string; 
}

export interface SendOTPReq {
  email: string;  
}

export interface VerifyOTPReq {
  email: string;      
  otp: string;       
}

// User Profile DTO ที่ส่งกลับจาก FindAccount / Auth
export interface UserResponseDTO {
  id: number;
  firstName: string;
  lastName: string;
  nickname?: string;
  email: string;
  role: string;
  avatarUrl?: string;
}

// User Info สำหรับ Login / Register Response
export interface UserInfoDTO {
  id: number;
  role: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface CustomerInfoDTO {
  nickname: string;
  qrImage: string;
}

// DTO สำหรับ Response ของ Login และ Register
export interface AuthResponseDTO {
  message?: string;
  token: string;
  user: UserInfoDTO;
  customer?: CustomerInfoDTO;
}

export interface VerifyOTPResponseDTO {
  message: string;
  resetToken: string;
}


// [POST] เข้าสู่ระบบ
export async function loginAPI(data: LoginReq): Promise<AuthResponseDTO> {
  return await apiFetch<AuthResponseDTO>("/auth/login", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// [POST] สมัครสมาชิก
export async function registerAPI(data: any): Promise<AuthResponseDTO> {
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