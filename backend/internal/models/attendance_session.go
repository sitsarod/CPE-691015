package models

import (
	"time"

	"gorm.io/gorm"
)

type AttendanceSessionStatus string

const (
	AttendanceSessionOpen   AttendanceSessionStatus = "open"
	AttendanceSessionClosed AttendanceSessionStatus = "closed"
)

// AttendanceSession คือ "รอบเช็คชื่อ" ที่แอดมินเปิดไว้ที่สนามหนึ่งครั้ง
//
// ─── ทำไมผูกกับ Package ไม่ใช่ WorkSchedule ───
//
// ตารางเรียนที่นักเรียนยึดถือคือ PackageSchedule (เช่น จ./พ./ศ. 18:00-20:00)
// ส่วน WorkSchedule เป็นตารางงานของโค้ชซึ่งแอดมินอาจไม่ได้สร้างไว้ทุกคาบ
// ถ้าไปผูกกับตัวนั้น จะเช็คชื่อไม่ได้ทุกครั้งที่แอดมินลืมสร้างตารางงาน
// ทั้งที่นักเรียนมาเรียนจริงตามตารางที่เห็น
type AttendanceSession struct {
	gorm.Model

	// PackageID + SessionDate ต้องไม่ซ้ำกัน — หนึ่งแพ็กเกจมีรอบเช็คชื่อได้วันละรอบเดียว
	//
	// ⚠️ ถ้าเปิดซ้ำได้ นักเรียนจะเช็คชื่อได้สองครั้งในวันเดียว = โควตาหายสองครั้ง
	// unique index จึงเป็นด่านสุดท้ายที่กันกรณีแอดมินสองคนกดเปิดพร้อมกัน
	// ซึ่งการเช็ค if ในโค้ดกันไม่ได้ (race condition)
	PackageID uint     `json:"package_id" gorm:"not null;uniqueIndex:idx_attendance_session_pkg_date"`
	Package   *Package `json:"package,omitempty" gorm:"foreignKey:PackageID"`

	SessionDate time.Time `json:"session_date" gorm:"type:date;not null;uniqueIndex:idx_attendance_session_pkg_date"`

	Status   AttendanceSessionStatus `json:"status" gorm:"type:varchar(20);default:'open'"`
	OpenedAt time.Time               `json:"opened_at" gorm:"not null"`
	ClosedAt *time.Time              `json:"closed_at"`

	// users.id ของแอดมินที่เปิด/ปิดรอบ — การปิดรอบหักโควตาคนที่ไม่มาทุกคน
	// จึงต้องตอบได้ว่าใครเป็นคนสั่ง
	OpenedByUserID uint  `json:"opened_by_user_id" gorm:"not null"`
	ClosedByUserID *uint `json:"closed_by_user_id"`

	// สแนปช็อตเวลาคาบตอนเปิดรอบ
	//
	// เก็บแยกเพราะแอดมินอาจแก้ PackageSchedule ทีหลัง แล้วประวัติจะอ่านไม่ตรง
	// กับความจริงที่เกิดขึ้นวันนั้น (เช่นย้ายคาบจาก 18:00 เป็น 17:00 แล้วประวัติเก่าเพี้ยนตาม)
	ScheduleStartTime string `json:"schedule_start_time" gorm:"type:varchar(10)"`
	ScheduleEndTime   string `json:"schedule_end_time" gorm:"type:varchar(10)"`
}
