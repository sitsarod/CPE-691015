package models

import (
	"time"

	"gorm.io/gorm"
)

// EmailVerificationOTP คือรหัส OTP หนึ่งใบที่ออกให้ผู้ใช้เพื่อยืนยันอีเมลตอนสมัครสมาชิก
//
// โครงเหมือน PasswordResetOTP ทุกอย่าง (ดูเหตุผลของแต่ละฟิลด์ที่นั่น) แต่แยกตาราง
// เพราะคนละเหตุการณ์กัน — ถ้าใช้ตารางร่วมกัน ขอ OTP ยืนยันอีเมลจะไปล้าง OTP กู้รหัสผ่าน
// ที่ยังไม่หมดอายุทิ้งโดยไม่ตั้งใจ (และกลับกัน)
type EmailVerificationOTP struct {
	gorm.Model

	UserID uint  `json:"user_id" gorm:"index;not null"`
	User   *User `json:"-" gorm:"foreignKey:UserID"`

	CodeHash  string     `json:"-" gorm:"type:varchar(255);not null"`
	ExpiresAt time.Time  `json:"expires_at" gorm:"not null"`
	Attempts  int        `json:"attempts" gorm:"default:0"`
	UsedAt    *time.Time `json:"used_at"`
	IPAddress string     `json:"-" gorm:"type:varchar(45)"`
}
