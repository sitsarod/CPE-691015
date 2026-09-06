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
//
// closedBy = nil แปลว่าระบบเป็นคนปิด เก็บเป็น NULL ไว้ตอบตอนมีคนทักท้วงย้อนหลัง
// ว่าการหักโควตาครั้งนั้นไม่มีมนุษย์คนไหนสั่ง
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

	// status ใน WHERE คือด่านกันปิดซ้ำ — แอดมินกับงานอัตโนมัติชนกันได้จริง
	// ตัวที่มาทีหลังได้ RowsAffected = 0 แล้วถอย ไม่ใช่มาร์คขาดเรียนซ้ำรอบสอง
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
	// โค้ชที่มีตารางงานแต่ไม่ได้เช็คชื่อ ก็ถูกมาร์คขาดงานเหมือนนักเรียน
	return s.markCoachAbsentees(tx, &session, closedBy, now)
}

// GetOpenSessions คืนรอบที่ยังเปิดค้างอยู่ทั้งหมด เรียงรอบล่าสุดขึ้นก่อน
//
// จำเป็นเพราะ GetOpenablePackages คืนเฉพาะแพ็กเกจที่อยู่ในคาบตอนนี้ พอเลยเวลา
// รอบที่ลืมปิดจะหลุดจากจอและไม่มีทางกดเข้าไปปิดได้อีก ทั้งที่คนไม่มายังไม่ถูกมาร์คขาด
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
//
// ⚠️ หักโควตาคนที่ไม่มาโดยไม่มีมนุษย์กดยืนยัน จึงรอจนพ้น sessionScanDeadline เสมอ
// (ตัวเดียวกับที่กันการสแกน) เพื่อให้แอดมินมีช่วงเข้ามาจัดการเองก่อนทุกครั้ง
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

		// แยก transaction ต่อรอบ — รอบที่พังไม่ควรลากรอบอื่นล้มไปด้วย
		sessionID := session.ID
		err := s.db.Transaction(func(tx *gorm.DB) error {
			return s.closeSessionTx(tx, sessionID, nil, now)
		})
		if err != nil {
			// แอดมินชิงกดปิดไปก่อน = ผลลัพธ์ที่ต้องการอยู่แล้ว ไม่ใช่ข้อผิดพลาด
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

	// ไม่มีสแนปช็อตเวลาคาบ (ข้อมูลเก่า) — รอขึ้นวันใหม่ก่อน จะได้ไม่เผลอปิดรอบที่ยังเรียนอยู่
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
			// โควตาหมดแล้วหักไม่ได้ ปล่อยผ่าน — สถานะยังต้องถูกแก้ตามที่แอดมินสั่ง
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

const maxHistoryRows = 500

func (s *AttendanceService) GetHistory(courseID uint, date string) ([]dto.AttendanceHistoryItemDTO, error) {
	query := s.db.Model(&models.StudentAttendance{}).
		Limit(maxHistoryRows).
		Preload("Enrollment").
		Preload("Enrollment.Customer").
		Preload("Enrollment.Customer.User").
		Preload("Enrollment.Package").
		Preload("Enrollment.Package.Course").
		Preload("AttendanceSession").
		Order("check_in_time DESC")

	if date != "" {
		from, to, err := localDayRange(date)
		if err != nil {
			return nil, err
		}
		query = query.Where("check_in_time >= ? AND check_in_time < ?", from, to)
	}

	if courseID != 0 {
		query = query.
			Joins("JOIN enrollments ON enrollments.id = student_attendances.enrollment_id").
			Joins("JOIN packages ON packages.id = enrollments.package_id").
			Where("packages.course_id = ?", courseID)
	}

	var records []models.StudentAttendance
	if err := query.Find(&records).Error; err != nil {
		return nil, errors.New("ไม่สามารถดึงประวัติการเช็คชื่อได้")
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

	return items, nil
}
