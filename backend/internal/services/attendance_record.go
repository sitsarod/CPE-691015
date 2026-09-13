package services

import (
	"errors"
	"log"
	"strings"
	"time"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
	"gorm.io/gorm"
)

var (
	ErrHistoryRangeReversed = errors.New("วันเริ่มต้นต้องไม่อยู่หลังวันสิ้นสุด")

	ErrAttendanceNotFound = errors.New("ไม่พบบันทึกการเช็คชื่อนี้")
	ErrInvalidStatus      = errors.New("สถานะไม่ถูกต้อง (รองรับเฉพาะ present, absent)")
)

func (s *AttendanceService) CloseSession(sessionID uint, adminUserID uint) (*dto.AttendanceSessionDTO, error) {
	err := s.db.Transaction(func(tx *gorm.DB) error {
		return s.closeSessionTx(tx, sessionID, &adminUserID, nowLocal())
	})

	if err != nil {
		return nil, err
	}
	return s.GetSession(sessionID)
}

// closeSessionTx คือเนื้อของการปิดรอบ ใช้ร่วมกันทั้งแอดมินกดเองและงานปิดอัตโนมัติ
func (s *AttendanceService) closeSessionTx(
	tx *gorm.DB,
	sessionID uint,
	closedBy *uint,
	now time.Time,
) error {
	var session models.AttendanceSession
	if err := tx.First(&session, sessionID).Error; err != nil {
		return ErrSessionNotFound
	}

	res := tx.Model(&models.AttendanceSession{}).
		Where("id = ? AND status = ?", sessionID, models.AttendanceSessionOpen).
		Updates(map[string]interface{}{
			"status":            models.AttendanceSessionClosed,
			"closed_at":         now,
			"closed_by_user_id": closedBy,
		})
	if res.Error != nil {
		return errors.New("ไม่สามารถปิดรอบเช็คชื่อได้")
	}
	if res.RowsAffected == 0 {
		return ErrSessionClosed
	}

	if err := s.markAbsentees(tx, &session, closedBy, now); err != nil {
		return err
	}
	return s.markCoachAbsentees(tx, &session, closedBy, now)
}

// GetOpenSessions คืนรอบที่ยังเปิดค้างอยู่ทั้งหมด เรียงรอบล่าสุดขึ้นก่อน
func (s *AttendanceService) GetOpenSessions() ([]dto.OpenSessionSummaryDTO, error) {
	expireStaleEnrollments(s.db)

	var sessions []models.AttendanceSession
	if err := s.db.
		Preload("Package").
		Preload("Package.Course").
		Where("status = ?", models.AttendanceSessionOpen).
		Order("session_date DESC, opened_at DESC").
		Find(&sessions).Error; err != nil {
		return nil, errors.New("ไม่สามารถดึงรายการรอบที่เปิดค้างอยู่ได้")
	}

	now := nowLocal()
	items := make([]dto.OpenSessionSummaryDTO, 0, len(sessions))

	for i := range sessions {
		session := &sessions[i]

		item := dto.OpenSessionSummaryDTO{
			ID:                session.ID,
			PackageID:         session.PackageID,
			SessionDate:       session.SessionDate,
			ScheduleStartTime: session.ScheduleStartTime,
			ScheduleEndTime:   session.ScheduleEndTime,
			OpenedAt:          session.OpenedAt,
			CanScan:           canScanNow(session, now),
		}
		if session.Package != nil && session.Package.Course != nil {
			item.CourseName = session.Package.Course.CourseName
		}

		packageIDs, err := s.siblingPackageIDs(s.db, session)
		if err != nil {
			return nil, err
		}

		confirmed, err := s.confirmedCustomers(s.db, packageIDs, session.SessionDate, session.ScheduleStartTime)
		if err != nil {
			return nil, err
		}

		var checkedIDs []uint
		if err := s.db.Model(&models.StudentAttendance{}).
			Joins("JOIN enrollments e ON e.id = student_attendances.enrollment_id AND e.deleted_at IS NULL").
			Where("student_attendances.attendance_session_id = ?", session.ID).
			Distinct("e.customer_id").
			Pluck("e.customer_id", &checkedIDs).Error; err != nil {
			return nil, errors.New("ไม่สามารถดึงข้อมูลการเช็คชื่อได้")
		}
		checked := make(map[uint]bool, len(checkedIDs))
		for _, id := range checkedIDs {
			checked[id] = true
		}

		item.TotalCount = len(confirmed)
		for customerID := range confirmed {
			if !checked[customerID] {
				item.PendingCount++
			}
		}

		items = append(items, item)
	}

	return items, nil
}

