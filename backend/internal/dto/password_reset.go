package dto

import "strings"

// ─────────────────────────────────────────────────────────────────────────────
// DTO ของขั้นตอน "ลืมรหัสผ่าน" ทั้งเส้นทาง
//
// เรียงตามลำดับที่ผู้ใช้เจอจริง:
//
//	1. ค้นหาบัญชี      POST /users/find              → FindAccountResponse
//	2. ขอรหัสยืนยัน     POST /auth/password/request-otp → RequestOTPRequest
//	3. ยืนยันรหัส       POST /auth/password/verify-otp  → VerifyOTPRequest/Response
//	4. ตั้งรหัสใหม่      POST /auth/password/reset       → ResetPasswordRequest
//
// และเส้นแยกสำหรับคนที่ล็อกอินอยู่แล้ว:
//
//	PATCH /me/password → ChangePasswordRequest
// ─────────────────────────────────────────────────────────────────────────────

// ─── 1. ค้นหาบัญชี ───

// FindAccountResponse ผลลัพธ์ของการค้นหาบัญชีในขั้นตอน "ลืมรหัสผ่าน"
//
// ⚠️ เส้นนี้เรียกได้โดยไม่ต้องล็อกอิน จึงห้ามคืนข้อมูลส่วนบุคคลเด็ดขาด
//
// เดิมคืน ชื่อจริง นามสกุล ชื่อเล่น อีเมลเต็ม เบอร์โทรเต็ม และ role
// ทำให้ใครก็ตามที่ไล่ยิงเบอร์ 08xxxxxxxx เข้ามาสามารถกวาดรายชื่อสมาชิก
// พร้อมเบอร์ติดต่อได้ทั้งระบบ ซึ่งเป็นปัญหา PDPA โดยตรง
// (สมาชิกส่วนใหญ่เป็นผู้เยาว์)
//
// ตอนนี้คืนเฉพาะค่าที่ปิดบังแล้ว พอให้เจ้าของบัญชียืนยันว่า "ใช่ของฉัน"
// แต่คนที่ไม่ใช่เจ้าของเอาไปใช้ต่อไม่ได้
type FindAccountResponse struct {
	// MaskedEmail เช่น so****k@gmail.com
	MaskedEmail string `json:"maskedEmail"`

	// MaskedPhone เช่น 08x-xxx-1234 (ว่างถ้าบัญชีนั้นไม่มีเบอร์)
	MaskedPhone string `json:"maskedPhone"`
}

// MaskEmail ปิดบังส่วนหน้า @ โดยเหลือตัวแรกกับตัวสุดท้ายไว้
//
//	somchai@gmail.com  → s*****i@gmail.com
//	ab@gmail.com       → **@gmail.com   (สั้นเกินกว่าจะเหลือเบาะแสได้)
func MaskEmail(email string) string {
	local, domain, ok := strings.Cut(email, "@")
	if !ok || local == "" {
		return ""
	}

	// ชื่อสั้นมากก็ปิดทั้งหมด เพราะเหลือตัวแรก/ตัวท้ายไว้แทบจะเท่ากับบอกทั้งชื่อ
	if len(local) <= 3 {
		return strings.Repeat("*", len(local)) + "@" + domain
	}

	return string(local[0]) + strings.Repeat("*", len(local)-2) + string(local[len(local)-1]) + "@" + domain
}

// MaskPhone ปิดบังเบอร์โทรโดยเหลือ 4 ตัวท้ายไว้ให้เจ้าของจำได้
//
//	0812345678 → 08x-xxx-5678
func MaskPhone(phone string) string {
	if len(phone) < 4 {
		return ""
	}
	return phone[:2] + "x-xxx-" + phone[len(phone)-4:]
}

// ─── 2. ขอรหัสยืนยัน ───

// RequestOTPRequest คือ body ตอนกดขอรหัสยืนยัน
//
// รับเป็น identifier ไม่ใช่ email เพราะหน้าเว็บให้กรอกได้ทั้งอีเมลและเบอร์โทร
//
// ⚠️ ต้องเป็นค่าที่ผู้ใช้พิมพ์เอง ห้ามส่งค่าที่ปิดบังแล้วจาก FindAccountResponse
// กลับมา เพราะ s*****i@gmail.com ใช้ระบุตัวตนไม่ได้
type RequestOTPRequest struct {
	Identifier string `json:"identifier" binding:"required"`
}

// ─── 3. ยืนยันรหัส ───

// VerifyOTPRequest คือ body ตอนกรอกรหัส 6 หลัก
type VerifyOTPRequest struct {
	Identifier string `json:"identifier" binding:"required"`
	OTP        string `json:"otp" binding:"required,len=6,numeric"`
}

// VerifyOTPResponse คืน token อายุสั้นไว้ใช้ในขั้นตอนถัดไป
type VerifyOTPResponse struct {
	ResetToken string `json:"resetToken"`
}

// ─── 4. ตั้งรหัสผ่านใหม่ ───

// ResetPasswordRequest คือ body ตอนตั้งรหัสผ่านใหม่
//
// ⚠️ binding tag ตรงนี้เป็นแค่ด่านแรก ไม่ใช่ด่านตัดสิน
//
// validator ของ gin นับความยาวเป็น "ตัวอักษร" ทั้ง min และ max
// ส่วนเพดานจริงของ bcrypt เป็น "ไบต์" (ภาษาไทย 1 ตัว = 3 ไบต์)
// max=72 ตรงนี้จึงหลวมกว่าของจริงสำหรับภาษาไทย
//
// ด่านที่ตัดสินจริงคือ services.ValidatePasswordStrength ซึ่งนับไบต์
// อย่าเอา binding tag มาแทนที่การเรียกฟังก์ชันนั้น
type ResetPasswordRequest struct {
	ResetToken  string `json:"resetToken" binding:"required"`
	NewPassword string `json:"newPassword" binding:"required,min=8,max=72"`
}

// ─── เส้นแยก: เปลี่ยนรหัสผ่านตอนล็อกอินอยู่ ───

// ChangePasswordRequest คือ body ตอนผู้ที่ล็อกอินอยู่เปลี่ยนรหัสผ่านตัวเอง
//
// ⚠️ CurrentPassword ต้องไม่ถูกเขียนลง log หรือส่งกลับใน response เด็ดขาด
type ChangePasswordRequest struct {
	CurrentPassword string `json:"currentPassword" binding:"required"`
	NewPassword     string `json:"newPassword" binding:"required,min=8,max=72"`
}
