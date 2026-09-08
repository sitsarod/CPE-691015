package services

import (
	"log"

	"gorm.io/gorm"
)

func EnsureAttendanceUniqueIndexes(db *gorm.DB) error {
	return db.Exec(`
		CREATE UNIQUE INDEX IF NOT EXISTS uniq_attendance_person_session
		ON student_attendances (user_id, attendance_session_id)
		WHERE deleted_at IS NULL
		  AND user_id IS NOT NULL
		  AND attendance_session_id IS NOT NULL
	`).Error
}

func EnsureClassConfirmationIndexes(db *gorm.DB) error {
	if err := db.Exec(`DROP INDEX IF EXISTS idx_class_confirmation_enrollment_date`).Error; err != nil {
		log.Printf("ข้ามการรื้อ index ยืนยันตัวเก่า (ปกติถ้าเป็นฐานที่สร้างใหม่): %v", err)
	}
	return nil
}
