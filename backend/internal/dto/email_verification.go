package dto

// DTO ของขั้นตอนยืนยันอีเมลหลังสมัครสมาชิก (ดู services/email_verification.go)
//
//	1. สมัครสมาชิก      POST /auth/register                    → ออก OTP ให้อัตโนมัติ
//	2. ยืนยันรหัส        POST /auth/verify-registration-otp     → VerifyEmailOTPRequest
//	3. ขอรหัสใหม่ (ถ้าจำเป็น) POST /auth/resend-registration-otp → ResendEmailOTPRequest

// VerifyEmailOTPRequest คือ body ตอนกรอกรหัส 6 หลักที่ส่งไปให้หลังสมัครสมาชิก
type VerifyEmailOTPRequest struct {
	Email string `json:"email" binding:"required,email"`
	OTP   string `json:"otp" binding:"required,len=6,numeric"`
}

// ResendEmailOTPRequest คือ body ตอนกดขอรหัสยืนยันอีเมลใหม่
type ResendEmailOTPRequest struct {
	Email string `json:"email" binding:"required,email"`
}
