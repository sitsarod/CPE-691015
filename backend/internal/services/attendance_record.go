package services

import (
	"errors"
	"strings"
	"time"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
	"gorm.io/gorm"
)

var (
	ErrAttendanceNotFound = errors.New("ไม่พบบันทึกการเช็คชื่อนี้")
	ErrInvalidStatus      = errors.New("สถานะไม่ถูกต้อง (รองรับเฉพาะ present, absent, leave)")
)

func (s *AttendanceService) CloseSession(sessionID uint, adminUserID uint) (*dto.AttendanceSessionDTO, error) {
	err := s.db.Transaction(func(tx *gorm.DB) error {
		var session models.AttendanceSession
		if err := tx.First(&session, sessionID).Error; err != nil {
			return ErrSessionNotFound
		}

		now := time.Now()

		res := tx.Model(&models.AttendanceSession{}).
			Where("id = ? AND status = ?", sessionID, models.AttendanceSessionOpen).
			Updates(map[string]interface{}{
				"status":            models.AttendanceSessionClosed,
				"closed_at":         now,
				"closed_by_user_id": adminUserID,
			})
		if res.Error != nil {
			return errors.New("ไม่สามารถปิดรอบเช็คชื่อได้")
		}
		if res.RowsAffected == 0 {
			return ErrSessionClosed
		}

		return s.markAbsentees(tx, &session, adminUserID, now)
	})

	if err != nil {
		return nil, err
	}
	return s.GetSession(sessionID)
}

// markAbsentees สร้างแถว absent ให้ทุกคนใน roster ที่ไม่มีบันทึกในรอบนี้
func (s *AttendanceService) markAbsentees(
	tx *gorm.DB,
	session *models.AttendanceSession,
	adminUserID uint,
	now time.Time,
) error {
	enrollments, err := s.activeEnrollments(tx, session.PackageID)
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
	for i := range enrollments {
		e := &enrollments[i]
		if checked[e.ID] {
			continue
		}

		var studentUserID *uint
		if uid, err := ResolveUserID(tx, e.CustomerID); err == nil {
			studentUserID = &uid
		}

		record := models.StudentAttendance{
			CheckInTime:         now,
			CheckInMethod:       models.CheckInMethodManual,
			Status:              models.AttendanceStatusAbsent,
			EnrollmentID:        e.ID,
			UserID:              studentUserID,
			AttendanceSessionID: &sessionID,
			RecordedByUserID:    &adminUserID,
		}
		if err := tx.Create(&record).Error; err != nil {
			return errors.New("ไม่สามารถบันทึกการขาดเรียนได้")
		}

		if e.RemainingSessions > 0 {
			if err := deductSession(tx, e.ID); err != nil && !errors.Is(err, ErrNoSessionsLeft) {
				return err
			}
		}
	}

	return nil
}

func quotaDelta(from, to models.AttendanceStatus) int {
	fromLeave := from == models.AttendanceStatusLeave
	toLeave := to == models.AttendanceStatusLeave

	switch {
	case !fromLeave && toLeave:
		return +1
	case fromLeave && !toLeave:
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
	case models.AttendanceStatusPresent, models.AttendanceStatusAbsent, models.AttendanceStatusLeave:
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

func (s *AttendanceService) GetHistory(courseID uint, date string) ([]dto.AttendanceHistoryItemDTO, error) {
	query := s.db.Model(&models.StudentAttendance{}).
		Preload("Enrollment").
		Preload("Enrollment.Customer").
		Preload("Enrollment.Customer.User").
		Preload("Enrollment.Package").
		Preload("Enrollment.Package.Course").
		Preload("AttendanceSession").
		Order("check_in_time DESC")

	if date != "" {
		parsed, err := time.Parse("2006-01-02", date)
		if err != nil {
			return nil, errors.New("รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)")
		}
		next := parsed.AddDate(0, 0, 1)
		query = query.Where("check_in_time >= ? AND check_in_time < ?", parsed, next)
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
			Remarks:          r.Remarks,
			RecordedByUserID: r.RecordedByUserID,
		}
		if r.AttendanceSession != nil {
			item.SessionDate = r.AttendanceSession.SessionDate
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
