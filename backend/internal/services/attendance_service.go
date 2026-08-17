package services

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
	"gorm.io/gorm"
)

type AttendanceService struct {
	db *gorm.DB
}

func NewAttendanceService(db *gorm.DB) *AttendanceService {
	return &AttendanceService{db: db}
}

var (
	ErrSessionNotFound   = errors.New("ไม่พบรอบเช็คชื่อนี้")
	ErrSessionClosed     = errors.New("รอบเช็คชื่อนี้ปิดไปแล้ว")
	ErrSessionExists     = errors.New("แพ็กเกจนี้เปิดรอบเช็คชื่อของวันนี้ไปแล้ว")
	ErrNotInClassTime    = errors.New("ตอนนี้ยังไม่ถึงเวลาเรียนของแพ็กเกจนี้ หรือเลยเวลาไปแล้ว")
	ErrQRNotFound        = errors.New("ไม่พบนักเรียนจากรหัส QR นี้")
	ErrCoachQRScanned    = errors.New("นี่คือ QR ของโค้ช ไม่ใช่ของนักเรียน")
	ErrNotInPackage      = errors.New("นักเรียนคนนี้ไม่ได้ลงทะเบียนแพ็กเกจนี้ หรือสิทธิ์เรียนหมดอายุแล้ว")
	ErrNoSessionsLeft    = errors.New("จำนวนครั้งคงเหลือหมดแล้ว ไม่สามารถเช็คชื่อได้")
	ErrAlreadyCheckedIn  = errors.New("เช็คชื่อในรอบนี้ไปแล้ว")
	ErrAttendanceExpired = errors.New("เลยเวลาเช็คชื่อของคาบนี้แล้ว")
)


const attendanceGraceMinutes = 30

func classWindow(startTime, endTime string) (from, to int, ok bool) {
	start, err1 := timeToMinutesWS(startTime)
	end, err2 := timeToMinutesWS(endTime)
	if err1 != nil || err2 != nil {
		return 0, 0, false
	}
	return start - attendanceGraceMinutes, end + attendanceGraceMinutes, true
}

func isInClassWindow(startTime, endTime string, now time.Time) bool {
	from, to, ok := classWindow(startTime, endTime)
	if !ok {
		return false
	}
	nowMinutes := now.Hour()*60 + now.Minute()
	return nowMinutes >= from && nowMinutes <= to
}

// ─── เปิดรอบ ─────────────────────────────────────────────────────────────────

func (s *AttendanceService) GetOpenablePackages() ([]dto.OpenablePackageDTO, error) {
	now := nowLocal()
	today := now.Weekday().String()

	var schedules []models.PackageSchedule
	if err := s.db.Where("day_of_week = ?", today).Find(&schedules).Error; err != nil {
		return nil, errors.New("ไม่สามารถดึงตารางเรียนของวันนี้ได้")
	}

	expireStaleEnrollments(s.db)

	result := make([]dto.OpenablePackageDTO, 0)
	for _, sch := range schedules {
		if !isInClassWindow(sch.StartTime, sch.EndTime, now) {
			continue
		}

		var pkg models.Package
		if err := s.db.Preload("Course").First(&pkg, sch.PackageID).Error; err != nil {
			continue
		}

		var studentCount int64
		s.db.Model(&models.Enrollment{}).
			Where("package_id = ? AND status = ?", pkg.ID, models.EnrollmentStatusActive).
			Count(&studentCount)

		item := dto.OpenablePackageDTO{
			PackageID:     pkg.ID,
			CourseID:      pkg.CourseID,
			SessionsCount: pkg.SessionsCount,
			StudentCount:  studentCount,
			DayOfWeek:     string(sch.DayOfWeek),
			StartTime:     sch.StartTime,
			EndTime:       sch.EndTime,
		}
		if pkg.Course != nil {
			item.CourseName = pkg.Course.CourseName
		}

		dayStart, dayEnd := dayBounds(now)
		var existing models.AttendanceSession
		if err := s.db.Where("package_id = ? AND session_date >= ? AND session_date < ?",
			pkg.ID, dayStart, dayEnd).
			First(&existing).Error; err == nil {
			id := existing.ID
			item.ExistingSessionID = &id
			item.ExistingSessionStatus = string(existing.Status)
		}

		result = append(result, item)
	}

	return result, nil
}

