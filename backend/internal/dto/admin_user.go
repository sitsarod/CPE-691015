package dto

import (
	"strings"
	"time"

	"CPE-691015/internal/models"
)

// AdminCreateUserRequest รับข้อมูลตอนแอดมินสร้างสมาชิกใหม่จากหน้า "จัดการสมาชิก"
//
// เจตนาของหน้านี้: เป็น "ที่เดียว" ที่สร้างบัญชีได้ทุกบทบาท
//
// เดิมการเพิ่มโค้ชต้องทำสองจังหวะ — สร้าง user ที่หน้าจัดการสมาชิกก่อน แล้วไปหน้า
// จัดการโค้ชเพื่อผูกโปรไฟล์ทีหลัง ซึ่งเป็นสอง API call แยกกัน ถ้าอันที่สองพัง
// จะเหลือ user ที่ไม่มีโปรไฟล์ค้างในฐาน (โค้ชที่เช็คชื่อไม่ได้ / นักเรียนที่ไม่มี QR)
//
// โครงสร้างนี้จึงรับทั้งข้อมูลบัญชีและโปรไฟล์มาพร้อมกัน แล้วให้ service เขียนลง
// ฐานข้อมูลใน transaction เดียว — สำเร็จทั้งหมดหรือไม่เกิดอะไรขึ้นเลย
type AdminCreateUserRequest struct {
	Role      string `json:"role" binding:"required,oneof=admin coach customer"`
	FirstName string `json:"firstName" binding:"required"`
	LastName  string `json:"lastName" binding:"required"`
	Email     string `json:"email" binding:"required,email"`

	// max=72 เพราะ bcrypt ตัดส่วนที่เกิน 72 ไบต์ทิ้งเงียบ ๆ
	Password string `json:"password" binding:"required,min=8,max=72"`

	// ต้องส่งมาให้ตรงกับ Role — service เป็นคนตรวจ เพราะ binding tag
	// เขียนเงื่อนไข "ต้องมีเมื่อ role เป็นค่านี้" ได้ไม่สวย
	Customer *AdminCreateCustomerProfile `json:"customer"`
	Coach    *AdminCreateCoachProfile    `json:"coach"`
}

// AdminCreateCustomerProfile ข้อมูลผู้เรียนที่แอดมินกรอกตอนสร้างบัญชี
type AdminCreateCustomerProfile struct {
	Nickname    string     `json:"nickname" binding:"required"`
	Gender      string     `json:"gender" binding:"required,oneof=male female"`
	BirthDate   *time.Time `json:"birthDate" binding:"required"`
	PhoneNumber string     `json:"phoneNumber" binding:"required,numeric,len=10"`

	// ช่องทางติดต่อเสริมและข้อมูลผู้ปกครอง ไม่บังคับ
	LineID            string `json:"lineId"`
	Facebook          string `json:"facebook"`
	ParentEmail       string `json:"parentEmail" binding:"omitempty,email"`
	ParentPhoneNumber string `json:"parentPhoneNumber" binding:"omitempty,numeric,len=10"`
}

// AdminCreateCoachProfile ข้อมูลโค้ชที่แอดมินกรอกตอนสร้างบัญชี
//
// uid และ birthDate บังคับกรอกโดยตั้งใจ เพราะเป็นข้อมูลตัวตนที่มีตั้งแต่วันแรก
// และตามนโยบายจะแก้ได้เฉพาะแอดมินหลังตรวจหลักฐานเท่านั้น
type AdminCreateCoachProfile struct {
	Nickname    string `json:"nickname" binding:"required"`
	Phone       string `json:"phone" binding:"required,numeric,len=10"`
	Uid         string `json:"uid" binding:"required,numeric,len=13"`
	BirthDate   string `json:"birth_date" binding:"required"` // รูปแบบ YYYY-MM-DD
	Address     string `json:"address" binding:"required"`

	Specialization string  `json:"specialization" binding:"required"`
	CoachLicense   string  `json:"coach_license" binding:"required"`
	BankAccount    string  `json:"bank_account" binding:"required"`
	PaymentInfo    string  `json:"payment_info" binding:"required"`
	PromptPay      string  `json:"prompt_pay" binding:"required"` // พร้อมเพย์ (บังคับ)
	PaymentType    string  `json:"payment_type" binding:"required,oneof=per_session monthly"`
	PayRate        float64 `json:"pay_rate" binding:"required,gt=0"`

	// ช่องทางติดต่อเสริม ไม่บังคับ
	LineID   string `json:"lineId"`
	Facebook string `json:"facebook"`

	// ไม่บังคับ เพราะหน้าจอสร้างสมาชิกยังไม่มีปุ่มอัปโหลดรูป
	// ให้โค้ชอัปโหลดเองทีหลังในหน้าโปรไฟล์
	ProfilePicture string `json:"profile_picture"`
}

