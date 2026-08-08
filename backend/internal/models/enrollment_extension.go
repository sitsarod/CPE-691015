package models

import (
	"time"

	"gorm.io/gorm"
)
type EnrollmentExtension struct {
	gorm.Model

	EnrollmentID uint        `json:"enrollment_id" gorm:"index;not null"`
	Enrollment   *Enrollment `json:"-" gorm:"foreignKey:EnrollmentID"`

	// ExtendDays = จำนวนวันที่ยืดออกไป นับต่อจาก ExpiresAt เดิม (ไม่ใช่นับจากวันนี้)
	ExtendDays uint `json:"extend_days" gorm:"not null"`

	// Reason = เหตุผลที่ขยายให้ บังคับกรอกที่ชั้น service
	Reason string `json:"reason" gorm:"type:text"`
	PreviousExpiresAt *time.Time `json:"previous_expires_at"`
	NewExpiresAt      *time.Time `json:"new_expires_at"`

	// ExtendedByUserID = users.id ของแอดมินที่กดขยาย (ดึงจาก JWT ไม่ใช่จาก body)
	ExtendedByUserID uint `json:"extended_by_user_id" gorm:"not null"`
}
