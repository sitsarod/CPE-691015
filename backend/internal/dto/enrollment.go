package dto

import "time"

// CreateEnrollmentReq รับข้อมูลตอนผู้ใช้กด "สมัครเรียน"
type CreateEnrollmentReq struct {
	CustomerID uint `json:"customer_id" binding:"required"`
	PackageID  uint `json:"package_id" binding:"required"`
}

// CreateEnrollmentRes ส่งข้อมูลกลับไปให้หน้าเว็บเพื่อพาไปหน้าชำระเงิน
type CreateEnrollmentRes struct {
	Message string               `json:"message"`
	Data    CreateEnrollmentData `json:"data"`
}

// CreateEnrollmentData โครงสร้างข้อมูลที่ส่งกลับไปใน Data
type CreateEnrollmentData struct {
	EnrollmentID uint  `json:"enrollment_id"`
	BillingID    *uint `json:"billing_id"`
}

// UpdateEnrollmentReq รับข้อมูลตอนแอดมินต้องการแก้ไขสถานะหรือโควตา
type UpdateEnrollmentReq struct {
	Status             *string  `json:"status" binding:"omitempty,oneof=active completed cancelled"`
	RemainingSessions  *float64 `json:"remaining_sessions" binding:"omitempty,min=0"`
	IsScheduleUnlocked *bool    `json:"is_schedule_unlocked" binding:"omitempty"`
}




// SetupScheduleReq รับข้อมูลตอนจัดตารางเรียน (รองรับหลายวัน)
type SetupScheduleReq struct {
	WeeklySchedules []WeeklyScheduleItemReq `json:"weekly_schedules" binding:"required,dive,min=1"`
}

// WeeklyScheduleItemReq โครงสร้างย่อยของเวลาเรียนแต่ละวัน
type WeeklyScheduleItemReq struct {
	DayOfWeek string `json:"day_of_week" binding:"required,oneof=Monday Tuesday Wednesday Thursday Friday Saturday Sunday"`
	StartTime string `json:"start_time" binding:"required"`
	EndTime   string `json:"end_time" binding:"required"`
}

// UpdateSingleScheduleReq รับข้อมูลตอนแก้ไขเวลาเรียน
type UpdateSingleScheduleReq struct {
	DayOfWeek string `json:"day_of_week" binding:"required,oneof=Monday Tuesday Wednesday Thursday Friday Saturday Sunday"`
	StartTime string `json:"start_time" binding:"required"`
	EndTime   string `json:"end_time" binding:"required"`
}


// EnrollmentRes โครงสร้างที่จะส่งกลับไปตอนดึงประวัติการลงทะเบียน
type EnrollmentRes struct {
	ID                 uint              `json:"id"`
	EnrollmentDate     time.Time         `json:"enrollment_date"`
	TotalSessions      uint              `json:"total_sessions"`
	RemainingSessions  uint              `json:"remaining_sessions"`
	IsScheduleUnlocked bool              `json:"is_schedule_unlocked"`
	Status             string            `json:"status"`
	BillingID          *uint             `json:"billing_id"`
	
	Package            *PackageInfoRes   `json:"package"`
	WeeklySchedules    []ScheduleInfoRes `json:"weekly_schedules"`
}

// PackageInfoRes โครงสร้างย่อยของแพ็กเกจ
type PackageInfoRes struct {
	ID            uint    `json:"id"`
	CourseID      uint    `json:"course_id"`
	Price         float64 `json:"price"`
	SessionsCount uint    `json:"sessions_count"`
	CourseName    string  `json:"course_name"`
}

// ScheduleInfoRes โครงสร้างย่อยของตารางเรียน
type ScheduleInfoRes struct {
	ID        uint   `json:"id"`
	DayOfWeek string `json:"day_of_week"`
	StartTime string `json:"start_time"`
	EndTime   string `json:"end_time"`
}