// AutoCloseStaleSessions ปิดรอบที่เลยเวลาคาบแล้วแต่ไม่มีใครกดปิด คืนจำนวนที่ปิดไป
func (s *AttendanceService) AutoCloseStaleSessions() (int, error) {
	var sessions []models.AttendanceSession
	if err := s.db.Where("status = ?", models.AttendanceSessionOpen).
		Find(&sessions).Error; err != nil {
		return 0, errors.New("ไม่สามารถดึงรายการรอบที่เปิดค้างอยู่ได้")
	}

	now := nowLocal()
	closed := 0

	for i := range sessions {
		session := &sessions[i]
		if !isStaleSession(session, now) {
			continue
		}

		sessionID := session.ID
		err := s.db.Transaction(func(tx *gorm.DB) error {
			return s.closeSessionTx(tx, sessionID, nil, now)
		})
		if err != nil {
			if !errors.Is(err, ErrSessionClosed) {
				log.Printf("[attendance] ปิดรอบ %d อัตโนมัติไม่สำเร็จ: %v", sessionID, err)
			}
			continue
		}
		closed++
	}

	return closed, nil
}

// isStaleSession บอกว่ารอบนี้เลยเวลาจนควรถูกปิดอัตโนมัติแล้วหรือยัง
func isStaleSession(session *models.AttendanceSession, now time.Time) bool {
	if deadline, ok := sessionScanDeadline(session); ok {
		return now.After(deadline)
	}

	return !sameDay(now, session.SessionDate)
}

// markAbsentees สร้างแถว absent ให้คนที่ยืนยันว่าจะมาเรียนแล้วไม่มาเช็คชื่อ
func (s *AttendanceService) markAbsentees(
	tx *gorm.DB,
	session *models.AttendanceSession,
	recordedBy *uint,
	now time.Time,
) error {
	expireStaleEnrollments(tx)

	packageIDs, err := s.siblingPackageIDs(tx, session)
	if err != nil {
		return err
	}

	enrollments, err := s.activeEnrollments(tx, packageIDs)
	if err != nil {
		return err
	}

	confirmed, err := s.confirmedCustomers(tx, packageIDs, session.SessionDate, session.ScheduleStartTime)
	if err != nil {
		return err
	}

	var records []models.StudentAttendance
	if err := tx.Where("attendance_session_id = ?", session.ID).Find(&records).Error; err != nil {
		return errors.New("ไม่สามารถดึงข้อมูลการเช็คชื่อได้")
	}
	checked := make(map[uint]bool, len(records))
	for _, r := range records {
		checked[r.EnrollmentID] = true
	}

	sessionID := session.ID

	for _, group := range groupEnrollmentsByCustomer(enrollments) {
		if !confirmed[group[0].CustomerID] {
			continue
		}
		alreadyChecked := false
		for _, e := range group {
			if checked[e.ID] {
				alreadyChecked = true
			}
		}
		if alreadyChecked {
			continue
		}

		e := pickUsableEnrollmentPtr(group)

		var studentUserID *uint
		if uid, err := ResolveUserID(tx, e.CustomerID); err == nil {
			studentUserID = &uid
		}

		record := models.StudentAttendance{
			CheckInTime:         now,
			CheckInMethod:       models.CheckInMethodSystem,
			Status:              models.AttendanceStatusAbsent,
			EnrollmentID:        e.ID,
			UserID:              studentUserID,
			AttendanceSessionID: &sessionID,
			RecordedByUserID:    recordedBy,
		}
		if err := tx.Create(&record).Error; err != nil {
			if isUniqueViolation(err) {
				continue
			}
			return errors.New("ไม่สามารถบันทึกการขาดเรียนได้")
		}
	}

	return nil
}

func quotaDelta(from, to models.AttendanceStatus) int {
	fromPresent := from == models.AttendanceStatusPresent
	toPresent := to == models.AttendanceStatusPresent

	switch {
	case fromPresent && !toPresent:
		return +1
	case !fromPresent && toPresent:
		return -1
	default:
		return 0
	}
}

