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

	// faceEngine ใช้เฉพาะเส้นทางเช็คชื่อด้วยใบหน้า — เป็น nil ได้
	// QR/manual ทำงานได้ตามปกติแม้ไม่ได้ตั้งค่า (ดู WithFaceEngine ใน attendance_face.go)
	faceEngine FaceEngine
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

	type slotKey struct {
		courseID   uint
		start, end string
	}

	groups := make(map[slotKey][]models.Package)
	order := make([]slotKey, 0)

	for _, sch := range schedules {
		if !isInClassWindow(sch.StartTime, sch.EndTime, now) {
			continue
		}

		var pkg models.Package
		if err := s.db.Preload("Course").First(&pkg, sch.PackageID).Error; err != nil {
			continue
		}

		key := slotKey{courseID: pkg.CourseID, start: sch.StartTime, end: sch.EndTime}
		if _, seen := groups[key]; !seen {
			order = append(order, key)
		}
		groups[key] = append(groups[key], pkg)
	}

	dayStart, dayEnd := dayBounds(now)
	result := make([]dto.OpenablePackageDTO, 0, len(order))

	for _, key := range order {
		pkgs := groups[key]

		anchor := pkgs[0]
		ids := make([]uint, 0, len(pkgs))
		for i := range pkgs {
			ids = append(ids, pkgs[i].ID)
			if pkgs[i].ID < anchor.ID {
				anchor = pkgs[i]
			}
		}

		var studentCount int64
		s.db.Model(&models.Enrollment{}).
			Where("package_id IN ? AND status = ?", ids, models.EnrollmentStatusActive).
			Distinct("customer_id").
			Count(&studentCount)

		confirmedCount := 0
		if confirmed, err := s.confirmedCustomers(s.db, ids, sessionDateValue(now), key.start); err == nil {
			confirmedCount = len(confirmed)
		}

		item := dto.OpenablePackageDTO{
			PackageID:      anchor.ID,
			CourseID:       key.courseID,
			PackageCount:   len(pkgs),
			StudentCount:   studentCount,
			ConfirmedCount: confirmedCount,
			DayOfWeek:      today,
			StartTime:      key.start,
			EndTime:        key.end,
		}
		if anchor.Course != nil {
			item.CourseName = anchor.Course.CourseName
		}

		item.Packages = []dto.ClassPackageDTO{}
		if pkgs, derr := classPackageDetails(s.db, ids, anchor.ID); derr == nil {
			item.Packages = pkgs
		}

		if existing, err := s.openSessionForSlot(s.db, ids, dayStart, dayEnd, key.start); err == nil && existing != nil {
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

	siblings, err := s.siblingPackageIDs(s.db, &session)
	if err != nil {
		return nil, err
	}

	dayStart, dayEnd := dayBounds(now)
	if existing, e := s.openSessionForSlot(s.db, siblings, dayStart, dayEnd, sch.StartTime); e == nil && existing != nil {
		return s.GetSession(existing.ID)
	}

	for _, id := range siblings {
		if id < session.PackageID {
			session.PackageID = id
		}
	}

	if err := s.db.Create(&session).Error; err != nil {
		if existing, e := s.openSessionForSlot(s.db, siblings, dayStart, dayEnd, sch.StartTime); e == nil && existing != nil {
			return s.GetSession(existing.ID)
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

	coaches, err := s.buildCoachRoster(s.db, &session)
	if err != nil {
		return nil, err
	}

	roster, walkInCandidates, err := s.getRoster(s.db, &session)
	if err != nil {
		return nil, err
	}

	packageIDs, err := s.siblingPackageIDs(s.db, &session)
	if err != nil {
		return nil, err
	}
	classPackages, err := classPackageDetails(s.db, packageIDs, session.PackageID)
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
		CanScan:           canScanNow(&session, nowLocal()),
		Packages:          classPackages,
		Roster:            roster,
		WalkInCandidates:  walkInCandidates,
		Coaches:           coaches,
	}
	if session.Package != nil && session.Package.Course != nil {
		result.CourseName = session.Package.Course.CourseName
	}

	for _, r := range roster {
		if r.IsConfirmed {
			result.ConfirmedCount++
		}
		switch r.Status {
		case string(models.AttendanceStatusPresent):
			result.PresentCount++
			if r.IsOffSchedule {
				result.OffScheduleCount++
			}
		case string(models.AttendanceStatusAbsent):
			result.AbsentCount++
		default:
			result.PendingCount++
		}
	}

	return result, nil
}

// getRoster คืนรายชื่อของรอบนั้น พร้อมสถานะการเช็คชื่อ และคนที่ยังไม่ได้ยืนยัน
func (s *AttendanceService) getRoster(tx *gorm.DB, session *models.AttendanceSession) (roster, walkInCandidates []dto.RosterItemDTO, err error) {
	expireStaleEnrollments(tx)

	packageIDs, err := s.siblingPackageIDs(tx, session)
	if err != nil {
		return nil, nil, err
	}

	enrollments, err := s.activeEnrollments(tx, packageIDs)
	if err != nil {
		return nil, nil, err
	}

	confirmed, err := s.confirmedCustomers(tx, packageIDs, session.SessionDate, session.ScheduleStartTime)
	if err != nil {
		return nil, nil, err
	}

	// ดึงบันทึกทีเดียวแล้วทำ map กันยิง query ทีละคน
	var records []models.StudentAttendance
	if err := tx.Where("attendance_session_id = ?", session.ID).Find(&records).Error; err != nil {
		return nil, nil, errors.New("ไม่สามารถดึงข้อมูลการเช็คชื่อได้")
	}
	byEnrollment := make(map[uint]*models.StudentAttendance, len(records))
	for i := range records {
		byEnrollment[records[i].EnrollmentID] = &records[i]
	}

	roster = make([]dto.RosterItemDTO, 0, len(confirmed)+len(records))
	walkInCandidates = make([]dto.RosterItemDTO, 0)

	for _, group := range groupEnrollmentsByCustomer(enrollments) {
		var (
			rep    *models.Enrollment
			record *models.StudentAttendance
		)
		anyConfirmed := confirmed[group[0].CustomerID]

		for _, e := range group {
			if r := byEnrollment[e.ID]; r != nil && record == nil {
				record, rep = r, e
			}
		}

		if rep == nil {
			rep = pickUsableEnrollmentPtr(group)
		}

		if !anyConfirmed && record == nil {
			walkInCandidates = append(walkInCandidates, dto.ToRosterItem(rep, nil, false))
			continue
		}

		roster = append(roster, dto.ToRosterItem(rep, record, anyConfirmed))
	}
	return roster, walkInCandidates, nil
}

func (s *AttendanceService) confirmedCustomers(tx *gorm.DB, packageIDs []uint, classDate time.Time, startTime string) (map[uint]bool, error) {
	if len(packageIDs) == 0 {
		return map[uint]bool{}, nil
	}

	var ids []uint
	if err := tx.Model(&models.ClassConfirmation{}).
		Joins("JOIN enrollments e ON e.id = class_confirmations.enrollment_id AND e.deleted_at IS NULL").
		Where("e.package_id IN ? AND e.status = ?", packageIDs, models.EnrollmentStatusActive).
		Where("class_confirmations.class_date = ? AND class_confirmations.status = ?",
			dateKey(classDate), models.ClassConfirmationGoing).
		Where("class_confirmations.schedule_start_time = ?", startTime).
		Distinct("e.customer_id").
		Pluck("e.customer_id", &ids).Error; err != nil {
		return nil, errors.New("ไม่สามารถดึงรายชื่อที่ยืนยันมาเรียนได้")
	}

	out := make(map[uint]bool, len(ids))
	for _, id := range ids {
		out[id] = true
	}
	return out, nil
}

func (s *AttendanceService) activeEnrollments(tx *gorm.DB, packageIDs []uint) ([]models.Enrollment, error) {
	if len(packageIDs) == 0 {
		return nil, nil
	}

	var enrollments []models.Enrollment
	if err := tx.
		Preload("Customer").
		Preload("Customer.User").
		Where("package_id IN ? AND status = ?", packageIDs, models.EnrollmentStatusActive).
		Order("id ASC").
		Find(&enrollments).Error; err != nil {
		return nil, errors.New("ไม่สามารถดึงรายชื่อผู้เรียนได้")
	}
	return enrollments, nil
}

// dateKey แปลงวันของรอบเป็นสตริง YYYY-MM-DD ไว้เทียบกับคอลัมน์ชนิด date โดยไม่ติดโซนเวลา
func dateKey(t time.Time) string {
	return t.UTC().Format("2006-01-02")
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

// canScanNow บอกว่ารอบนี้ยังรับการเช็คชื่อได้จริงไหม ณ เวลานี้
//
// ⚠️ ต้องใช้ checkSessionWindow ตัวเดียวกับที่ loadOpenSession ใช้ตอนสแกนจริง
// แยกเป็นสองตรรกะเมื่อไหร่ หน้าเว็บจะโชว์กล้องให้สแกนแล้วโดนปฏิเสธทุกครั้ง
func canScanNow(session *models.AttendanceSession, now time.Time) bool {
	if session.Status != models.AttendanceSessionOpen {
		return false
	}
	return checkSessionWindow(session, now) == nil
}

// sessionScanDeadline คืนเวลาที่รอบนี้หมดสิทธิ์รับการเช็คชื่อ (ปลายคาบ + ผ่อนผัน)
//
// ⚠️ นับจาก SessionDate + ScheduleEndTime ไม่ใช่ OpenedAt — OpenedAt คือตอนที่แอดมิน
// กดปุ่ม ซึ่งเร็วกว่าคาบเริ่มได้ถึง 30 นาที ถ้านับจากตรงนั้นงานปิดอัตโนมัติจะปิดตั้งแต่ยังเรียนอยู่
//
// ok=false เมื่ออ่านเวลาคาบที่เก็บไว้ไม่ออก (ข้อมูลเก่าไม่มีสแนปช็อต) — ผู้เรียกตัดสินเอง
func sessionScanDeadline(session *models.AttendanceSession) (time.Time, bool) {
	start, errStart := timeToMinutesWS(session.ScheduleStartTime)
	end, errEnd := timeToMinutesWS(session.ScheduleEndTime)
	if errStart != nil || errEnd != nil {
		return time.Time{}, false
	}

	// คาบข้ามเที่ยงคืน (เช่น 23:00–01:00) ปลายคาบตกอยู่ของวันถัดไป
	if end < start {
		end += 24 * 60
	}

	// SessionDate เก็บเป็น date (UTC midnight ของวันตามเวลาสนาม) ดู sessionDateValue
	y, m, d := session.SessionDate.UTC().Date()
	midnight := time.Date(y, m, d, 0, 0, 0, 0, appLocation())

	return midnight.Add(time.Duration(end+attendanceGraceMinutes) * time.Minute), true
}

type scanContext struct {
	Session    models.AttendanceSession
	Enrollment models.Enrollment
	FullName   string
	Nickname   string
	CourseName string
	Confirmed  bool
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

func (s *AttendanceService) classEnrollments(
	tx *gorm.DB,
	customerID uint,
	packageIDs []uint,
	preloadCustomer bool,
) ([]models.Enrollment, error) {
	if len(packageIDs) == 0 {
		return nil, nil
	}

	return customerClassEnrollments(tx, customerID, packageIDs, preloadCustomer)
}

func groupEnrollmentsByCustomer(enrollments []models.Enrollment) [][]*models.Enrollment {
	index := make(map[uint]int, len(enrollments))
	groups := make([][]*models.Enrollment, 0, len(enrollments))

	for i := range enrollments {
		e := &enrollments[i]
		if at, ok := index[e.CustomerID]; ok {
			groups[at] = append(groups[at], e)
			continue
		}
		index[e.CustomerID] = len(groups)
		groups = append(groups, []*models.Enrollment{e})
	}
	return groups
}

func pickUsableEnrollmentPtr(list []*models.Enrollment) *models.Enrollment {
	for _, e := range list {
		if e.RemainingSessions > 0 {
			return e
		}
	}
	return list[0]
}

func pickUsableEnrollment(list []models.Enrollment) *models.Enrollment {
	for i := range list {
		if list[i].RemainingSessions > 0 {
			return &list[i]
		}
	}
	return nil
}

func (s *AttendanceService) resolveClassEnrollment(
	tx *gorm.DB,
	session *models.AttendanceSession,
	customerID uint,
	customer *models.Customer,
	preloadCustomer bool,
) (*scanContext, error) {
	packageIDs, err := s.siblingPackageIDs(tx, session)
	if err != nil {
		return nil, err
	}

	list, err := s.classEnrollments(tx, customerID, packageIDs, preloadCustomer)
	if err != nil {
		return nil, err
	}
	if len(list) == 0 {
		return nil, ErrNotInPackage
	}

	picked := pickUsableEnrollment(list)
	if picked == nil {
		picked = &list[0]
	}

	if customer == nil {
		customer = picked.Customer
	}
	return s.buildContext(tx, session, picked, customer, packageIDs), nil
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

	return s.resolveClassEnrollment(tx, session, customer.ID, &customer, false)
}

func (s *AttendanceService) resolveByEnrollment(tx *gorm.DB, session *models.AttendanceSession, enrollmentID uint) (*scanContext, error) {
	expireStaleEnrollments(tx)

	packageIDs, err := s.siblingPackageIDs(tx, session)
	if err != nil {
		return nil, err
	}

	var enrollment models.Enrollment
	if err := tx.Preload("Customer").Preload("Customer.User").
		Where("id = ? AND package_id IN ? AND status = ?",
			enrollmentID, packageIDs, models.EnrollmentStatusActive).
		First(&enrollment).Error; err != nil {
		return nil, ErrNotInPackage
	}

	return s.buildContext(tx, session, &enrollment, enrollment.Customer, packageIDs), nil
}

func (s *AttendanceService) buildContext(
	tx *gorm.DB,
	session *models.AttendanceSession,
	enrollment *models.Enrollment,
	customer *models.Customer,
	packageIDs []uint,
) *scanContext {
	ctx := &scanContext{
		Session:    *session,
		Enrollment: *enrollment,
		Confirmed:  confirmedForClass(tx, enrollment.CustomerID, packageIDs, session.SessionDate, session.ScheduleStartTime),
	}

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
	err := tx.Model(&models.StudentAttendance{}).
		Select("student_attendances.*").
		Joins("JOIN enrollments e ON e.id = student_attendances.enrollment_id AND e.deleted_at IS NULL").
		Where("e.customer_id = ? AND student_attendances.attendance_session_id = ?",
			ctx.Enrollment.CustomerID, ctx.Session.ID).
		First(&existing).Error
	if err == nil {
		// ⚠️ ค่านี้อ่านมาจาก DB ไม่ใช่จาก nowLocal() — คอลัมน์เป็น timestamptz และ
		// DATABASE_URL ไม่ได้ตั้ง TimeZone Postgres จึงคืนตามโซนของ session (UTC)
		// Format ตรง ๆ จะได้เวลาช้าไป 7 ชั่วโมง ต้องแปลงโซนก่อนเสมอ
		return fmt.Errorf("%w (เมื่อ %s)", ErrAlreadyCheckedIn,
			existing.CheckInTime.In(appLocation()).Format("15:04"))
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return errors.New("ไม่สามารถตรวจสอบการเช็คชื่อซ้ำได้")
	}
	return nil
}
