package models

import (
	"time"

	"gorm.io/gorm"
)

type EnrollmentStatus string

const (
	EnrollmentStatusActive    EnrollmentStatus = "active"
	EnrollmentStatusCompleted EnrollmentStatus = "completed"
	EnrollmentStatusCancelled EnrollmentStatus = "cancelled"
)

type Enrollment struct {
	gorm.Model

	EnrollmentDate     time.Time        `json:"enrollment_date" valid:"required~enrollmentDate is required"`
	TotalSessions      uint             `json:"total_sessions" valid:"required~totalSessions is required"`
	RemainingSessions  uint             `json:"remaining_sessions" valid:"required~remainingSessions is required"`
	IsScheduleUnlocked bool             `json:"is_schedule_unlocked" gorm:"default:false"`
	Status             EnrollmentStatus `json:"status" gorm:"type:varchar(20);default:'active'"`

	// Foreign Keys
	PackageID  uint `json:"package_id" valid:"required~packageId is required"`
	CustomerID uint `json:"customer_id" valid:"required~customerId is required"`
	BillingID  *uint `json:"billing_id"`

	// Relationships
	Package         *Package         `json:"package" gorm:"foreignKey:PackageID"`
	Customer        *Customer        `json:"customer" gorm:"foreignKey:CustomerID"`
	Billing            *Billing            `json:"billing" gorm:"foreignKey:BillingID"`
	WeeklySchedules []WeeklySchedule `json:"weekly_schedules" gorm:"foreignKey:EnrollmentID"`
	StudentAttendances []StudentAttendance `json:"student_attendances" gorm:"foreignKey:EnrollmentID"`
}