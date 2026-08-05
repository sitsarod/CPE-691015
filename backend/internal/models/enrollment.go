package models

import (
	"time"

	"gorm.io/gorm"
)

type EnrollmentStatus string

const (
	EnrollmentStatusPending EnrollmentStatus = "pending" // รอแอดมินอนุมัติ

	// EnrollmentStatusAwaitingPayment = อนุมัติแล้ว แต่ยังเรียนไม่ได้จนกว่าจะชำระเงิน
	//
	// ใช้เฉพาะ "คอร์สแรก" ของนักเรียนแต่ละคน (ดู EnrollmentService.ApproveEnrollment)
	// นักเรียนเก่าที่เคยเรียนแล้วจะข้ามสถานะนี้ไปเป็น active ทันทีที่อนุมัติ
	//
	// สถานะนี้ "จองที่นั่งไว้แล้ว" จึงต้องถูกนับรวมทุกที่ที่นับที่นั่ง
	// มิฉะนั้นจะขายที่นั่งเกิน (ดู enrollmentSeatStatuses ใน services/course.go)
	EnrollmentStatusAwaitingPayment EnrollmentStatus = "awaiting_payment"

	EnrollmentStatusActive    EnrollmentStatus = "active" // เรียนได้ มีตารางเรียน
	EnrollmentStatusCompleted EnrollmentStatus = "completed"
	EnrollmentStatusCancelled EnrollmentStatus = "cancelled"
)

type Enrollment struct {
	gorm.Model

	EnrollmentDate     time.Time        `json:"enrollment_date" valid:"required~enrollmentDate is required"`
	TotalSessions      uint             `json:"total_sessions" valid:"required~totalSessions is required"`
	RemainingSessions  uint             `json:"remaining_sessions" valid:"required~remainingSessions is required"`
	Status             EnrollmentStatus `json:"status" gorm:"type:varchar(20);default:'pending'"`

	// Foreign Keys
	PackageID  uint `json:"package_id" valid:"required~packageId is required"`
	CustomerID uint `json:"customer_id" valid:"required~customerId is required"`
	BillingID  *uint `json:"billing_id"`

	// Relationships
	Package         *Package         `json:"package" gorm:"foreignKey:PackageID"`
	Customer        *Customer        `json:"customer" gorm:"foreignKey:CustomerID"`
	Billing            *Billing            `json:"billing" gorm:"foreignKey:BillingID"`
	StudentAttendances []StudentAttendance `json:"student_attendances" gorm:"foreignKey:EnrollmentID"`
}