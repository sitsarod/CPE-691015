package dto

// Request สำหรับลงทะเบียนหรือสร้าง Coach (admin เป็นคนกรอกทั้งหมด รวมถึงระดับและค่าจ้างเริ่มต้น)
type CreateCoachRequest struct {
	UserID            uint    `json:"user_id" valid:"required~UserID is required"`
	Phone             string  `json:"phone" valid:"required~phone is required"`
	Uid               string  `json:"uid" valid:"required~uid is required"`
	Address           string  `json:"address" valid:"required~address is required"`
	BirthDate         string  `json:"birth_date" valid:"required~birthDate is required"` // รูปแบบ YYYY-MM-DD
	Nickname          string  `json:"nickname" valid:"required~nickname is required"`
	ProfilePicture    string  `json:"profile_picture" valid:"required~profilePicture is required"`
	Specialization    string  `json:"specialization" valid:"required~specialization is required"`
	BankAccount       string  `json:"bank_account" valid:"required~bankAccount is required"`
	PaymentInfo       string  `json:"payment_info" valid:"required~paymentInfo is required"`
	PayRatePerSession float64 `json:"pay_rate_per_session" valid:"required~payRatePerSession is required"` // บาทต่อ 1 ครั้งที่สอน
}

// Request สำหรับ coach แก้ไขข้อมูลตัวเอง
// ตั้งใจไม่ใส่ Specialization และ PayRatePerSession ไว้ที่นี่ เพราะ coach ไม่ควรแก้ระดับ/ค่าจ้างตัวเองได้
// ฟิลด์ 2 ตัวนี้แก้ผ่าน AdminUpdateCoachRequest โดย admin เท่านั้น
type UpdateCoachRequest struct {
    Phone          *string `json:"phone"`
    Address        *string `json:"address"`
    Nickname       *string `json:"nickname"`
    ProfilePicture *string `json:"profile_picture"`
    BankAccount    *string `json:"bank_account"`
    PaymentInfo    *string `json:"payment_info"`
}

// Request สำหรับ admin แก้ไขระดับ (specialization) และค่าจ้างต่อครั้งของ coach
// แยกออกจาก UpdateCoachRequest โดยตั้งใจ เพื่อไม่ให้ coach เรียก endpoint เดียวกันแล้วแก้ค่าพวกนี้ได้เอง
type AdminUpdateCoachRequest struct {
	Specialization    *string  `json:"specialization"`
	PayRatePerSession *float64 `json:"pay_rate_per_session"`
}

// Response สำหรับส่งข้อมูลโค้ชกลับไปแสดงหน้าบ้าน (ใช้กับหน้า list, ซ่อนฟิลด์อ่อนไหวออก)
type CoachResponse struct {
	ID             uint   `json:"id"`
	UserID         uint   `json:"user_id"`
	Nickname       string `json:"nickname"`
	Specialization string `json:"specialization"`
	ProfilePicture string `json:"profile_picture"`
	Phone          string `json:"phone"`
}

type CoachDetailResponse struct {
	ID                uint    `json:"id"`
	UserID            uint    `json:"user_id"`
	FirstName         string  `json:"first_name"`
	LastName          string  `json:"last_name"`
	Email             string  `json:"email"`
	Nickname          string  `json:"nickname"`
	Phone             string  `json:"phone"`
	Uid               string  `json:"uid"`
	Address           string  `json:"address"`
	BirthDate         string  `json:"birth_date"`
	Specialization    string  `json:"specialization"`
	ProfilePicture    string  `json:"profile_picture"`
	PayRatePerSession float64 `json:"pay_rate_per_session"` // แสดงได้ (read-only) แต่แก้ผ่าน endpoint นี้ไม่ได้
}

// โครงสร้างย่อยของวันและเวลาว่างแต่ละช่วง
type AvailabilityDetail struct {
	DayOfWeek string `json:"day_of_week" valid:"required~dayOfWeek is required"` // เช่น "Monday", "Tuesday"
	StartTime string `json:"start_time" valid:"required~startTime is required"`   // เช่น "09:00"
	EndTime   string `json:"end_time" valid:"required~endTime is required"`       // เช่น "12:00"
}

// Request เมื่อโค้ชกดยืนยันตารางเวลาว่างทั้งหมดเข้ามา
type UpdateCoachAvailabilityRequest struct {
	Availabilities []AvailabilityDetail `json:"availabilities" valid:"required"`
}

// Response สำหรับส่งตารางเวลาว่างกลับไปให้หน้าบ้านหรือ Admin ดู
type CoachAvailabilityResponse struct {
	CoachID        uint                 `json:"coach_id"`
	Nickname       string               `json:"nickname"`
	Availabilities []AvailabilityDetail `json:"availabilities"`
}

// Request เมื่อ Admin เป็นคนสร้างตารางงานให้โค้ช
type CreateWorkScheduleRequest struct {
	CoachID     uint   `json:"coach_id" valid:"required~coachId is required"`
	CourseID    uint   `json:"course_id" valid:"required~courseId is required"`
	Date        string `json:"date" valid:"required~date is required"` // รูปแบบ YYYY-MM-DD
	StartTime   string `json:"start_time" valid:"required~startTime is required"`
	EndTime     string `json:"end_time" valid:"required~endTime is required"`
	CourtNumber string `json:"court_number" valid:"required~courtNumber is required"`
	Description string `json:"description"`
}

// Response สำหรับแสดงผลปฏิทินงานของโค้ชคนนั้นๆ
type WorkScheduleResponse struct {
	ID          uint   `json:"id"`
	Date        string `json:"date"`
	StartTime   string `json:"start_time"`
	EndTime     string `json:"end_time"`
	CourtNumber string `json:"court_number"`
	CourseName  string `json:"course_name,omitempty"` 
	Description string `json:"description"`
}