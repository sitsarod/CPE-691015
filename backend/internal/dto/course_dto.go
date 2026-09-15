package dto

type CreateCourseReq struct {
	CourseName  string `json:"course_name" binding:"required"`
	Description string `json:"description" binding:"required"`
	Status      string `json:"status" binding:"omitempty,oneof=active inactive draft"`
	LearningOutcomes []string `json:"learning_outcomes"`

	// URL ที่อัปโหลดผ่าน POST /upload มาแล้ว ไม่ใช่ไฟล์
	ImageURL string `json:"image_url"`
}

type UpdateCourseReq struct {
	CourseName       *string   `json:"course_name"`
	Description      *string   `json:"description"`
	Status           *string   `json:"status"`
	LearningOutcomes *[]string `json:"learning_outcomes"`

	// ส่ง "" มา = ลบรูปปกทิ้ง ซึ่งต่างจากไม่ส่งฟิลด์นี้เลย (= ไม่แตะ)
	ImageURL *string `json:"image_url"`
}

type CourseDTO struct {
	ID          uint   `json:"id"`
	CourseName  string `json:"course_name"`
	Description string `json:"description"`
	Status      string `json:"status"`
	ImageURL    string `json:"image_url"`
	LearningOutcomes []string           `json:"learning_outcomes"`
	User             *CourseUserDTO     `json:"user"`
	Packages         []CoursePackageDTO `json:"packages"`
}

type CourseUserDTO struct {
	FirstName string `json:"firstname"`
	LastName  string `json:"lastname"`
	Email     string `json:"email"`
}

type CoursePackageDTO struct {
	ID            uint    `json:"id"`
	SessionsCount uint    `json:"sessions_count"`
	HoursCount    uint    `json:"hours_count"`
	Price         float64 `json:"price"`
	MaxSeats      uint    `json:"max_seats"`
	DurationDays uint `json:"duration_days"`
	IsTrial      bool `json:"is_trial"`
	CurrentEnrollments uint                     `json:"current_enrollments"`
	Schedules          []PackageScheduleInfoDTO `json:"schedules"`
}

type PackageScheduleInfoDTO struct {
	DayOfWeek string `json:"day_of_week"`
	StartTime string `json:"start_time"`
	EndTime   string `json:"end_time"`
}