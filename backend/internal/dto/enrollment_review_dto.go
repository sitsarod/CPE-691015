package dto

import "time"


// EnrollmentReviewDTO คือข้อมูลทั้งหมดที่แอดมินต้องใช้ตัดสินใจอนุมัติหนึ่งคำขอ
type EnrollmentReviewDTO struct {
	Enrollment       ReviewEnrollmentInfo   `json:"enrollment"`
	Customer         ReviewCustomerInfo     `json:"customer"`
	Package          ReviewPackageInfo      `json:"package"`
	Finance          ReviewFinanceInfo      `json:"finance"`
	OtherEnrollments []ReviewOtherEnrollment `json:"other_enrollments"`
}

// ReviewEnrollmentInfo ข้อมูลคำขอที่กำลังตรวจ
type ReviewEnrollmentInfo struct {
	ID                uint      `json:"id"`
	Status            string    `json:"status"`
	EnrollmentDate    time.Time `json:"enrollment_date"`
	TotalSessions     uint      `json:"total_sessions"`
	RemainingSessions uint      `json:"remaining_sessions"`
	BillingID         *uint     `json:"billing_id"`
	// WaitingDays จำนวนวันที่คำขอนี้รออยู่ ใช้จัดลำดับความเร่งด่วน
	WaitingDays int `json:"waiting_days"`
}

// ReviewCustomerInfo ข้อมูลส่วนตัวและการติดต่อของผู้สมัคร
type ReviewCustomerInfo struct {
	UserID uint `json:"user_id"`
	CustomerID uint `json:"customer_id"`

	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	Nickname  string `json:"nickname"`
	Email     string `json:"email"`
	Phone     string `json:"phone"`

	BirthDate *time.Time `json:"birth_date"`
	Age    *int   `json:"age"`
	Gender string `json:"gender"`

	ParentEmail string `json:"parent_email"`
	ParentPhone string `json:"parent_phone"`

	// Status คือสถานะลูกค้า (active/inactive) — inactive ควรตรวจก่อนอนุมัติ
	Status string `json:"status"`
	FaceConsentStatus string    `json:"face_consent_status"`
	MemberSince       time.Time `json:"member_since"`
}

// ReviewPackageInfo ข้อมูลแพ็กเกจที่สมัคร พร้อมสถานะที่นั่ง
type ReviewPackageInfo struct {
	ID            uint    `json:"id"`
	CourseID      uint    `json:"course_id"`
	CourseName    string  `json:"course_name"`
	CourseStatus  string  `json:"course_status"`
	SessionsCount uint    `json:"sessions_count"`
	HoursCount    uint    `json:"hours_count"`
	Price         float64 `json:"price"`

	MaxSeats uint `json:"max_seats"`
	// ActiveCount = จำนวนที่อนุมัติแล้ว — เป็นตัวเลขที่ ApproveEnrollment ใช้ตัดสินว่าที่นั่งเต็มหรือยัง
	ActiveCount uint `json:"active_count"`
	// PendingCount = จำนวนคำขอที่ยังรออนุมัติ (รวมคำขอนี้ด้วย)
	PendingCount uint `json:"pending_count"`
	// SeatsLeft = MaxSeats - ActiveCount (ที่นั่งที่อนุมัติเพิ่มได้จริงตอนนี้)
	SeatsLeft int `json:"seats_left"`
	// WouldExceedIfAllApproved = true ถ้าอนุมัติคำขอที่ค้างอยู่ทั้งหมดแล้วจะเกินที่นั่ง
	WouldExceedIfAllApproved bool `json:"would_exceed_if_all_approved"`

	Schedules []PackageScheduleInfoDTO `json:"schedules"`
}

// ReviewFinanceInfo สรุปสถานะการเงินของผู้สมัครรายนี้
//
// อ้างอิง billings.customer_id ซึ่งเป็น users.id (ไม่ใช่ customers.id)
type ReviewFinanceInfo struct {
	UnpaidCount  int     `json:"unpaid_count"`
	UnpaidAmount float64 `json:"unpaid_amount"`

	// OverdueCount/Amount นับจาก due_date ที่เลยกำหนดแล้วและยังไม่ชำระ
	//
	// ไม่ได้ใช้สถานะ 'overdue' ในตาราง เพราะระบบยังไม่มีงานที่คอยเลื่อนสถานะบิล
	// จาก unfunded → overdue เมื่อเลยกำหนด ค่าในคอลัมน์จึงไม่สะท้อนความจริง
	OverdueCount  int     `json:"overdue_count"`
	OverdueAmount float64 `json:"overdue_amount"`

	// WaitCheck = แนบสลิปแล้วรอแอดมินตรวจ
	WaitCheckCount  int     `json:"waitcheck_count"`
	WaitCheckAmount float64 `json:"waitcheck_amount"`

	PaidCount  int     `json:"paid_count"`
	PaidAmount float64 `json:"paid_amount"`
}

// ReviewOtherEnrollment คำขอ/คอร์สอื่นของผู้สมัครคนเดียวกัน
type ReviewOtherEnrollment struct {
	ID                uint      `json:"id"`
	CourseName        string    `json:"course_name"`
	SessionsCount     uint      `json:"sessions_count"`
	RemainingSessions uint      `json:"remaining_sessions"`
	Status            string    `json:"status"`
	EnrollmentDate    time.Time `json:"enrollment_date"`
}
