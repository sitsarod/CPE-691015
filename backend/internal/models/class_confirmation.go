package models

import (
	"time"

	"gorm.io/gorm"
)

type ClassConfirmationStatus string

const (
	ClassConfirmationGoing ClassConfirmationStatus = "going"
)

// ClassConfirmation คือการยืนยันล่วงหน้าว่าจะมาเรียนคาบวันนั้น
//
// โรงเรียนต้องจองสนามล่วงหน้า แต่ StudentAttendance ตอบได้ต่อเมื่อคนมาถึงแล้ว
//
// มีสองสถานะ: ยืนยันแล้ว = มีแถว · ยังไม่ตอบ = ไม่มีแถว
//
// ⚠️ ยกเลิกต้องลบถาวร (Unscoped) — unique index ข้างล่างไม่รวม deleted_at
// แถวที่ soft delete จะยังกินที่ใน index แล้วยืนยันใหม่ไม่ได้อีกเลย
type ClassConfirmation struct {
	gorm.Model

	// หนึ่งใบลงทะเบียนตอบได้วันละคำตอบเดียว — ด่านสุดท้ายกันกดรัว ๆ จนเกิดสองแถว
	EnrollmentID uint        `json:"enrollment_id" gorm:"not null;uniqueIndex:idx_class_confirmation_enrollment_date"`
	Enrollment   *Enrollment `json:"enrollment,omitempty" gorm:"foreignKey:EnrollmentID"`

	ClassDate time.Time `json:"class_date" gorm:"type:date;not null;uniqueIndex:idx_class_confirmation_enrollment_date"`

	Status ClassConfirmationStatus `json:"status" gorm:"type:varchar(20);not null"`

	// สแนปช็อตเวลาคาบตอนที่ตอบ — แอดมินอาจแก้ PackageSchedule ทีหลัง
	// แล้วรายงานย้อนหลังจะอ่านไม่ตรงกับคาบที่นักเรียนตอบไปจริง
	ScheduleStartTime string `json:"schedule_start_time" gorm:"type:varchar(10)"`
	ScheduleEndTime   string `json:"schedule_end_time" gorm:"type:varchar(10)"`

	RespondedAt time.Time `json:"responded_at"`
}
