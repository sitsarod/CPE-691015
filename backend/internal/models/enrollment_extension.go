package models

import (
	"time"

	"gorm.io/gorm"
)

type EnrollmentExtension struct {
	gorm.Model

	EnrollmentID uint        `json:"enrollment_id" gorm:"index;not null"`
	Enrollment   *Enrollment `json:"-" gorm:"foreignKey:EnrollmentID"`

	// Reason = เหตุผลที่ขยายให้ บังคับกรอกที่ชั้น service
	Reason string `json:"reason" gorm:"type:text"`

	PreviousExpiresAt *time.Time `json:"previous_expires_at"`
	NewExpiresAt      *time.Time `json:"new_expires_at"`

	PreviousTotalSessions uint `json:"previous_total_sessions"`
	NewTotalSessions      uint `json:"new_total_sessions"`

	PreviousRemainingSessions uint `json:"previous_remaining_sessions"`
	NewRemainingSessions      uint `json:"new_remaining_sessions"`
	CarriedOverSessions       uint `json:"carried_over_sessions"`
	ForfeitedSessions         uint `json:"forfeited_sessions"`

	CarryOverExpiresAt *time.Time `json:"carry_over_expires_at"`

	// ExtendedByUserID = users.id ของแอดมินที่กดขยาย (ดึงจาก JWT ไม่ใช่จาก body)
	ExtendedByUserID uint `json:"extended_by_user_id" gorm:"not null"`
}
