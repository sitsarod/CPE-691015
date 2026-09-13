package models

import (
	"time"

	"gorm.io/gorm"
)

// SessionCarryOver = ครั้งคงเหลือที่ทบเก็บไว้ ใช้ได้เฉพาะคอร์สเดิม (แพ็กเกจไหนในคอร์สก็ได้)
type SessionCarryOver struct {
	gorm.Model

	CustomerID uint      `json:"customer_id" gorm:"index;not null"`
	Customer   *Customer `json:"-" gorm:"foreignKey:CustomerID"`

	CourseID uint `json:"course_id" gorm:"index"`

	FromEnrollmentID uint        `json:"from_enrollment_id" gorm:"index;not null"`
	FromEnrollment   *Enrollment `json:"-" gorm:"foreignKey:FromEnrollmentID"`

	Sessions uint `json:"sessions" gorm:"not null"`

	ExpiresAt time.Time `json:"expires_at" gorm:"index;not null"`

	ConsumedByEnrollmentID *uint       `json:"consumed_by_enrollment_id" gorm:"index"`
	ConsumedBy             *Enrollment `json:"-" gorm:"foreignKey:ConsumedByEnrollmentID"`
	ConsumedAt             *time.Time  `json:"consumed_at"`

	CreatedByUserID uint `json:"created_by_user_id" gorm:"not null"`
}