// OpenSession เปิดรอบเช็คชื่อของแพ็กเกจหนึ่งสำหรับวันนี้
func (s *AttendanceService) OpenSession(packageID uint, adminUserID uint) (*dto.AttendanceSessionDTO, error) {
	now := nowLocal()

	var pkg models.Package
	if err := s.db.Preload("Course").Preload("Schedules").First(&pkg, packageID).Error; err != nil {
		return nil, errors.New("ไม่พบข้อมูลแพ็กเกจที่เลือก")
	}

	// ต้องอยู่ในคาบจริง กันเปิดรอบผิดวันหรือเปิดทิ้งไว้ข้ามคืน
	sch := findCurrentSchedule(pkg.Schedules, now)
	if sch == nil {
		return nil, ErrNotInClassTime
	}

	session := models.AttendanceSession{
		PackageID:         pkg.ID,
		SessionDate:       sessionDateValue(now),
		Status:            models.AttendanceSessionOpen,
		OpenedAt:          now,
		OpenedByUserID:    adminUserID,
		ScheduleStartTime: sch.StartTime,
		ScheduleEndTime:   sch.EndTime,
	}

	if err := s.db.Create(&session).Error; err != nil {

		dayStart, dayEnd := dayBounds(now)
		var existing models.AttendanceSession
		if e := s.db.Where("package_id = ? AND session_date >= ? AND session_date < ?",
			pkg.ID, dayStart, dayEnd).
			First(&existing).Error; e == nil {
			return nil, ErrSessionExists
		}
		return nil, errors.New("ไม่สามารถเปิดรอบเช็คชื่อได้")
	}

	return s.GetSession(session.ID)
}

// GetSession ดึงรอบพร้อมรายชื่อและตัวเลขสรุป
func (s *AttendanceService) GetSession(sessionID uint) (*dto.AttendanceSessionDTO, error) {
	var session models.AttendanceSession
	if err := s.db.Preload("Package").Preload("Package.Course").First(&session, sessionID).Error; err != nil {
		return nil, ErrSessionNotFound
	}

	roster, err := s.getRoster(s.db, &session)
	if err != nil {
		return nil, err
	}

	result := &dto.AttendanceSessionDTO{
		ID:                session.ID,
		PackageID:         session.PackageID,
		SessionDate:       session.SessionDate,
		Status:            string(session.Status),
		OpenedAt:          session.OpenedAt,
		ClosedAt:          session.ClosedAt,
		ScheduleStartTime: session.ScheduleStartTime,
		ScheduleEndTime:   session.ScheduleEndTime,
		Roster:            roster,
	}
	if session.Package != nil && session.Package.Course != nil {
		result.CourseName = session.Package.Course.CourseName
	}

	for _, r := range roster {
		switch r.Status {
		case string(models.AttendanceStatusPresent):
			result.PresentCount++
		case string(models.AttendanceStatusAbsent):
			result.AbsentCount++
		case string(models.AttendanceStatusLeave):
			result.LeaveCount++
		default:
			result.PendingCount++
		}
	}

	return result, nil
}

// getRoster คืนรายชื่อผู้เรียนในแพ็กเกจของรอบนั้น พร้อมสถานะการเช็คชื่อ
func (s *AttendanceService) getRoster(tx *gorm.DB, session *models.AttendanceSession) ([]dto.RosterItemDTO, error) {
	expireStaleEnrollments(tx)

	enrollments, err := s.activeEnrollments(tx, session.PackageID)
	if err != nil {
		return nil, err
	}

	// ดึงบันทึกทีเดียวแล้วทำ map กันยิง query ทีละคน
	var records []models.StudentAttendance
	if err := tx.Where("attendance_session_id = ?", session.ID).Find(&records).Error; err != nil {
		return nil, errors.New("ไม่สามารถดึงข้อมูลการเช็คชื่อได้")
	}
	byEnrollment := make(map[uint]*models.StudentAttendance, len(records))
	for i := range records {
		byEnrollment[records[i].EnrollmentID] = &records[i]
	}

	items := make([]dto.RosterItemDTO, 0, len(enrollments))
	for i := range enrollments {
		e := &enrollments[i]
		items = append(items, dto.ToRosterItem(e, byEnrollment[e.ID]))
	}
	return items, nil
}

func (s *AttendanceService) activeEnrollments(tx *gorm.DB, packageID uint) ([]models.Enrollment, error) {
	var enrollments []models.Enrollment
	if err := tx.
		Preload("Customer").
		Preload("Customer.User").
		Where("package_id = ? AND status = ?", packageID, models.EnrollmentStatusActive).
		Find(&enrollments).Error; err != nil {
		return nil, errors.New("ไม่สามารถดึงรายชื่อผู้เรียนได้")
	}
	return enrollments, nil
}


func sessionDateValue(t time.Time) time.Time {
	y, m, d := t.In(appLocation()).Date()
	return time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
}


func dayBounds(t time.Time) (string, string) {
	start := sessionDateValue(t)
	return start.Format("2006-01-02"), start.AddDate(0, 0, 1).Format("2006-01-02")
}

func sameDay(a, b time.Time) bool {
	loc := appLocation()
	ay, am, ad := a.In(loc).Date()
	by, bm, bd := b.In(loc).Date()
	return ay == by && am == bm && ad == bd
}

// findCurrentSchedule หาคาบของแพ็กเกจที่ครอบเวลาปัจจุบันอยู่ (รวมผ่อนผันหัวท้าย)
func findCurrentSchedule(schedules []models.PackageSchedule, now time.Time) *models.PackageSchedule {
	today := now.Weekday().String()

	for i := range schedules {
		sch := &schedules[i]
		if string(sch.DayOfWeek) != today {
			continue
		}
		if isInClassWindow(sch.StartTime, sch.EndTime, now) {
			return sch
		}
	}
	return nil
}


