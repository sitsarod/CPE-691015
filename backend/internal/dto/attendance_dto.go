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

	PackageCount   int   `json:"package_count"`
	StudentCount   int64 `json:"student_count"`
	ConfirmedCount int   `json:"confirmed_count"`

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

	IsConfirmed   bool `json:"is_confirmed"`
	IsOffSchedule bool `json:"is_off_schedule"`

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

	Roster           []RosterItemDTO `json:"roster"`
	WalkInCandidates []RosterItemDTO `json:"walk_in_candidates"`

	// โค้ชที่สอนคาบนี้ — คนละชุดกับนักเรียนและมาจากคนละที่
	Coaches []CoachRosterItemDTO `json:"coaches"`

	ConfirmedCount   int `json:"confirmed_count"`
	PresentCount     int `json:"present_count"`
	AbsentCount      int `json:"absent_count"`
	OffScheduleCount int `json:"off_schedule_count"`
	PendingCount     int `json:"pending_count"`
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

	IsConfirmed bool `json:"is_confirmed"`

	// false = ให้แสดง Reason แทนปุ่มยืนยัน นักเรียนจะได้รู้ว่าติดตรงไหน
	CanCheckIn bool   `json:"can_check_in"`
	Reason     string `json:"reason,omitempty"`
}

// FaceScanResultDTO คือผลของจังหวะที่ 1 ตอนสแกนใบหน้า (ยังไม่บันทึกอะไร)
//
// ต่อยอด ScanResultDTO เดิมเพราะข้อมูลที่หน้าจอต้องใช้เหมือนกันทุกอย่าง
// เพิ่มมาแค่คะแนนที่ต้องโชว์ให้แอดมินตัดสินใจก่อนกดยืนยัน
type FaceScanResultDTO struct {
	ScanResultDTO

	Matched bool `json:"matched"`

	// Confidence = ความเหมือนของอันดับ 1 (0–1 ยิ่งสูงยิ่งมั่นใจ)
	// Margin = อันดับ 1 นำอันดับ 2 อยู่เท่าไร — ต่ำแปลว่ามีคนหน้าคล้ายในคาบนี้
	Confidence float64 `json:"confidence"`
	Margin     float64 `json:"margin"`
}

// CoachFaceScanResultDTO คือผลของจังหวะที่ 1 ตอนโค้ชสแกนใบหน้า
//
// ไม่มีโควตา/คอร์สเหมือนของนักเรียน แต่ยังต้องบอกล่วงหน้าว่ากดยืนยันแล้วจะติดอะไร
type CoachFaceScanResultDTO struct {
	CoachID  uint   `json:"coach_id"`
	FullName string `json:"full_name"`
	Nickname string `json:"nickname"`

	Confidence float64 `json:"confidence"`
	Margin     float64 `json:"margin"`

	CanCheckIn bool   `json:"can_check_in"`
	Reason     string `json:"reason,omitempty"`
}

// FaceLookupDTO ห่อผลการสแกนใบหน้าจังหวะที่ 1 ซึ่งเป็นได้ทั้งนักเรียนและโค้ช
// (เหตุผลเดียวกับ ScanCheckInDTO — ฟิลด์สองฝั่งไม่ทับกัน)
type FaceLookupDTO struct {
	Kind    string                  `json:"kind"`
	Student *FaceScanResultDTO      `json:"student,omitempty"`
	Coach   *CoachFaceScanResultDTO `json:"coach,omitempty"`
}

type CheckInResultDTO struct {
	AttendanceID uint   `json:"attendance_id"`
	EnrollmentID uint   `json:"enrollment_id"`
	FullName     string `json:"full_name"`
	Nickname     string `json:"nickname"`

	CheckInMethod string    `json:"check_in_method"`
	CheckInTime   time.Time `json:"check_in_time"`

	IsOffSchedule bool `json:"is_off_schedule"`

	RemainingSessions uint `json:"remaining_sessions"`
}

// CoachRosterItemDTO คู่ขนานกับ RosterItemDTO — แต่รายชื่อมาจาก WorkSchedule
// ไม่ใช่ enrollment เพราะโค้ชไม่ได้ลงทะเบียนเรียน แต่ถูก assign มาสอน
type CoachRosterItemDTO struct {
	CoachID  uint   `json:"coach_id"`
	FullName string `json:"full_name"`
	Nickname string `json:"nickname"`

	// เว้นว่างได้ตามการออกแบบเดิม (ยังไม่ระบุสนาม)
	CourtNumber string `json:"court_number"`

	// true = ตารางงานแถวนี้เป็นกรณีฉุกเฉิน (สแกนเองหน้างาน หรือแอดมินติ๊กไว้)
	IsEmergency bool `json:"is_emergency"`

	// false = ตอนนี้ไม่มีตารางงานของคาบนี้แล้ว แต่มีบันทึกเช็คชื่อค้างอยู่
	IsScheduled bool `json:"is_scheduled"`

	// null = ยังไม่เช็คชื่อ
	AttendanceID  *uint      `json:"attendance_id"`
	Status        string     `json:"status,omitempty"`
	CheckInMethod string     `json:"check_in_method,omitempty"`
	CheckInTime   *time.Time `json:"check_in_time"`
	Remarks       string     `json:"remarks,omitempty"`
}

