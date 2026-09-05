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

	// ทรานแซกชันเดียว เพราะการสแกนหนึ่งครั้งอาจสร้างตารางงานให้ด้วย
	// ถ้าบันทึกเช็คชื่อล้มเหลวทีหลัง ตารางงานที่เพิ่งสร้างต้องหายไปด้วย
	// ไม่งั้นเหลือตารางงานลอย ๆ ที่ไปโผล่ในการคำนวณค่าจ้าง
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
			CheckInMethod:       models.CheckInMethodQRCode,
			Status:              models.AttendanceStatusPresent,
			IsScheduled:         scheduled,
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
		IsScheduled:   record.IsScheduled,
	}
	if coach.User != nil {
		result.FullName = coach.User.FirstName + " " + coach.User.LastName
	}
	return result, nil
}

// ensureCoachWorkSchedule ทำให้แน่ใจว่าโค้ชมีตารางงานของคาบนี้ คืน true ถ้ามีอยู่ก่อนแล้ว
//
// รองรับกรณีจองสนามเพิ่มกะทันหันแล้วเรียกโค้ชมาเสริม ซึ่งแอดมินยังไม่ได้ assign
//
// ⚠️ ตั้งใจไม่เรียก validateScheduleSlot
// กฎเวลาว่าง/เวลาชน/สนามซ้อน มีไว้กันแอดมินวางแผนผิด แต่ตรงนี้โค้ชมายืนอยู่จริงแล้ว
// ปฏิเสธไปก็ไม่ได้ทำให้เขาไม่ได้สอน แค่ทำให้ข้อมูลหาย — ติดธง IsEmergency ให้มาตรวจแทน
// (ธงเดียวกับที่แอดมินติ๊ก "กรณีฉุกเฉิน" ตอน assign เอง)
//
// ⚠️ ต้องเป็น find-or-create ห้าม create เปล่า ๆ
// taughtSessionDates ไม่ dedupe วันที่ (Pluck ตรง ๆ) ทุกแถว WorkSchedule จึงเป็น
// ค่าจ้างหนึ่งหน่วย สร้างซ้ำคาบเดิม = โค้ชได้เงินสองเท่า
func (s *AttendanceService) ensureCoachWorkSchedule(
	tx *gorm.DB,
	coachID uint,
	session *models.AttendanceSession,
) (bool, error) {
	date := session.SessionDate.Format("2006-01-02")

	var existing int64
	if err := tx.Model(&models.WorkSchedule{}).
		Where("coach_id = ? AND package_id = ? AND date = ?", coachID, session.PackageID, date).
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
	// เหมือนแถวที่แอดมิน assign เอง ไม่ใช่ของแปลกปลอมในตาราง
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

		// court_number เว้นว่างให้แอดมินเติม — AttendanceSession ไม่เก็บสนาม
		// และ validateScheduleSlot เองก็ถือว่าสนามเป็น optional อยู่แล้ว
		Description: "เพิ่มอัตโนมัติจากการสแกนเช็คชื่อของโค้ช",

		CoachID:           coachID,
		CourseID:          pkg.CourseID,
		PackageID:         &session.PackageID,
		PackageScheduleID: packageScheduleID,
		IsEmergency:       true,
	}
	if err := tx.Create(&schedule).Error; err != nil {
		return false, errors.New("ไม่สามารถเพิ่มตารางงานให้โค้ชได้")
	}
	return false, nil
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
}