func minutesToClock(m int) string {
	if m < 0 {
		m += 24 * 60
	}
	return fmt.Sprintf("%02d:%02d", (m/60)%24, m%60)
}


func checkSessionWindow(session *models.AttendanceSession, now time.Time) error {
	loc := appLocation()

	if !sameDay(now, session.OpenedAt) {
		return fmt.Errorf("%w (รอบนี้เปิดไว้วันที่ %s แต่วันนี้คือ %s)",
			ErrAttendanceExpired,
			session.OpenedAt.In(loc).Format("2006-01-02"),
			now.In(loc).Format("2006-01-02"))
	}

	from, to, ok := classWindow(session.ScheduleStartTime, session.ScheduleEndTime)
	if !ok {

		return nil
	}

	if !isInClassWindow(session.ScheduleStartTime, session.ScheduleEndTime, now) {
		return fmt.Errorf("%w (ตอนนี้ %s · คาบ %s–%s · เช็คได้ %s–%s)",
			ErrAttendanceExpired,
			now.In(loc).Format("15:04"),
			session.ScheduleStartTime, session.ScheduleEndTime,
			minutesToClock(from), minutesToClock(to))
	}

	return nil
}


type scanContext struct {
	Session    models.AttendanceSession
	Enrollment models.Enrollment
	FullName   string
	Nickname   string
	CourseName string
}

func (s *AttendanceService) loadOpenSession(tx *gorm.DB, sessionID uint) (*models.AttendanceSession, error) {
	var session models.AttendanceSession
	if err := tx.First(&session, sessionID).Error; err != nil {
		return nil, ErrSessionNotFound
	}
	if session.Status != models.AttendanceSessionOpen {
		return nil, fmt.Errorf("%w (สถานะรอบตอนนี้คือ %q)", ErrSessionClosed, session.Status)
	}
	if err := checkSessionWindow(&session, nowLocal()); err != nil {
		return nil, err
	}
	return &session, nil
}

// resolveByQR — ด่าน 2 (หาตัวคนจาก QR) และ 3 (อยู่ในแพ็กเกจนี้และสิทธิ์ยังไม่หมดอายุ)
func (s *AttendanceService) resolveByQR(tx *gorm.DB, session *models.AttendanceSession, qrCode string) (*scanContext, error) {
	code := strings.TrimSpace(qrCode)
	if code == "" {
		return nil, ErrQRNotFound
	}

	var customer models.Customer
	if err := tx.Preload("User").Where("personal_qr_code = ?", code).First(&customer).Error; err != nil {

		var coachCount int64
		tx.Model(&models.Coach{}).Where("personal_qr_code = ?", code).Count(&coachCount)
		if coachCount > 0 {
			return nil, ErrCoachQRScanned
		}
		return nil, ErrQRNotFound
	}

	expireStaleEnrollments(tx)

	var enrollment models.Enrollment
	if err := tx.Where("customer_id = ? AND package_id = ? AND status = ?",
		customer.ID, session.PackageID, models.EnrollmentStatusActive).
		First(&enrollment).Error; err != nil {
		return nil, ErrNotInPackage
	}

	return s.buildContext(tx, session, &enrollment, &customer), nil
}

func (s *AttendanceService) resolveByEnrollment(tx *gorm.DB, session *models.AttendanceSession, enrollmentID uint) (*scanContext, error) {
	expireStaleEnrollments(tx)

	var enrollment models.Enrollment
	if err := tx.Preload("Customer").Preload("Customer.User").
		Where("id = ? AND package_id = ? AND status = ?",
			enrollmentID, session.PackageID, models.EnrollmentStatusActive).
		First(&enrollment).Error; err != nil {
		return nil, ErrNotInPackage
	}

	return s.buildContext(tx, session, &enrollment, enrollment.Customer), nil
}

func (s *AttendanceService) buildContext(
	tx *gorm.DB,
	session *models.AttendanceSession,
	enrollment *models.Enrollment,
	customer *models.Customer,
) *scanContext {
	ctx := &scanContext{Session: *session, Enrollment: *enrollment}

	if customer != nil {
		ctx.Nickname = customer.Nickname
		if customer.User != nil {
			ctx.FullName = customer.User.FirstName + " " + customer.User.LastName
		}
	}

	var pkg models.Package
	if err := tx.Preload("Course").First(&pkg, session.PackageID).Error; err == nil && pkg.Course != nil {
		ctx.CourseName = pkg.Course.CourseName
	}
	return ctx
}

func (s *AttendanceService) checkQuotaAndDuplicate(tx *gorm.DB, ctx *scanContext) error {
	if ctx.Enrollment.RemainingSessions == 0 {
		return ErrNoSessionsLeft
	}

	var existing models.StudentAttendance
	err := tx.Where("enrollment_id = ? AND attendance_session_id = ?",
		ctx.Enrollment.ID, ctx.Session.ID).First(&existing).Error
	if err == nil {
		return fmt.Errorf("%w (เมื่อ %s)", ErrAlreadyCheckedIn, existing.CheckInTime.Format("15:04"))
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return errors.New("ไม่สามารถตรวจสอบการเช็คชื่อซ้ำได้")
	}
	return nil
}