// ManualCoachCheckInReq คือแอดมินเช็คชื่อให้โค้ชเอง (โค้ชลืม QR)
type ManualCoachCheckInReq struct {
	CoachID uint   `json:"coach_id" binding:"required"`
	Remarks string `json:"remarks" binding:"omitempty,max=500"`
}

// UpdateCoachAttendanceResultDTO — ไม่มี quota_delta เหมือนของนักเรียน เพราะโค้ชไม่มีโควตา
type UpdateCoachAttendanceResultDTO struct {
	AttendanceID uint   `json:"attendance_id"`
	CoachID      uint   `json:"coach_id"`
	FromStatus   string `json:"from_status"`
	ToStatus     string `json:"to_status"`
}

// CoachCheckInResultDTO — ไม่มีโควตาหรือ "มาไม่ตรงวัน" เพราะโค้ชไม่ได้ซื้อคอร์ส
type CoachCheckInResultDTO struct {
	AttendanceID uint   `json:"attendance_id"`
	CoachID      uint   `json:"coach_id"`
	FullName     string `json:"full_name"`
	Nickname     string `json:"nickname"`

	CheckInMethod string    `json:"check_in_method"`
	CheckInTime   time.Time `json:"check_in_time"`
	SessionDate   string    `json:"session_date"` // YYYY-MM-DD

	// false = ยังไม่ได้ถูก assign คาบนี้ ระบบเพิ่งสร้างตารางงานให้อัตโนมัติ
	// หน้าคีออสต้องบอกตรงนั้นเลย เพราะแถวที่สร้างอัตโนมัติยังไม่มีสนาม
	IsScheduled bool `json:"is_scheduled"`
}

// CoachHistoryItemDTO คือประวัติเข้าสอนของโค้ชในหน้าประวัติของแอดมิน
//
// แยกลิสต์จากของนักเรียนเพราะฟิลด์ไม่ทับกัน (นักเรียนมีโควตา/มาไม่ตรงวัน
// โค้ชมีสนาม/กรณีฉุกเฉิน) หน้าเว็บเอามารวมเข้ารอบเดียวกันด้วย SessionID
type CoachHistoryItemDTO struct {
	AttendanceID uint   `json:"attendance_id"`
	SessionID    uint   `json:"session_id"`
	CoachID      uint   `json:"coach_id"`
	FullName     string `json:"full_name"`
	Nickname     string `json:"nickname"`

	Status        string    `json:"status"`
	CheckInMethod string    `json:"check_in_method"`
	CheckInTime   time.Time `json:"check_in_time"`
	Remarks       string    `json:"remarks,omitempty"`

	// false = ตอนเช็คชื่อยังไม่ได้ถูก assign คาบนี้
	IsScheduled bool `json:"is_scheduled"`
}

// ScanCheckInDTO ห่อผลการสแกน ซึ่งรับได้ทั้ง QR นักเรียนและ QR โค้ช
//
// ฟิลด์สองฝั่งแทบไม่ทับกัน ถ้ารวมเป็น struct เดียวครึ่งหนึ่งจะว่างตลอด
// แล้วคนอ่านต้องเดาเองว่าฟิลด์ไหนใช้ได้เมื่อไหร่ — Kind บอกตรง ๆ ดีกว่า
type ScanCheckInDTO struct {
	Kind    string                 `json:"kind"` // "student" หรือ "coach"
	Student *CheckInResultDTO      `json:"student,omitempty"`
	Coach   *CoachCheckInResultDTO `json:"coach,omitempty"`
}

const (
	ScanKindStudent = "student"
	ScanKindCoach   = "coach"
)

// ─── แก้สถานะย้อนหลัง ────────────────────────────────────────────────────────

type UpdateAttendanceStatusReq struct {
	Status  string `json:"status" binding:"required,oneof=present absent"`
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

	// สแนปช็อตเวลาคาบที่รอบเก็บไว้ตอนเปิด — ว่างเมื่อ session_id เป็น null
	ScheduleStartTime string `json:"schedule_start_time,omitempty"`
	ScheduleEndTime   string `json:"schedule_end_time,omitempty"`

	EnrollmentID uint   `json:"enrollment_id"`
	FullName     string `json:"full_name"`
	Nickname     string `json:"nickname"`
	CourseName   string `json:"course_name"`

	Status        string    `json:"status"`
	CheckInMethod string    `json:"check_in_method"`
	CheckInTime   time.Time `json:"check_in_time"`
	IsOffSchedule bool      `json:"is_off_schedule"`
	Remarks       string    `json:"remarks,omitempty"`

	// null = นักเรียนสแกนเอง / มีค่า = แอดมินเป็นคนบันทึกหรือแก้
	RecordedByUserID *uint `json:"recorded_by_user_id"`
}

// ToRosterItem แปลงหนึ่งแถวของรายชื่อ — attendance เป็น nil ได้ (ยังไม่เช็ค)
func ToRosterItem(e *models.Enrollment, attendance *models.StudentAttendance, confirmed bool) RosterItemDTO {
	item := RosterItemDTO{
		EnrollmentID:      e.ID,
		CustomerID:        e.CustomerID,
		TotalSessions:     e.TotalSessions,
		RemainingSessions: e.RemainingSessions,
		IsConfirmed:       confirmed,
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
		item.IsOffSchedule = attendance.IsOffSchedule
		item.Remarks = attendance.Remarks
	}

	return item
}
