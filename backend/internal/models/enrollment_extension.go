package models

import (
	"time"

	"gorm.io/gorm"
)
type EnrollmentExtension struct {
	gorm.Model

	EnrollmentID uint        `json:"enrollment_id" gorm:"index;not null"`
	Enrollment   *Enrollment `json:"-" gorm:"foreignKey:EnrollmentID"`

	ExtendDays uint `json:"extend_days"`
	ExtendSessions uint `json:"extend_sessions"`

	// Reason = เหตุผลที่ขยายให้ บังคับกรอกที่ชั้น service
	Reason string `json:"reason" gorm:"type:text"`


	PreviousExpiresAt *time.Time `json:"previous_expires_at"`
	NewExpiresAt      *time.Time `json:"new_expires_at"`

	PreviousTotalSessions uint `json:"previous_total_sessions"`
	NewTotalSessions      uint `json:"new_total_sessions"`

	// ExtendedByUserID = users.id ของแอดมินที่กดขยาย (ดึงจาก JWT ไม่ใช่จาก body)
	ExtendedByUserID uint `json:"extended_by_user_id" gorm:"not null"`
}
