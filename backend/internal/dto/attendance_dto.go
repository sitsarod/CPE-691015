package dto

import (
	"time"

	"CPE-691015/internal/models"
)

// ─── เปิดรอบ ─────────────────────────────────────────────────────────────────

// OpenablePackageDTO คือแพ็กเกจที่ตอนนี้อยู่ในคาบเรียน จึงเปิดรอบเช็คชื่อได้
type OpenablePackageDTO struct {
	PackageID  uint   `json:"package_id"`
	CourseID   uint   `json:"course_id"`
	CourseName string `json:"course_name"`

	SessionsCount uint  `json:"sessions_count"`
	StudentCount  int64 `json:"student_count"`

	DayOfWeek string `json:"day_of_week"`
	StartTime string `json:"start_time"`
	EndTime   string `json:"end_time"`

	// รอบของวันนี้ที่เปิดไว้แล้ว — หน้าเว็บใช้เลือกว่าจะแสดงปุ่ม "เปิดรอบ" หรือ "เข้าสู่รอบ"
	ExistingSessionID     *uint  `json:"existing_session_id"`
	ExistingSessionStatus string `json:"existing_session_status,omitempty"`
}

type OpenSessionReq struct {
	PackageID uint `json:"package_id" binding:"required"`
}

// ─── รอบและรายชื่อ ───────────────────────────────────────────────────────────

type RosterItemDTO struct {
	EnrollmentID uint   `json:"enrollment_id"`
	CustomerID   uint   `json:"customer_id"`
	UserID       uint   `json:"user_id"`
	FullName     string `json:"full_name"`
	Nickname     string `json:"nickname"`

	TotalSessions     uint `json:"total_sessions"`
	RemainingSessions uint `json:"remaining_sessions"`

	// null = ยังไม่มีบันทึกในรอบนี้ (ยังไม่เช็คชื่อ)
	AttendanceID  *uint      `json:"attendance_id"`
	Status        string     `json:"status,omitempty"`
	CheckInMethod string     `json:"check_in_method,omitempty"`
	CheckInTime   *time.Time `json:"check_in_time"`
	Remarks       string     `json:"remarks,omitempty"`
}

type AttendanceSessionDTO struct {
	ID          uint      `json:"id"`
	PackageID   uint      `json:"package_id"`
	CourseName  string    `json:"course_name"`
	SessionDate time.Time `json:"session_date"`

	Status   string     `json:"status"`
	OpenedAt time.Time  `json:"opened_at"`
	ClosedAt *time.Time `json:"closed_at"`

	ScheduleStartTime string `json:"schedule_start_time"`
	ScheduleEndTime   string `json:"schedule_end_time"`

	// CanScan = รับการเช็คชื่อได้จริงไหมตอนนี้ (เปิดอยู่ + ยังไม่เลยเวลาคาบ)
	//
	// ต้องแยกจาก Status เพราะรอบที่ "เปิดอยู่แต่เลยเวลาแล้ว" ยังดูรายชื่อและกดปิดรอบได้
	// แต่สแกนไม่ได้ ถ้าหน้าเว็บดูแค่ Status จะโชว์กล้องให้ยิงแล้วเจอ error ทุกครั้ง
	CanScan bool `json:"can_scan"`

	Roster []RosterItemDTO `json:"roster"`

	PresentCount int `json:"present_count"`
	AbsentCount  int `json:"absent_count"`
	LeaveCount   int `json:"leave_count"`
	PendingCount int `json:"pending_count"`
}

// OpenSessionSummaryDTO คือรอบที่ยัง status='open' อยู่ (ดู GetOpenSessions)
type OpenSessionSummaryDTO struct {
	ID          uint      `json:"id"`
	PackageID   uint      `json:"package_id"`
	CourseName  string    `json:"course_name"`
	SessionDate time.Time `json:"session_date"`

	ScheduleStartTime string    `json:"schedule_start_time"`
	ScheduleEndTime   string    `json:"schedule_end_time"`
	OpenedAt          time.Time `json:"opened_at"`

	// จำนวนคนในรอบที่ยังไม่มีบันทึกใด ๆ = จำนวนคนที่จะถูกมาร์คขาดเรียนถ้าปิดรอบตอนนี้
	PendingCount int `json:"pending_count"`
	TotalCount   int `json:"total_count"`

	// false = เลยเวลาคาบแล้ว สแกนต่อไม่ได้ เหลือแค่เข้าไปดูรายชื่อและปิดรอบ
	CanScan bool `json:"can_scan"`
}

// ─── สแกน ────────────────────────────────────────────────────────────────────

