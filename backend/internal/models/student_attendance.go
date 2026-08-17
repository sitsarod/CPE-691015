package models

import (
	"time"

	"gorm.io/gorm"
)

// CheckInMethod Enum สำหรับวิธีการเช็คชื่อ
type CheckInMethod string

const (
	CheckInMethodFaceScan CheckInMethod = "face_scan"
	CheckInMethodManual   CheckInMethod = "manual"
	CheckInMethodQRCode   CheckInMethod = "qr_code"
	CheckInMethodSystem CheckInMethod = "system"
)
 
type AttendanceStatus string

const (
	AttendanceStatusPresent AttendanceStatus = "present"
	AttendanceStatusAbsent  AttendanceStatus = "absent"
	AttendanceStatusLeave   AttendanceStatus = "leave"
)

type StudentAttendance struct {
	gorm.Model

	CheckInTime   time.Time        `json:"check_in_time" valid:"required~checkInTime is required"`
	CheckInMethod CheckInMethod    `json:"check_in_method" gorm:"type:varchar(50)"`
	IsOffSchedule bool             `json:"is_off_schedule" gorm:"default:false"`
	Status        AttendanceStatus `json:"status" gorm:"type:varchar(20);default:'present'"`
	Remarks       string           `json:"remarks" gorm:"type:text"`
	SnapshotURL     string  `json:"snapshot_url" gorm:"type:varchar(255)"`
	ConfidenceScore float64 `json:"confidence_score"`

	// Foreign Keys
	EnrollmentID uint  `json:"enrollment_id" gorm:"uniqueIndex:idx_attendance_enrollment_session,where:attendance_session_id IS NOT NULL" valid:"required~enrollmentId is required"`
	UserID       *uint `json:"user_id"`

	AttendanceSessionID *uint              `json:"attendance_session_id" gorm:"index;uniqueIndex:idx_attendance_enrollment_session"`
	AttendanceSession   *AttendanceSession `json:"attendance_session,omitempty" gorm:"foreignKey:AttendanceSessionID"`
	RecordedByUserID *uint `json:"recorded_by_user_id"`

	// Relationships
	Enrollment *Enrollment `json:"enrollment" gorm:"foreignKey:EnrollmentID"`
	User       *User       `json:"user" gorm:"foreignKey:UserID"`
}