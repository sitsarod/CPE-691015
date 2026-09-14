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
  refreshToken?: string;
  user: UserInfoDTO;
  customer?: CustomerInfoDTO;
}

// DTO สำหรับ Response ของ Refresh (ขอ access token ใหม่)
export interface RefreshResponseDTO {
  token: string;
  refreshToken: string;
}

export interface VerifyOTPResponseDTO {
  message: string;
  resetToken: string;
}

// DTO สำหรับ Response ของ Register — ไม่มี token ให้ทันทีอีกต่อไป
// เพราะบัญชีต้องยืนยันอีเมลผ่าน OTP ก่อนถึงจะ login ได้ (ดู VerifyEmailOTPReq)
export interface RegisterResponseDTO {
  message: string;
  requiresVerification: boolean;
  email: string;
}

export interface VerifyEmailOTPReq {
  email: string;
  otp: string;
}

export interface ResendEmailOTPReq {
  email: string;
}

export interface RegisterCustomerReq {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: string;
  customer: {
    nickname: string;
    gender: string;
    birthDate: string | null;
    phoneNumber: string;
    lineId?: string;
    facebook?: string;
    parentEmail: string | null;
    parentPhoneNumber: string | null;
  };
}