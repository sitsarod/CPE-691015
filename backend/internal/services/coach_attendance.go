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
	ErrCoachQRNotFound      = errors.New("ไม่พบโค้ชจากรหัส QR นี้")
	ErrCoachAlreadyWorkedIn = errors.New("โค้ชคนนี้เช็คชื่อคาบนี้ไปแล้ว")
	ErrCoachInactive        = errors.New("บัญชีโค้ชนี้ถูกพักงานอยู่ ไม่สามารถเช็คชื่อได้")
	ErrCoachNotFound        = errors.New("ไม่พบโค้ชคนนี้")
)

// Coach.Status เป็น string ธรรมดา ไม่ใช่ enum
const (
	coachStatusInactive = "inactive"
	coachStatusActive   = "active"
)

// findCoachByQR หาโค้ชจาก QR ประจำตัว — CheckInByQR ต้องรู้ก่อนเข้าเส้นทางนักเรียน
func (s *AttendanceService) findCoachByQR(code string) (*models.Coach, error) {
	var coach models.Coach
	err := s.db.Preload("User").Where("personal_qr_code = ?", code).First(&coach).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrCoachQRNotFound
	}
	if err != nil {
		return nil, err
	}
	return &coach, nil
}

// checkInCoach บันทึกว่าโค้ชมาสอนคาบนี้
func (s *AttendanceService) checkInCoach(
	sessionID uint,
	coach *models.Coach,
) (*dto.CoachCheckInResultDTO, error) {
	return s.recordCoachAttendance(sessionID, coach, models.CheckInMethodQRCode, "", nil)
}

