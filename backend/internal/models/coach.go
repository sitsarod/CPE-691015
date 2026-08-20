package models

import (
	"gorm.io/gorm"
)

type Coach struct {
	gorm.Model
	UserID            uint            `json:"user_id" valid:"required~UserID is required"`
    User              *User           `json:"user" ` 
	
	Phone          string `json:"phone" gorm:"type:varchar(20)" valid:"required~phone is required"`
	// LineID / Facebook เป็นช่องทางติดต่อเสริม ไม่บังคับกรอก
	LineID         string `json:"lineId" gorm:"type:varchar(100)"`
	Facebook       string `json:"facebook" gorm:"type:varchar(255)"`
	Uid            string `json:"uid" gorm:"type:varchar(255);unique" valid:"required~uid is required"`
	Address        string `json:"address" gorm:"type:varchar(255)" valid:"required~address is required"`
	BirthDate      string `json:"birth_date" gorm:"type:date" valid:"required~birthDate is required"` // ปรับเป็น type:date เพื่อมาตรฐานข้อมูล
	Nickname       string `json:"nickname" gorm:"type:varchar(100)" valid:"required~nickname is required"`
	ProfilePicture string `json:"profile_picture" gorm:"type:varchar(255)" valid:"required~profilePicture is required"`
	Specialization string `json:"specialization" gorm:"type:varchar(255)" valid:"required~specialization is required"`
	CoachLicense   string `json:"coach_license" gorm:"type:varchar(50)" valid:"required~coachLicense is required"`
	BankAccount    string `json:"bank_account" gorm:"type:varchar(255)" valid:"required~bankAccount is required"`
	PaymentInfo    string `json:"payment_info" gorm:"type:varchar(255)" valid:"required~paymentInfo is required"`
	// PromptPay = พร้อมเพย์ของโค้ช (เบอร์มือถือหรือเลขบัตรประชาชน) — ไม่บังคับกรอก
	PromptPay      string `json:"prompt_pay" gorm:"type:varchar(50)"`
	// PaymentType กำหนดวิธีจ่ายค่าจ้างของโค้ชคนนี้: "per_session" (รายครั้ง) หรือ "monthly" (รายเดือน)
	// มีค่าเดียวต่อโค้ชหนึ่งคน — ไม่ให้กรอกอัตราทั้งสองแบบพร้อมกันเพื่อกันข้อมูลขัดแย้งกัน
	PaymentType string  `json:"payment_type" gorm:"type:varchar(20);default:'per_session'" valid:"required~paymentType is required"`
	PayRate     float64 `json:"pay_rate" gorm:"type:decimal(10,2);default:0"` // อัตราค่าจ้าง: บาท/ครั้ง ถ้า per_session หรือ บาท/เดือน ถ้า monthly

	// PersonalQRCode คือ QR ประจำตัวถาวรของโค้ช ใช้สแกนเช็คชื่อเข้างาน
	//
	// ใช้ namespace เดียวกับ QR ของลูกค้า คือค่าไม่ซ้ำกันข้ามทั้งสองตาราง
	// เพื่อให้เครื่องสแกนตัวเดียวอ่านได้ทั้งนักเรียนและโค้ชโดยไม่ต้องแยกโหมด
	//
	// ⚠️ ห้ามคำนวณจากอีเมล ชื่อ หรือเลขบัตรประชาชน ต้องสุ่มผ่าน
	// services.GenerateUniqueQRCode เท่านั้น (ดูเหตุผลใน services/personal_qr.go)
	PersonalQRCode string `json:"personalQR" gorm:"type:varchar(64);unique"`

	// MemberCode คือรหัสประจำตัวแบบอ่านออกพูดได้ เช่น KYC0001
	//
	// ใช้ชุดเลขเดียวกับนักเรียน รหัสหนึ่งค่าจึงชี้ไปหาคนได้คนเดียวเสมอ
	// เจ้าหน้าที่พิมพ์รหัสแล้วหาเจอเลย ไม่ต้องเลือกก่อนว่าจะค้นนักเรียนหรือโค้ช
	//
	// ⚠️ ห้ามใช้ยืนยันตัวตนแทน PersonalQRCode (ดู services/member_code.go)
	MemberCode string `json:"memberCode" gorm:"type:varchar(16);index"`

	// FaceConsentStatus คือสถานะความยินยอมให้เก็บข้อมูลใบหน้า (ข้อมูลชีวภาพ)
	// โค้ชก็ต้องให้ความยินยอมเหมือนนักเรียน เพราะใช้สแกนหน้าเช็คชื่อเข้างาน
	//
	// เป็นค่าที่ denormalize มาจากแถวล่าสุดของตาราง biometric_consents โดยตั้งใจ
	// (แถวที่ coach_id ตรงกับโค้ชคนนี้)
	//
	// ⚠️ กติกาเดียวกับฝั่ง Customer: การเขียน biometric_consents และการอัปเดตฟิลด์นี้
	// ต้องอยู่ใน transaction เดียวกันเสมอ ไม่งั้นหลักฐานกับสถานะจะหลุดจากกัน
	FaceConsentStatus FaceConsentStatus `json:"face_consent_status" gorm:"type:varchar(20);default:'unknown'"`

	// FeatureOnHome เลือกให้โค้ชคนนี้แสดงในส่วนบุคลากรของหน้าแรกสาธารณะ
	FeatureOnHome bool `json:"feature_on_home" gorm:"default:false"`

	CoachAvailability []CoachAvailability `json:"coach_availability" gorm:"foreignKey:CoachID;constraint:OnDelete:CASCADE;"`
	WorkSchedules     []WorkSchedule      `json:"work_schedules" gorm:"foreignKey:CoachID;constraint:OnDelete:CASCADE;"`
	Photos            []Photo             `json:"photo" gorm:"foreignKey:CoachID;constraint:OnDelete:CASCADE;"`
	CoachAttendances []CoachAttendance `json:"coach_attendances" gorm:"foreignKey:CoachID;constraint:OnDelete:CASCADE;"`
}