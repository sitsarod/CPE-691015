package dto

// ยืนยันการมาเรียนล่วงหน้า
//
// วันที่ทุกตัวในไฟล์นี้เป็นสตริง "2006-01-02" ไม่ใช่ time.Time เพราะเป็นวัน
// ตามปฏิทิน ไม่ใช่จุดเวลา — ส่งเป็น timestamp แล้วโซนเวลาต่างกันจะเลื่อนหนึ่งวัน

// pending ไม่มีในฐานข้อมูล (= ไม่มีแถว) service เติมให้ตอนประกอบคำตอบ
const (
	ConfirmationStatusGoing   = "going"
	ConfirmationStatusPending = "pending"
)

// UpcomingClassDTO คือคาบหนึ่งคาบที่นักเรียนเห็นและกดตอบได้
type UpcomingClassDTO struct {
	EnrollmentID uint   `json:"enrollment_id"`
	PackageID    uint   `json:"package_id"`
	CourseName   string `json:"course_name"`

	ClassDate string `json:"class_date"` // 2006-01-02
	DayOfWeek string `json:"day_of_week"`
	StartTime string `json:"start_time"`
	EndTime   string `json:"end_time"`

	Status string `json:"status"` // going | pending

	// เวลาปิดรับ (RFC3339) และยังกดได้อยู่ไหม — ใช้แสดงผลเท่านั้น สิทธิ์จริง backend ตัดสิน
	ConfirmDeadline string `json:"confirm_deadline"`
	IsOpen          bool   `json:"is_open"`
}

// ⚠️ ไม่มี customer_id ทั้ง ConfirmClassReq และ CancelClassReq
// ตัวตนมาจาก JWT เสมอ ไม่งั้นตอบแทนคนอื่นได้
type ConfirmClassReq struct {
	EnrollmentID uint   `json:"enrollment_id" binding:"required"`
	ClassDate    string `json:"class_date" binding:"required"` // 2006-01-02
	Status       string `json:"status" binding:"required,oneof=going"`
}

// CancelClassReq — ยกเลิกการยืนยัน กลับไปเป็น "ยังไม่ตอบ"
type CancelClassReq struct {
	EnrollmentID uint   `json:"enrollment_id" binding:"required"`
	ClassDate    string `json:"class_date" binding:"required"` // 2006-01-02
}

// ClassHeadcountDTO คือยอดสรุปของคาบหนึ่งคาบที่แอดมินใช้ตัดสินใจจองสนาม
type ClassHeadcountDTO struct {
	PackageID  uint   `json:"package_id"`
	CourseID   uint   `json:"course_id"`
	CourseName string `json:"course_name"`

	ClassDate string `json:"class_date"`
	DayOfWeek string `json:"day_of_week"`
	StartTime string `json:"start_time"`
	EndTime   string `json:"end_time"`

	// Total = คนที่มีสิทธิ์เรียนคาบนี้ = Going + Pending
	Total   int `json:"total"`
	Going   int `json:"going"`
	Pending int `json:"pending"`

	// พ้นเส้นตายแล้ว ตัวเลขจะไม่เปลี่ยนอีก
	IsClosed bool `json:"is_closed"`
}

// ─── รายชื่อรายคาบ (แอดมินกดดูว่าใครตอบอะไร) ────────────────────────────────

// ClassRosterItemDTO คือนักเรียนหนึ่งคนในรายชื่อของคาบหนึ่ง
// มีเบอร์โทรให้แอดมินติดต่อกลับ — endpoint ที่ใช้เป็น adminOnly เท่านั้น
type ClassRosterItemDTO struct {
	EnrollmentID uint   `json:"enrollment_id"`
	CustomerID   uint   `json:"customer_id"`
	Nickname     string `json:"nickname"`
	FullName     string `json:"full_name"`
	PhoneNumber  string `json:"phone_number,omitempty"`

	Status string `json:"status"` // going | pending
}

// ClassRosterDTO คือรายชื่อทั้งคาบ แบ่งกลุ่มมาแล้ว
// แบ่งที่ server เพราะกติกาอยู่ที่นี่ ถ้าให้หน้าเว็บแบ่งเองจะมีสองที่ที่ต้องรู้กติกาเดียวกัน
type ClassRosterDTO struct {
	PackageID  uint   `json:"package_id"`
	CourseID   uint   `json:"course_id"`
	CourseName string `json:"course_name"`

	ClassDate string `json:"class_date"`
	DayOfWeek string `json:"day_of_week"`
	StartTime string `json:"start_time"`
	EndTime   string `json:"end_time"`

	IsClosed bool `json:"is_closed"`

	Going   []ClassRosterItemDTO `json:"going"`
	Pending []ClassRosterItemDTO `json:"pending"`
}