// ───────────────────────── แอดมินแก้ไข ─────────────────────────

// AdminUpdateUserRequest ข้อมูลที่แอดมินแก้ให้สมาชิกได้
//
// ตามนโยบายของทีม: เจ้าตัวแก้ได้เฉพาะ "ช่องทางติดต่อ" ส่วนข้อมูลตัวตนและการเงิน
// (ชื่อ อีเมล วันเกิด เลขบัตร บัญชีธนาคาร) ต้องให้แอดมินแก้หลังตรวจหลักฐานแล้ว
// การส่งหลักฐานเป็นกระบวนการนอกระบบ (ทักกันเอง) โดยตั้งใจ
//
// ทุกฟิลด์เป็น pointer เพื่อแยก "ไม่ได้ส่งมา" (nil = ไม่แตะ) ออกจาก
// "ส่งค่าว่างมา" (ตั้งใจล้างค่า) — ถ้าใช้ string ธรรมดาจะล้างค่าไม่ได้เลย
//
// ⚠️ ตั้งใจไม่ให้แก้ 4 อย่าง:
//   - Role      → เปลี่ยนบทบาทแล้วโปรไฟล์เดิมจะกลายเป็นขยะ (customer ที่ไม่มีใครอ้างถึง)
//   - Password  → ต้องมี flow ของตัวเองที่ยืนยันตัวตนก่อน
//   - PersonalQR→ ถ้าต้องเปลี่ยนให้กดออกใบใหม่ ไม่ใช่พิมพ์ทับ
//   - FaceConsentStatus → ต้องให้เจ้าตัวกดเอง ไม่งั้นหลักฐาน PDPA ใช้ไม่ได้
type AdminUpdateUserRequest struct {
	FirstName *string `json:"firstName"`
	LastName  *string `json:"lastName"`
	Email     *string `json:"email" binding:"omitempty,email"`

	Customer *AdminUpdateCustomerProfile `json:"customer"`
	Coach    *AdminUpdateCoachProfile    `json:"coach"`
}

// AdminUpdateCustomerProfile ฟิลด์ของผู้เรียนที่แอดมินแก้ได้
type AdminUpdateCustomerProfile struct {
	Nickname          *string    `json:"nickname"`
	Gender            *string    `json:"gender" binding:"omitempty,oneof=male female"`
	BirthDate         *time.Time `json:"birthDate"`
	PhoneNumber       *string    `json:"phoneNumber" binding:"omitempty,numeric,len=10"`
	LineID            *string    `json:"lineId"`
	Facebook          *string    `json:"facebook"`
	ParentEmail       *string    `json:"parentEmail" binding:"omitempty,email"`
	ParentPhoneNumber *string    `json:"parentPhoneNumber" binding:"omitempty,numeric,len=10"`
	Status            *string    `json:"status" binding:"omitempty,oneof=active inactive"`
}

// AdminUpdateCoachProfile ฟิลด์ของโค้ชที่แอดมินแก้ได้
//
// Uid กับ BirthDate อยู่ตรงนี้เพราะเดิม "ไม่มีที่ไหนแก้ได้เลย" — กรอกผิดตอนสร้าง
// แล้วต้องไปแก้ในฐานข้อมูลตรง ๆ ซึ่งไม่ควรเป็นวิธีทำงานปกติ
type AdminUpdateCoachProfile struct {
	Nickname       *string  `json:"nickname"`
	Phone          *string  `json:"phone" binding:"omitempty,numeric,len=10"`
	LineID         *string  `json:"lineId"`
	Facebook       *string  `json:"facebook"`
	Uid            *string  `json:"uid" binding:"omitempty,numeric,len=13"`
	BirthDate      *string  `json:"birth_date"`
	Address        *string  `json:"address"`
	ProfilePicture *string  `json:"profile_picture"`
	Specialization *string  `json:"specialization"`
	CoachLicense   *string  `json:"coach_license"`
	BankAccount    *string  `json:"bank_account"`
	PaymentInfo    *string  `json:"payment_info"`
	PromptPay      *string  `json:"prompt_pay"`
	PaymentType    *string  `json:"payment_type" binding:"omitempty,oneof=per_session monthly"`
	PayRate        *float64 `json:"pay_rate" binding:"omitempty,gt=0"`
}