// ScanReq ใช้ทั้งจังหวะ lookup และ check-in
//
// ⚠️ จังหวะยืนยันต้องส่ง qr_code เดิมกลับมา ไม่ใช่ enrollment_id ที่ได้จาก lookup
// ไม่งั้นคนที่เปิด devtools จะแก้เลขแล้วเช็คชื่อให้คนอื่นได้
type ScanReq struct {
	QRCode string `json:"qr_code" binding:"required"`
}

// ManualCheckInReq คือการที่แอดมินติ๊กเช็คชื่อให้เองจากรายชื่อ
//
// ส่ง enrollment_id ตรง ๆ ได้เพราะผู้ตัดสินใจคือแอดมินซึ่งมีสิทธิ์อยู่แล้ว
type ManualCheckInReq struct {
	EnrollmentID uint   `json:"enrollment_id" binding:"required"`
	Remarks      string `json:"remarks" binding:"omitempty,max=500"`
}

// ScanResultDTO คือผลของจังหวะ lookup — บอกว่าเป็นใครและเช็คได้ไหม
type ScanResultDTO struct {
	EnrollmentID uint   `json:"enrollment_id"`
	FullName     string `json:"full_name"`
	Nickname     string `json:"nickname"`
	CourseName   string `json:"course_name"`

	TotalSessions     uint `json:"total_sessions"`
	RemainingSessions uint `json:"remaining_sessions"`

	// false = ให้แสดง Reason แทนปุ่มยืนยัน นักเรียนจะได้รู้ว่าติดตรงไหน
	CanCheckIn bool   `json:"can_check_in"`
	Reason     string `json:"reason,omitempty"`
}

type CheckInResultDTO struct {
	AttendanceID uint   `json:"attendance_id"`
	EnrollmentID uint   `json:"enrollment_id"`
	FullName     string `json:"full_name"`
	Nickname     string `json:"nickname"`

	CheckInMethod string    `json:"check_in_method"`
	CheckInTime   time.Time `json:"check_in_time"`

	RemainingSessions uint `json:"remaining_sessions"`
}

// ─── แก้สถานะย้อนหลัง ────────────────────────────────────────────────────────

type UpdateAttendanceStatusReq struct {
	Status  string `json:"status" binding:"required,oneof=present absent leave"`
	Remarks string `json:"remarks" binding:"omitempty,max=500"`
}

type UpdateAttendanceResultDTO struct {
	AttendanceID uint   `json:"attendance_id"`
	EnrollmentID uint   `json:"enrollment_id"`
	FromStatus   string `json:"from_status"`
	ToStatus     string `json:"to_status"`

	// การปรับโควตาที่เกิดขึ้น: -1 หัก, 0 ไม่เปลี่ยน, +1 คืน
	QuotaDelta        int  `json:"quota_delta"`
	RemainingSessions uint `json:"remaining_sessions"`
}

// ─── ประวัติ ─────────────────────────────────────────────────────────────────

type AttendanceHistoryItemDTO struct {
	AttendanceID uint      `json:"attendance_id"`
	SessionID    *uint     `json:"session_id"`
	SessionDate  time.Time `json:"session_date"`

	EnrollmentID uint   `json:"enrollment_id"`
	FullName     string `json:"full_name"`
	Nickname     string `json:"nickname"`
	CourseName   string `json:"course_name"`

	Status        string    `json:"status"`
	CheckInMethod string    `json:"check_in_method"`
	CheckInTime   time.Time `json:"check_in_time"`
	Remarks       string    `json:"remarks,omitempty"`

	// null = นักเรียนสแกนเอง / มีค่า = แอดมินเป็นคนบันทึกหรือแก้
	RecordedByUserID *uint `json:"recorded_by_user_id"`
}

// ToRosterItem แปลงหนึ่งแถวของรายชื่อ — attendance เป็น nil ได้ (ยังไม่เช็ค)
func ToRosterItem(e *models.Enrollment, attendance *models.StudentAttendance) RosterItemDTO {
	item := RosterItemDTO{
		EnrollmentID:      e.ID,
		CustomerID:        e.CustomerID,
		TotalSessions:     e.TotalSessions,
		RemainingSessions: e.RemainingSessions,
	}

	if e.Customer != nil {
		item.Nickname = e.Customer.Nickname
		item.UserID = e.Customer.UserID
		if e.Customer.User != nil {
			item.FullName = e.Customer.User.FirstName + " " + e.Customer.User.LastName
		}
	}

	if attendance != nil {
		id := attendance.ID
		checkIn := attendance.CheckInTime
		item.AttendanceID = &id
		item.Status = string(attendance.Status)
		item.CheckInMethod = string(attendance.CheckInMethod)
		item.CheckInTime = &checkIn
		item.Remarks = attendance.Remarks
	}

	return item
}
