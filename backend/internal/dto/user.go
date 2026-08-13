package dto

import (
	"strings"

	"CPE-691015/internal/models"
)

// CreateUserRequest รับข้อมูลตอนแอดมินสร้างบัญชีผู้ใช้ใหม่จากหน้าจัดการสมาชิก
//
// ⚠️ ห้ามเปลี่ยนกลับไป bind models.User ตรง ๆ ด้วยเหตุผลเดียวกับ RegisterRequest
// ต่างกันแค่ที่นี่แอดมิน "เลือก role ได้" เพราะเป็นคนสร้างบัญชีให้พนักงาน
// (ส่วน Register บังคับเป็น customer เสมอ)
type CreateUserRequest struct {
	Role      string `json:"role" binding:"required,oneof=admin coach customer"`
	FirstName string `json:"firstName" binding:"required"`
	LastName  string `json:"lastName" binding:"required"`
	Email     string `json:"email" binding:"required,email"`

	// max=72 เพราะ bcrypt ตัดส่วนที่เกิน 72 ไบต์ทิ้งเงียบ ๆ (ดู RegisterRequest)
	Password string `json:"password" binding:"required,min=8,max=72"`
}

// ToUser แปลง request เป็น models.User ที่พร้อมบันทึก
//
// ไม่แนบ Customer มาด้วยโดยตั้งใจ — หน้าจอนี้สร้างแค่ "บัญชีเข้าระบบ"
// ถ้า role เป็น customer ต้องไปกรอกโปรไฟล์ผู้เรียนเพิ่มทีหลัง
func (r *CreateUserRequest) ToUser() *models.User {
	return &models.User{
		Role:      models.UserRole(r.Role),
		FirstName: strings.TrimSpace(r.FirstName),
		LastName:  strings.TrimSpace(r.LastName),
		Email:     strings.TrimSpace(r.Email),
		Password:  r.Password,
	}
}



// TokenResponse ใช้สำหรับพ่นตั๋ว JWT และข้อมูลคนล็อกอินกลับไปให้ฝั่ง Frontend
type TokenResponse struct {
    Token string `json:"token"`
    Role  string `json:"role"`
}

// UserProfileResponseDTO ข้อมูลโปรไฟล์ที่หน้าโปรไฟล์ผู้เรียนใช้แสดงผล
//
// ฟิลด์ชุดล่างมาจากตาราง customers จึงมีเฉพาะผู้ใช้ role = customer
// ใช้ omitempty เพื่อไม่ให้แอดมิน/โค้ชได้ฟิลด์ว่างเปล่าติดไปด้วย
type UserProfileResponseDTO struct {
	ID        uint   `json:"id"`
	Email     string `json:"email" binding:"required,email,endswith=@gmail.com"`
	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`
	Role      string `json:"role"`
	IsStudent bool   `json:"isStudent"`

	Nickname          string     `json:"nickname,omitempty"`
	PhoneNumber       string     `json:"phoneNumber,omitempty"`
	LineID            string     `json:"lineId,omitempty"`
	Facebook          string     `json:"facebook,omitempty"`
	BirthDate         *string `json:"birthDate,omitempty"`
	Gender            string     `json:"gender,omitempty"`
	ParentEmail       string     `json:"parentEmail,omitempty"`
	ParentPhoneNumber string     `json:"parentPhoneNumber,omitempty"`
	Status            string     `json:"status,omitempty"`
}


type StudentListResponseDTO struct {
	ID          uint   `json:"id"`
	FirstName   string `json:"firstName"`
	LastName    string `json:"lastName"`
	Email       string `json:"email"`
	Nickname    string `json:"nickname"`
	PhoneNumber string `json:"phoneNumber"`

	GraceEnrollments int64 `json:"graceEnrollments"`
	LineID      string `json:"lineId"`
	Facebook    string `json:"facebook"`
	BirthDate   string `json:"birthDate"`
	Gender      string `json:"gender"`
}

// UpdateProfileInput คือข้อมูลที่ผู้เรียนแก้ไขเองได้
//
// นโยบายของทีม: เจ้าตัวแก้ได้เฉพาะ "ช่องทางติดต่อ" ส่วนข้อมูลตัวตนต้องให้แอดมิน
// แก้ให้หลังตรวจหลักฐาน (ผ่าน PATCH /api/admin/users/:id)
//
// ⚠️ Email เคยอยู่ในนี้ แต่ถูกย้ายออกโดยตั้งใจ เพราะอีเมลคือชื่อผู้ใช้ที่ใช้ล็อกอิน
// และเป็นปลายทางของการกู้รหัสผ่าน ถ้าใครยึด session ไปได้แล้วเปลี่ยนอีเมลได้เอง
// จะยึดบัญชีถาวรทันทีโดยที่เจ้าของเดิมกู้คืนไม่ได้เลย
//
// ⚠️ FirstName / LastName / Nickname ก็ถูกย้ายออก เพราะเป็นชื่อที่ใช้อ้างอิงตัวตน
// ในใบเสร็จและตารางเช็คชื่อ การเปลี่ยนชื่อจริงควรมีหลักฐานประกอบ
type UpdateProfileInput struct {
	PhoneNumber       string `json:"phoneNumber" binding:"omitempty,numeric,len=10"`
	ParentEmail       string `json:"parentEmail" binding:"omitempty,email"`
	ParentPhoneNumber string `json:"parentPhoneNumber" binding:"omitempty,numeric,len=10"`

	// LineID / Facebook ไม่บังคับ ใช้ pointer เพื่อแยก "ไม่ได้ส่งมา" ออกจาก "ส่งค่าว่างมาเพื่อลบ"
	LineID   *string `json:"lineId"`
	Facebook *string `json:"facebook"`
}


type UserInfoDTO struct {
    ID        uint   `json:"id"`
    Role      string `json:"role"`
    FirstName string `json:"firstName"`
    Email     string `json:"email"`
}


type CustomerInfoDTO struct {
    Nickname string `json:"nickname"`
    QrImage  string `json:"qrImage"` 
}


type RegisterResponseDTO struct {
    Token    string          `json:"token"`
    User     UserInfoDTO     `json:"user"`
    Customer CustomerInfoDTO `json:"customer"`
}