// ───────────────────────── ดูรายละเอียด ─────────────────────────

// AdminUserDetailResponse ข้อมูลสมาชิกแบบเต็มสำหรับหน้าจัดการสมาชิกของแอดมิน
//
// ใช้ omitempty กับโปรไฟล์ทั้งสองก้อน หน้าบ้านจึงเช็คได้ตรง ๆ ว่ามีก้อนไหนมา
// แล้วเลือกแสดงผลตามนั้น โดยไม่ต้องเดาจาก role
//
// ⚠️ ตั้งใจไม่ใส่ PersonalQRCode — ถึงแอดมินจะเป็นคนที่ไว้ใจได้ แต่ QR เป็นความลับ
// ที่ใช้เช็คชื่อแทนเจ้าตัวได้ ไม่มีเหตุผลที่ต้องให้แอดมินอ่านค่าดิบ
// ถ้าสมาชิกทำบัตรหาย วิธีที่ถูกคือกดออกใบใหม่ ไม่ใช่อ่านของเดิมไปบอก
type AdminUserDetailResponse struct {
	ID        uint   `json:"id"`
	Role      string `json:"role"`
	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`
	Email     string `json:"email"`
	CreatedAt string `json:"createdAt"`

	Customer *AdminCustomerDetail `json:"customer,omitempty"`
	Coach    *AdminCoachDetail    `json:"coach,omitempty"`
}

// AdminCustomerDetail โปรไฟล์ผู้เรียนแบบเต็ม
type AdminCustomerDetail struct {
	Nickname          string `json:"nickname"`
	Gender            string `json:"gender"`
	BirthDate         string `json:"birthDate"` // YYYY-MM-DD
	PhoneNumber       string `json:"phoneNumber"`
	LineID            string `json:"lineId"`
	Facebook          string `json:"facebook"`
	ParentEmail       string `json:"parentEmail"`
	ParentPhoneNumber string `json:"parentPhoneNumber"`
	Status            string `json:"status"`

	// FaceConsentStatus แสดงอย่างเดียว แก้ที่นี่ไม่ได้
	// ต้องให้เจ้าตัวกดยินยอม/ถอนเองผ่าน /consents/face เพื่อให้มีหลักฐานตาม PDPA
	FaceConsentStatus string `json:"faceConsentStatus"`
}

// AdminCoachDetail โปรไฟล์โค้ชแบบเต็ม
type AdminCoachDetail struct {
	Nickname       string  `json:"nickname"`
	Phone          string  `json:"phone"`
	LineID         string  `json:"lineId"`
	Facebook       string  `json:"facebook"`
	Uid            string  `json:"uid"`
	BirthDate      string  `json:"birth_date"`
	Address        string  `json:"address"`
	ProfilePicture string  `json:"profile_picture"`
	Specialization string  `json:"specialization"`
	CoachLicense   string  `json:"coach_license"`
	BankAccount    string  `json:"bank_account"`
	PaymentInfo    string  `json:"payment_info"`
	PromptPay      string  `json:"prompt_pay"`
	PaymentType    string  `json:"payment_type"`
	PayRate        float64 `json:"pay_rate"`
}

// ToAdminUserDetail แปลง models.User (ที่ Preload Customer/Coach มาแล้ว) เป็น DTO
func ToAdminUserDetail(u *models.User) AdminUserDetailResponse {
	res := AdminUserDetailResponse{
		ID:        u.ID,
		Role:      string(u.Role),
		FirstName: u.FirstName,
		LastName:  u.LastName,
		Email:     u.Email,
		CreatedAt: u.CreatedAt.Format("2006-01-02"),
	}

	if c := u.Customer; c != nil {
		birthDate := ""
		if !c.BirthDate.IsZero() {
			birthDate = c.BirthDate.Format("2006-01-02")
		}
		res.Customer = &AdminCustomerDetail{
			Nickname:          c.Nickname,
			Gender:            strings.ToLower(string(c.Gender)),
			BirthDate:         birthDate,
			PhoneNumber:       c.PhoneNumber,
			LineID:            c.LineID,
			Facebook:          c.Facebook,
			ParentEmail:       c.ParentEmail,
			ParentPhoneNumber: c.ParentPhoneNumber,
			Status:            string(c.Status),
			FaceConsentStatus: string(c.FaceConsentStatus),
		}
	}

	if co := u.Coach; co != nil {
		res.Coach = &AdminCoachDetail{
			Nickname:       co.Nickname,
			Phone:          co.Phone,
			LineID:         co.LineID,
			Facebook:       co.Facebook,
			Uid:            co.Uid,
			BirthDate:      co.BirthDate,
			Address:        co.Address,
			ProfilePicture: co.ProfilePicture,
			Specialization: co.Specialization,
			CoachLicense:   co.CoachLicense,
			BankAccount:    co.BankAccount,
			PaymentInfo:    co.PaymentInfo,
			PromptPay:      co.PromptPay,
			PaymentType:    co.PaymentType,
			PayRate:        co.PayRate,
		}
	}

	return res
}

// ToUser แปลงส่วนข้อมูลบัญชีเป็น models.User (ยังไม่รวมโปรไฟล์)
//
// โปรไฟล์ถูกสร้างแยกในชั้น service เพราะต้องใช้ user.ID ที่เพิ่งได้จากการ INSERT
func (r *AdminCreateUserRequest) ToUser() *models.User {
	return &models.User{
		Role:      models.UserRole(r.Role),
		FirstName: strings.TrimSpace(r.FirstName),
		LastName:  strings.TrimSpace(r.LastName),
		Email:     strings.TrimSpace(r.Email),
		Password:  r.Password,
	}
}

// ToCustomer แปลงส่วนโปรไฟล์ผู้เรียน (คืน nil ถ้าไม่ได้ส่งมา)
//
// ไม่แตะ PersonalQRCode / Status / FaceConsentStatus โดยตั้งใจ —
// สามฟิลด์นั้นกำหนดจากฝั่งเซิร์ฟเวอร์เท่านั้น
func (r *AdminCreateUserRequest) ToCustomer(userID uint) *models.Customer {
	if r.Customer == nil {
		return nil
	}

	c := &models.Customer{
		UserID:            userID,
		Nickname:          strings.TrimSpace(r.Customer.Nickname),
		Gender:            models.Gender(r.Customer.Gender),
		PhoneNumber:       strings.TrimSpace(r.Customer.PhoneNumber),
		LineID:            strings.TrimSpace(r.Customer.LineID),
		Facebook:          strings.TrimSpace(r.Customer.Facebook),
		ParentEmail:       strings.TrimSpace(r.Customer.ParentEmail),
		ParentPhoneNumber: strings.TrimSpace(r.Customer.ParentPhoneNumber),
	}
	if r.Customer.BirthDate != nil {
		c.BirthDate = *r.Customer.BirthDate
	}
	return c
}

// ToCoach แปลงส่วนโปรไฟล์โค้ช (คืน nil ถ้าไม่ได้ส่งมา)
//
// ไม่แตะ PersonalQRCode โดยตั้งใจ — กำหนดจากฝั่งเซิร์ฟเวอร์เท่านั้น
func (r *AdminCreateUserRequest) ToCoach(userID uint) *models.Coach {
	if r.Coach == nil {
		return nil
	}

	return &models.Coach{
		UserID:         userID,
		Nickname:       strings.TrimSpace(r.Coach.Nickname),
		Phone:          strings.TrimSpace(r.Coach.Phone),
		LineID:         strings.TrimSpace(r.Coach.LineID),
		Facebook:       strings.TrimSpace(r.Coach.Facebook),
		Uid:            strings.TrimSpace(r.Coach.Uid),
		BirthDate:      strings.TrimSpace(r.Coach.BirthDate),
		Address:        strings.TrimSpace(r.Coach.Address),
		ProfilePicture: strings.TrimSpace(r.Coach.ProfilePicture),
		Specialization: strings.TrimSpace(r.Coach.Specialization),
		CoachLicense:   strings.TrimSpace(r.Coach.CoachLicense),
		BankAccount:    strings.TrimSpace(r.Coach.BankAccount),
		PaymentInfo:    strings.TrimSpace(r.Coach.PaymentInfo),
		PromptPay:      strings.TrimSpace(r.Coach.PromptPay),
		PaymentType:    strings.TrimSpace(r.Coach.PaymentType),
		PayRate:        r.Coach.PayRate,
	}
}
