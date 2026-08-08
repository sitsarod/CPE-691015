package dto

// สำหรับรับข้อมูลเวลาเรียนแต่ละวัน
type PackageScheduleReq struct {
	DayOfWeek string `json:"day_of_week" binding:"required,oneof=Monday Tuesday Wednesday Thursday Friday Saturday Sunday"`
	StartTime string `json:"start_time" binding:"required"`
	EndTime   string `json:"end_time" binding:"required"`
}

// CreatePackageReq รับข้อมูลตอนสร้างแพ็กเกจใหม่
type CreatePackageReq struct {
	CourseID      uint                 `json:"course_id" binding:"required"`
	SessionsCount uint                 `json:"sessions_count" binding:"required"`
	HoursCount    uint                 `json:"hours_count" binding:"required"`
	MaxSeats      uint                 `json:"max_seats" binding:"required"`
	Price         float64              `json:"price" binding:"required"`
	DurationDays uint `json:"duration_days" binding:"omitempty,max=366"`

	Schedules []PackageScheduleReq `json:"schedules" binding:"required,dive"`
}

// UpdatePackageReq รับข้อมูลตอนแก้ไขแพ็กเกจ
type UpdatePackageReq struct {
	SessionsCount *uint    `json:"sessions_count" binding:"omitempty"`
	HoursCount    *uint    `json:"hours_count" binding:"omitempty"`
	MaxSeats      *uint    `json:"max_seats" binding:"omitempty"`
	Price         *float64 `json:"price" binding:"omitempty"`
	DurationDays *uint `json:"duration_days" binding:"omitempty,min=1,max=366"`

	Schedules *[]PackageScheduleReq `json:"schedules" binding:"omitempty,dive"`
}