func (s *AttendanceService) UpdateAttendanceStatus(
	attendanceID uint,
	adminUserID uint,
	req dto.UpdateAttendanceStatusReq,
) (*dto.UpdateAttendanceResultDTO, error) {
	newStatus := models.AttendanceStatus(req.Status)
	switch newStatus {
	case models.AttendanceStatusPresent, models.AttendanceStatusAbsent:
	default:
		return nil, ErrInvalidStatus
	}

	var result dto.UpdateAttendanceResultDTO

	err := s.db.Transaction(func(tx *gorm.DB) error {
		var record models.StudentAttendance
		if err := tx.First(&record, attendanceID).Error; err != nil {
			return ErrAttendanceNotFound
		}

		oldStatus := record.Status
		delta := quotaDelta(oldStatus, newStatus)

		updates := map[string]interface{}{
			"status":              newStatus,
			"recorded_by_user_id": adminUserID,
		}
		if remarks := strings.TrimSpace(req.Remarks); remarks != "" {
			updates["remarks"] = remarks
		}

		if err := tx.Model(&models.StudentAttendance{}).
			Where("id = ?", attendanceID).
			Updates(updates).Error; err != nil {
			return errors.New("ไม่สามารถแก้ไขสถานะการเข้าเรียนได้")
		}

		switch delta {
		case +1:
			if err := refundSession(tx, record.EnrollmentID); err != nil {
				return err
			}
		case -1:
			if err := deductSession(tx, record.EnrollmentID); err != nil && !errors.Is(err, ErrNoSessionsLeft) {
				return err
			}
		}

		var enrollment models.Enrollment
		if err := tx.First(&enrollment, record.EnrollmentID).Error; err != nil {
			return errors.New("ไม่สามารถอ่านจำนวนครั้งคงเหลือได้")
		}

		result = dto.UpdateAttendanceResultDTO{
			AttendanceID:      attendanceID,
			EnrollmentID:      record.EnrollmentID,
			FromStatus:        string(oldStatus),
			ToStatus:          string(newStatus),
			QuotaDelta:        delta,
			RemainingSessions: enrollment.RemainingSessions,
		}
		return nil
	})

	if err != nil {
		return nil, err
	}
	return &result, nil
}

const (
	DefaultHistoryLimit = 100
	MaxHistoryLimit     = 500
)

// HistoryFilter = ตัวกรองร่วมของประวัตินักเรียนและประวัติโค้ช
type HistoryFilter struct {
	CourseID uint
	From     string // YYYY-MM-DD นับรวมวันนี้ · ว่าง = ไม่จำกัดขอบล่าง
	To       string // YYYY-MM-DD นับรวมวันนี้ · ว่าง = ไม่จำกัดขอบบน
	Query    string // ค้นจากชื่อ-นามสกุลหรือชื่อเล่น
	Limit    int    // <= 0 = ไม่จำกัด (ใช้ตอน export เท่านั้น)
	Offset   int

	SessionIDs []uint
}

// withDeleted ใช้กับ Preload ของหน้าประวัติ เพื่อให้เห็นเจ้าของแถวที่ถูกลบไปแล้วด้วย
func withDeleted(db *gorm.DB) *gorm.DB { return db.Unscoped() }

// historyDateRange แปลงช่วงวันเป็นขอบเวลาจริง · ส่งมาข้างเดียวถือว่าเป็นวันเดียว
func historyDateRange(from, to string) (start, end time.Time, ok bool, err error) {
	if from == "" && to == "" {
		return time.Time{}, time.Time{}, false, nil
	}
	if from == "" {
		from = to
	}
	if to == "" {
		to = from
	}

	start, _, err = localDayRange(from)
	if err != nil {
		return time.Time{}, time.Time{}, false, err
	}
	_, end, err = localDayRange(to)
	if err != nil {
		return time.Time{}, time.Time{}, false, err
	}
	if end.Before(start) {
		return time.Time{}, time.Time{}, false, ErrHistoryRangeReversed
	}
	return start, end, true, nil
}

