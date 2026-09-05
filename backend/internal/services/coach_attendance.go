package services

import (
	"errors"
	"strings"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
	"gorm.io/gorm"
)

var (
	ErrCoachQRNotFound      = errors.New("ไม่พบโค้ชจากรหัส QR นี้")
	ErrCoachAlreadyWorkedIn = errors.New("โค้ชคนนี้เช็คชื่อคาบนี้ไปแล้ว")
	ErrCoachInactive        = errors.New("บัญชีโค้ชนี้ถูกพักงานอยู่ ไม่สามารถเช็คชื่อได้")
)

// Coach.Status เป็น string ธรรมดา ไม่ใช่ enum
const coachStatusInactive = "inactive"

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
//
// ผ่าน loadOpenSession ด่านเดียวกับนักเรียน — คาบที่สแกนไม่ได้แล้ว โค้ชก็ไม่ควรสแกนได้
func (s *AttendanceService) checkInCoach(
	sessionID uint,
	coach *models.Coach,
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

		record = models.CoachAttendance{
			CoachID:             coach.ID,
			AttendanceSessionID: session.ID,
			WorkDate:            session.SessionDate,
			CheckInTime:         nowLocal(),
			CheckInMethod:       models.CheckInMethodQRCode,
			Status:              models.AttendanceStatusPresent,
		}

		// พึ่ง unique index แทน SELECT-แล้ว-INSERT — สแกนรัวสองครั้ง
		// สอง request จะอ่านเจอ "ยังไม่มี" พร้อมกันทั้งคู่
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
	}
	if coach.User != nil {
		result.FullName = coach.User.FirstName + " " + coach.User.LastName
	}
	return result, nil
}

// ─── รายชื่อโค้ชของรอบ ───────────────────────────────────────────────────────

// coachSchedules = "ใครควรมาสอนคาบนี้" เทียบเท่า activeEnrollments ของฝั่งนักเรียน
func (s *AttendanceService) coachSchedules(
	tx *gorm.DB,
	session *models.AttendanceSession,
) ([]models.WorkSchedule, error) {
	var rows []models.WorkSchedule
	err := tx.Preload("Coach.User").
		Where("package_id = ? AND date = ?", session.PackageID, session.SessionDate.Format("2006-01-02")).
		Order("id ASC").
		Find(&rows).Error
	if err != nil {
		return nil, errors.New("ไม่สามารถดึงตารางงานของโค้ชได้")
	}

	// work_schedules ไม่มี unique index แถวซ้ำจึงเกิดได้จริง (GetWeekSessions ก็กันแบบนี้)
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
//
// ⚠️ ทางที่สองขาดไม่ได้ — โค้ชสแกนได้โดยไม่ต้องมีตารางงาน คนกลุ่มนั้นโผล่ทางนี้ทางเดียว
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
}
