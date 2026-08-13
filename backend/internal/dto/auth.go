package dto

import (
	"strings"
	"time"

	"CPE-691015/internal/models"
)

// RegisterRequest รับข้อมูลสมัครสมาชิกจากหน้าบ้าน
//
// ⚠️ ห้ามเปลี่ยนกลับไป bind models.User ตรง ๆ เด็ดขาด
//
// เดิม Register รับ models.User ทั้งก้อน ทำให้ client ส่งฟิลด์อะไรก็ได้ที่มีอยู่ในโมเดล
// เข้ามาเอง รวมถึงฟิลด์ที่ผู้ใช้ไม่ควรกำหนด เช่น
//   - customer.face_consent_status → ปลอมความยินยอมเก็บข้อมูลใบหน้า ข้าม audit trail
//     ของตาราง biometric_consents ทั้งหมด (ผิด PDPA)
//   - customer.personalQR         → จองรหัสของคนอื่นไว้ล่วงหน้าให้เขาสมัครไม่ผ่าน
//   - customer.status             → ตั้งสถานะบัญชีตัวเอง
//   - ID                          → กำหนดเลข primary key เอง
//
// struct นี้จึงประกาศเฉพาะฟิลด์ที่ผู้สมัครกรอกได้จริง อะไรที่ไม่อยู่ในนี้จะถูกทิ้งทันที
type RegisterRequest struct {
	FirstName string `json:"firstName" binding:"required"`
	LastName  string `json:"lastName" binding:"required"`
	Email     string `json:"email" binding:"required,email"`

	// max=72 เพราะ bcrypt ตัดข้อมูลส่วนที่เกิน 72 ไบต์ทิ้งเงียบ ๆ
	// ถ้าไม่กันไว้ รหัสผ่านยาวเกินจะถูกตัดโดยที่ไม่มีใครรู้
	// (ภาษาไทย 1 ตัวอักษร = 3 ไบต์ จึงชนเพดานเร็วกว่าที่คิด)
	Password string `json:"password" binding:"required,min=8,max=72"`

	Customer RegisterCustomerProfile `json:"customer"`
}

// RegisterCustomerProfile คือส่วนข้อมูลผู้เรียนที่แนบมากับการสมัครสมาชิก
type RegisterCustomerProfile struct {
	Nickname    string     `json:"nickname" binding:"required"`
	Gender      string     `json:"gender" binding:"required,oneof=male female"`
	BirthDate   *time.Time `json:"birthDate" binding:"required"`
	PhoneNumber string     `json:"phoneNumber" binding:"required,numeric,len=10"`

	// ช่องทางติดต่อเสริม ไม่บังคับกรอก
	LineID   string `json:"lineId"`
	Facebook string `json:"facebook"`

	// ข้อมูลผู้ปกครอง ไม่บังคับ — หน้าบ้านส่ง null มาได้เมื่อไม่กรอก
	// (encoding/json แปลง null ลง string เป็นค่าว่างให้อยู่แล้ว ไม่ error)
	ParentEmail       string `json:"parentEmail" binding:"omitempty,email"`
	ParentPhoneNumber string `json:"parentPhoneNumber" binding:"omitempty,numeric,len=10"`
}

// ToUser แปลง request เป็น models.User ที่พร้อมบันทึก
//
// ฟิลด์อ่อนไหวทั้งหมด (Role, Status, PersonalQRCode, FaceConsentStatus) ถูกกำหนด
// จากฝั่งเซิร์ฟเวอร์เท่านั้น — Role ตั้งตรงนี้ ส่วนที่เหลือ UserService.CreateUser จัดการ
func (r *RegisterRequest) ToUser() *models.User {
	customer := &models.Customer{
		Nickname:          strings.TrimSpace(r.Customer.Nickname),
		Gender:            models.Gender(r.Customer.Gender),
		PhoneNumber:       strings.TrimSpace(r.Customer.PhoneNumber),
		LineID:            strings.TrimSpace(r.Customer.LineID),
		Facebook:          strings.TrimSpace(r.Customer.Facebook),
		ParentEmail:       strings.TrimSpace(r.Customer.ParentEmail),
		ParentPhoneNumber: strings.TrimSpace(r.Customer.ParentPhoneNumber),
	}
	if r.Customer.BirthDate != nil {
		customer.BirthDate = *r.Customer.BirthDate
	}

	return &models.User{
		FirstName: strings.TrimSpace(r.FirstName),
		LastName:  strings.TrimSpace(r.LastName),
		Email:     strings.TrimSpace(r.Email),
		Password:  r.Password, // ไม่ trim เพราะช่องว่างอาจเป็นส่วนหนึ่งของรหัสผ่านจริง
		Role:      models.CustomerRole,
		Customer:  customer,
	}
}

// LoginInput รับข้อมูลสำหรับ Login
type LoginInput struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

// FindAccountInput รับข้อมูลสำหรับค้นหาบัญชี (อีเมลหรือเบอร์โทร)
type FindAccountInput struct {
	Identifier string `json:"identifier" binding:"required"`
}

// SendOTPInput รับอีเมลเพื่อสั่งส่ง OTP
type SendOTPInput struct {
	Email string `json:"email" binding:"required,email"`
}

// VerifyOTPInput รับอีเมลและรหัส OTP เพื่อตรวจสอบ
type VerifyOTPInput struct {
	Email string `json:"email" binding:"required,email"`
	OTP   string `json:"otp" binding:"required,len=6"`
}

// UserResponseDTO โครงสร้างข้อมูล User ที่ส่งกลับไปหน้าบ้าน
type UserResponseDTO struct {
	ID        uint   `json:"id"`
	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`
	Nickname  string `json:"nickname,omitempty"`
	Email     string `json:"email"`
	Role      string `json:"role"`
	AvatarUrl string `json:"avatarUrl,omitempty"`
}