// nameSearchPattern เตรียมค่าให้ ILIKE — ต้อง escape ตัวที่มีความหมายพิเศษก่อน
func nameSearchPattern(q string) string {
	r := strings.NewReplacer(`\`, `\\`, "%", `\%`, "_", `\_`)
	return "%" + r.Replace(strings.TrimSpace(q)) + "%"
}

// historyBaseQuery ประกอบ join/where ของตัวกรอง — ใช้ร่วมกันทั้งตอนนับและตอนดึงแถว
func (s *AttendanceService) historyBaseQuery(f HistoryFilter) (*gorm.DB, error) {
	query := s.db.Model(&models.StudentAttendance{})

	start, end, ok, err := historyDateRange(f.From, f.To)
	if err != nil {
		return nil, err
	}
	if ok {
		query = query.Where(
			"student_attendances.check_in_time >= ? AND student_attendances.check_in_time < ?",
			start, end)
	}

	search := strings.TrimSpace(f.Query)
	if f.CourseID != 0 || search != "" {
		query = query.Joins("JOIN enrollments ON enrollments.id = student_attendances.enrollment_id")
	}

	if f.CourseID != 0 {
		query = query.
			Joins("JOIN packages ON packages.id = enrollments.package_id").
			Where("packages.course_id = ?", f.CourseID)
	}

	if search != "" {
		pattern := nameSearchPattern(search)
		query = query.
			Joins("JOIN customers ON customers.id = enrollments.customer_id").
			Joins("JOIN users ON users.id = customers.user_id").
			Where("(users.first_name || ' ' || users.last_name) ILIKE ? OR customers.nickname ILIKE ?",
				pattern, pattern)
	}

	return query, nil
}

// GetHistory คืนประวัติการเช็คชื่อของนักเรียนหนึ่งหน้า พร้อมยอดรวมของทั้งช่วง
func (s *AttendanceService) GetHistory(f HistoryFilter) ([]dto.AttendanceHistoryItemDTO, int64, error) {
	base, err := s.historyBaseQuery(f)
	if err != nil {
		return nil, 0, err
	}

	var total int64
	if err := base.Session(&gorm.Session{}).Count(&total).Error; err != nil {
		return nil, 0, errors.New("ไม่สามารถนับจำนวนประวัติการเช็คชื่อได้")
	}

	query := base.Session(&gorm.Session{}).
		Preload("Enrollment", withDeleted).
		Preload("Enrollment.Customer", withDeleted).
		Preload("Enrollment.Customer.User", withDeleted).
		Preload("Enrollment.Package", withDeleted).
		Preload("Enrollment.Package.Course", withDeleted).
		Preload("AttendanceSession").
		Order("student_attendances.check_in_time DESC")

	if f.Limit > 0 {
		query = query.Limit(f.Limit).Offset(f.Offset)
	}

	var records []models.StudentAttendance
	if err := query.Find(&records).Error; err != nil {
		return nil, 0, errors.New("ไม่สามารถดึงประวัติการเช็คชื่อได้")
	}

	items := make([]dto.AttendanceHistoryItemDTO, 0, len(records))
	for i := range records {
		r := &records[i]
		item := dto.AttendanceHistoryItemDTO{
			AttendanceID:     r.ID,
			SessionID:        r.AttendanceSessionID,
			EnrollmentID:     r.EnrollmentID,
			Status:           string(r.Status),
			CheckInMethod:    string(r.CheckInMethod),
			CheckInTime:      r.CheckInTime,
			IsOffSchedule:    r.IsOffSchedule,
			Remarks:          r.Remarks,
			RecordedByUserID: r.RecordedByUserID,
		}
		if r.AttendanceSession != nil {
			item.SessionDate = r.AttendanceSession.SessionDate
			item.ScheduleStartTime = r.AttendanceSession.ScheduleStartTime
			item.ScheduleEndTime = r.AttendanceSession.ScheduleEndTime
		}
		if r.Enrollment != nil {
			if c := r.Enrollment.Customer; c != nil {
				item.Nickname = c.Nickname
				if c.User != nil {
					item.FullName = c.User.FirstName + " " + c.User.LastName
				}
			}
			if p := r.Enrollment.Package; p != nil && p.Course != nil {
				item.CourseName = p.Course.CourseName
			}
		}
		items = append(items, item)
	}

	return items, total, nil
}
