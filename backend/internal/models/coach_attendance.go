package models

import (
	"time"

	"gorm.io/gorm"
)

// CoachAttendance คือบันทึกว่าโค้ชมาสอนคาบไหน (รายคาบ ไม่ใช่รายวัน)
//
// ⚠️ ไม่ได้ใช้คำนวณค่าจ้าง — ค่าจ้างนับจาก WorkSchedule (ดู taughtSessionDates)
// ถ้าจะเปลี่ยนมาคิดจากตารางนี้ ต้องตอบก่อนว่า "โค้ชลืมสแกนแล้วไม่ได้เงิน" จะเอายังไง
type CoachAttendance struct {
	gorm.Model

	// สแนปช็อตวันของคาบ เก็บซ้ำไว้สรุปรายเดือนโดยไม่ต้อง join · ไม่ใช่ตัวกันซ้ำ
	WorkDate time.Time `json:"work_date" gorm:"type:date;index" valid:"required~workDate is required"`

	CheckInTime   time.Time        `json:"check_in_time" valid:"required~checkInTime is required"`
	CheckInMethod CheckInMethod    `json:"check_in_method" gorm:"type:varchar(50)"`
	Status        AttendanceStatus `json:"status" gorm:"type:varchar(20);default:'present'"`

	// เตรียมไว้ให้การสแกนใบหน้าของโค้ช ยังไม่มีใครเขียนลง
	SnapshotURL     string  `json:"snapshot_url" gorm:"type:varchar(255)"`
	ConfidenceScore float64 `json:"confidence_score"`

	// Foreign Keys — unique คู่นี้คือด่านกันเช็คชื่อซ้ำในคาบเดียวกัน
	//
	// ⚠️ soft delete ของ gorm.Model ยังกิน slot ของ unique index จึงยังไม่มี endpoint ลบ
	CoachID             uint `json:"coach_id" gorm:"not null;uniqueIndex:idx_coach_attendance_session" valid:"required~coachId is required"`
	AttendanceSessionID uint `json:"attendance_session_id" gorm:"not null;uniqueIndex:idx_coach_attendance_session"`

	// Relationships
	Coach             *Coach             `json:"coach" gorm:"foreignKey:CoachID"`
	AttendanceSession *AttendanceSession `json:"attendance_session,omitempty" gorm:"foreignKey:AttendanceSessionID"`
}