// recordCoachAttendance คือทางเขียนบันทึกเช็คชื่อของโค้ชทางเดียวในระบบ
func (s *AttendanceService) recordCoachAttendance(
	sessionID uint,
	coach *models.Coach,
	method models.CheckInMethod,
	remarks string,
	recordedBy *uint,
) (*dto.CoachCheckInResultDTO, error) {
	if coach.Status == coachStatusInactive {
		return nil, ErrCoachInactive
	}

	var record models.CoachAttendance

	err := s.db.Transaction(func(tx *gorm.DB) error {
		session, err := s.loadOpenSession(tx, sessionID)
		if err != nil {
			return err
		}

		scheduled, err := s.ensureCoachWorkSchedule(tx, coach.ID, session)
		if err != nil {
			return err
		}

		record = models.CoachAttendance{
			CoachID:             coach.ID,
			AttendanceSessionID: session.ID,
			WorkDate:            session.SessionDate,
			CheckInTime:         nowLocal(),
			CheckInMethod:       method,
			Status:              models.AttendanceStatusPresent,
			Remarks:             remarks,
			IsScheduled:         scheduled,
			RecordedByUserID:    recordedBy,
		}

		if err := tx.Create(&record).Error; err != nil {
			if isUniqueViolation(err) {
				return ErrCoachAlreadyWorkedIn
			}
			return errors.New("ไม่สามารถบันทึกการเช็คชื่อของโค้ชได้")
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	result := &dto.CoachCheckInResultDTO{
		AttendanceID:  record.ID,
		CoachID:       coach.ID,
		Nickname:      coach.Nickname,
		CheckInMethod: string(record.CheckInMethod),
		CheckInTime:   record.CheckInTime,
		SessionDate:   record.WorkDate.Format("2006-01-02"),
		IsScheduled:   record.IsScheduled,
	}
	if coach.User != nil {
		result.FullName = coach.User.FirstName + " " + coach.User.LastName
	}
	return result, nil
}

// ensureCoachWorkSchedule ทำให้แน่ใจว่าโค้ชมีตารางงานของคาบนี้ คืน true ถ้ามีอยู่ก่อนแล้ว
func (s *AttendanceService) ensureCoachWorkSchedule(
	tx *gorm.DB,
	coachID uint,
	session *models.AttendanceSession,
) (bool, error) {
	date := session.SessionDate.Format("2006-01-02")

	scope, err := s.classScheduleScope(tx, session)
	if err != nil {
		return false, err
	}

	var existing int64
	if err := scope.Model(&models.WorkSchedule{}).
		Where("coach_id = ?", coachID).
		Count(&existing).Error; err != nil {
		return false, errors.New("ไม่สามารถตรวจตารางงานของโค้ชได้")
	}
	if existing > 0 {
		return true, nil
	}

	var pkg models.Package
	if err := tx.Select("id", "course_id").First(&pkg, session.PackageID).Error; err != nil {
		return false, errors.New("ไม่พบแพ็กเกจของรอบนี้")
	}

	// ผูก PackageScheduleID ให้ด้วยถ้าหาเจอ แถวที่สร้างอัตโนมัติจะได้หน้าตา
	var packageScheduleID *uint
	var ps models.PackageSchedule
	if err := tx.Where("package_id = ? AND day_of_week = ?",
		session.PackageID, session.SessionDate.Weekday().String()).
		First(&ps).Error; err == nil {
		packageScheduleID = &ps.ID
	}

	schedule := models.WorkSchedule{
		Date:      date,
		StartTime: session.ScheduleStartTime,
		EndTime:   session.ScheduleEndTime,

		Description: "เพิ่มอัตโนมัติจากการสแกนเช็คชื่อของโค้ช",

		CoachID:           coachID,
		CourseID:          pkg.CourseID,
		PackageID:         &session.PackageID,
		PackageScheduleID: packageScheduleID,
		IsEmergency:       true,

		PayRateSnapshot: coachPayRateSnapshot(tx, coachID),
	}
	if err := tx.Create(&schedule).Error; err != nil {
		return false, errors.New("ไม่สามารถเพิ่มตารางงานให้โค้ชได้")
	}
	return false, nil
}

// ─── รายชื่อโค้ชของรอบ ───────────────────────────────────────────────────────

func (s *AttendanceService) classScheduleScope(
	tx *gorm.DB,
	session *models.AttendanceSession,
) (*gorm.DB, error) {
	date := session.SessionDate.Format("2006-01-02")

	if session.ScheduleStartTime == "" || session.ScheduleEndTime == "" {
		return tx.Where("package_id = ? AND date = ?", session.PackageID, date), nil
	}

	courseID, err := s.sessionCourseID(tx, session)
	if err != nil {
		return nil, err
	}
	if courseID == 0 {
		return tx.Where("package_id = ? AND date = ?", session.PackageID, date), nil
	}

	return tx.Where("course_id = ? AND date = ? AND start_time = ? AND end_time = ?",
		courseID, date, session.ScheduleStartTime, session.ScheduleEndTime), nil
}

// coachSchedules = "ใครควรมาสอนคาบนี้" เทียบเท่า activeEnrollments ของฝั่งนักเรียน
func (s *AttendanceService) coachSchedules(
	tx *gorm.DB,
	session *models.AttendanceSession,
) ([]models.WorkSchedule, error) {
	q, err := s.classScheduleScope(tx, session)
	if err != nil {
		return nil, err
	}

	var rows []models.WorkSchedule
	if err := q.Preload("Coach.User").Order("id ASC").Find(&rows).Error; err != nil {
		return nil, errors.New("ไม่สามารถดึงตารางงานของโค้ชได้")
	}

	seen := make(map[uint]bool, len(rows))
	out := rows[:0]
	for _, w := range rows {
		if seen[w.CoachID] {
			continue
		}
		seen[w.CoachID] = true
		out = append(out, w)
	}
	return out, nil
}

func coachDisplayName(coach *models.Coach) (fullName, nickname string) {
	if coach == nil {
		return "", ""
	}
	nickname = coach.Nickname
	if coach.User != nil {
		fullName = strings.TrimSpace(coach.User.FirstName + " " + coach.User.LastName)
	}
	return fullName, nickname
}

// buildCoachRoster รวมรายชื่อจากสองทาง: ตารางงาน (คนที่ควรมา) + บันทึกเช็คชื่อ (คนที่มาแล้ว)
func (s *AttendanceService) buildCoachRoster(
	tx *gorm.DB,
	session *models.AttendanceSession,
) ([]dto.CoachRosterItemDTO, error) {
	schedules, err := s.coachSchedules(tx, session)
	if err != nil {
		return nil, err
	}

	var records []models.CoachAttendance
	if err := tx.Where("attendance_session_id = ?", session.ID).Find(&records).Error; err != nil {
		return nil, errors.New("ไม่สามารถดึงข้อมูลการเช็คชื่อของโค้ชได้")
	}
	byCoach := make(map[uint]*models.CoachAttendance, len(records))
	for i := range records {
		byCoach[records[i].CoachID] = &records[i]
	}

	inRoster := make(map[uint]bool, len(schedules))
	out := make([]dto.CoachRosterItemDTO, 0, len(schedules))

	for _, w := range schedules {
		inRoster[w.CoachID] = true
		full, nick := coachDisplayName(w.Coach)
		item := dto.CoachRosterItemDTO{
			CoachID:     w.CoachID,
			FullName:    full,
			Nickname:    nick,
			CourtNumber: w.Courtnumber,
			IsEmergency: w.IsEmergency,
			IsScheduled: true,
		}
		applyCoachAttendance(&item, byCoach[w.CoachID])
		out = append(out, item)
	}

	for i := range records {
		r := &records[i]
		if inRoster[r.CoachID] {
			continue
		}
		var coach models.Coach
		if err := tx.Preload("User").First(&coach, r.CoachID).Error; err != nil {
			continue
		}
		full, nick := coachDisplayName(&coach)
		item := dto.CoachRosterItemDTO{
			CoachID:     r.CoachID,
			FullName:    full,
			Nickname:    nick,
			IsScheduled: false,
		}
		applyCoachAttendance(&item, r)
		out = append(out, item)
	}

	return out, nil
}

func applyCoachAttendance(item *dto.CoachRosterItemDTO, record *models.CoachAttendance) {
	if record == nil {
		return
	}
	id := record.ID
	at := record.CheckInTime
	item.AttendanceID = &id
	item.Status = string(record.Status)
	item.CheckInMethod = string(record.CheckInMethod)
	item.CheckInTime = &at
	item.Remarks = record.Remarks
}

// ManualCoachCheckIn ให้แอดมินเช็คชื่อแทนโค้ชที่ลืม QR (คู่ขนานกับ ManualCheckIn ของนักเรียน)
func (s *AttendanceService) ManualCoachCheckIn(
	sessionID uint,
	coachID uint,
	adminUserID uint,
	remarks string,
) (*dto.CoachCheckInResultDTO, error) {
	var coach models.Coach
	if err := s.db.Preload("User").First(&coach, coachID).Error; err != nil {
		return nil, ErrCoachNotFound
	}
	return s.recordCoachAttendance(
		sessionID, &coach, models.CheckInMethodManual, strings.TrimSpace(remarks), &adminUserID)
}

// markCoachAbsentees มาร์คโค้ชที่มีตารางงานแต่ไม่ได้เช็คชื่อว่า "ขาดงาน"
func (s *AttendanceService) markCoachAbsentees(
	tx *gorm.DB,
	session *models.AttendanceSession,
	recordedBy *uint,
	now time.Time,
) error {
	schedules, err := s.coachSchedules(tx, session)
	if err != nil {
		return err
	}
	if len(schedules) == 0 {
		return nil
	}

	var records []models.CoachAttendance
	if err := tx.Select("coach_id").
		Where("attendance_session_id = ?", session.ID).Find(&records).Error; err != nil {
		return errors.New("ไม่สามารถดึงข้อมูลการเช็คชื่อของโค้ชได้")
	}
	checked := make(map[uint]bool, len(records))
	for _, r := range records {
		checked[r.CoachID] = true
	}

	for _, w := range schedules {
		if checked[w.CoachID] {
			continue
		}
		record := models.CoachAttendance{
			CoachID:             w.CoachID,
			AttendanceSessionID: session.ID,
			WorkDate:            session.SessionDate,
			CheckInTime:         now,
			CheckInMethod:       models.CheckInMethodSystem,
			Status:              models.AttendanceStatusAbsent,
			IsScheduled:         true, // อยู่ในตารางงานอยู่แล้ว ถึงได้ถูกมาร์ค
			RecordedByUserID:    recordedBy,
		}
		if err := tx.Create(&record).Error; err != nil {
			if isUniqueViolation(err) {
				continue
			}
			return errors.New("ไม่สามารถบันทึกการขาดงานของโค้ชได้")
		}
	}
	return nil
}

// UpdateCoachAttendanceStatus สลับ present ⟷ absent ย้อนหลัง
func (s *AttendanceService) UpdateCoachAttendanceStatus(
	attendanceID uint,
	adminUserID uint,
	req dto.UpdateAttendanceStatusReq,
) (*dto.UpdateCoachAttendanceResultDTO, error) {
	newStatus := models.AttendanceStatus(req.Status)
	if newStatus != models.AttendanceStatusPresent && newStatus != models.AttendanceStatusAbsent {
		return nil, ErrInvalidStatus
	}

	var record models.CoachAttendance
	if err := s.db.First(&record, attendanceID).Error; err != nil {
		return nil, ErrAttendanceNotFound
	}

	from := record.Status
	updates := map[string]interface{}{
		"status":              newStatus,
		"recorded_by_user_id": adminUserID,
	}
	if remarks := strings.TrimSpace(req.Remarks); remarks != "" {
		updates["remarks"] = remarks
	}
	if err := s.db.Model(&record).Updates(updates).Error; err != nil {
		return nil, errors.New("ไม่สามารถแก้สถานะการเช็คชื่อของโค้ชได้")
	}

	return &dto.UpdateCoachAttendanceResultDTO{
		AttendanceID: record.ID,
		CoachID:      record.CoachID,
		FromStatus:   string(from),
		ToStatus:     string(newStatus),
	}, nil
}

// GetCoachHistory คืนประวัติเข้าสอนของโค้ช ใช้ตัวกรองชุดเดียวกับ GetHistory
func (s *AttendanceService) GetCoachHistory(f HistoryFilter) ([]dto.CoachHistoryItemDTO, error) {
	query := s.db.Model(&models.CoachAttendance{}).
		Preload("Coach", withDeleted).
		Preload("Coach.User", withDeleted).
		Order("coach_attendances.check_in_time DESC")

	start, end, ok, err := historyDateRange(f.From, f.To)
	if err != nil {
		return nil, err
	}
	if ok {
		query = query.Where(
			"coach_attendances.check_in_time >= ? AND coach_attendances.check_in_time < ?",
			start, end)
	}

	if len(f.SessionIDs) > 0 {
		query = query.Where("coach_attendances.attendance_session_id IN ?", f.SessionIDs)
	} else if f.Limit > 0 {
		query = query.Limit(f.Limit)
	}

	if f.CourseID != 0 {
		query = query.
			Joins("JOIN attendance_sessions ON attendance_sessions.id = coach_attendances.attendance_session_id").
			Joins("JOIN packages ON packages.id = attendance_sessions.package_id").
			Where("packages.course_id = ?", f.CourseID)
	}

	if search := strings.TrimSpace(f.Query); search != "" {
		pattern := nameSearchPattern(search)
		query = query.
			Joins("JOIN coaches ON coaches.id = coach_attendances.coach_id").
			Joins("JOIN users AS coach_users ON coach_users.id = coaches.user_id").
			Where("(coach_users.first_name || ' ' || coach_users.last_name) ILIKE ?", pattern)
	}

	var rows []models.CoachAttendance
	if err := query.Find(&rows).Error; err != nil {
		return nil, errors.New("ไม่สามารถดึงประวัติการเข้าสอนของโค้ชได้")
	}

	out := make([]dto.CoachHistoryItemDTO, 0, len(rows))
	for i := range rows {
		r := &rows[i]
		full, nick := coachDisplayName(r.Coach)
		out = append(out, dto.CoachHistoryItemDTO{
			AttendanceID:  r.ID,
			SessionID:     r.AttendanceSessionID,
			CoachID:       r.CoachID,
			FullName:      full,
			Nickname:      nick,
			Status:        string(r.Status),
			CheckInMethod: string(r.CheckInMethod),
			CheckInTime:   r.CheckInTime,
			Remarks:       r.Remarks,
			IsScheduled:   r.IsScheduled,
		})
	}
	return out, nil
}
