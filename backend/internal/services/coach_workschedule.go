package services

import (
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"

	"gorm.io/gorm"
)

// weekdayOffset แปลงชื่อวันเป็นจำนวนวันนับจากวันอาทิตย์ (คอลัมน์แรกของสัปดาห์)
var weekdayOffset = map[string]int{
	"Sunday": 0, "Monday": 1, "Tuesday": 2, "Wednesday": 3,
	"Thursday": 4, "Friday": 5, "Saturday": 6,
}

type WorkScheduleService interface {
	AssignWorkSchedule(req dto.CreateWorkScheduleRequest) (*models.WorkSchedule, error)
	GetAll() ([]models.WorkSchedule, error)
	GetByCoachID(coachID uint, userID uint, role string) ([]models.WorkSchedule, error)
	TaughtSessionDates(coachID uint, userID uint, role string) ([]string, error)
	GetByID(id uint) (*models.WorkSchedule, error)
	Update(id uint, req dto.CreateWorkScheduleRequest) (*models.WorkSchedule, error)
	Delete(id uint) error
	GetWeekSessions(weekStart string) ([]dto.WeekSessionResponse, error)
}

type workScheduleService struct {
	db *gorm.DB
}

func NewWorkScheduleService(db *gorm.DB) WorkScheduleService {
	return &workScheduleService{db: db}
}

// Sentinel errors ของตารางงาน — ให้ controller แยก HTTP status ได้ถูกต้อง
//   ErrScheduleInvalid  = client ส่งข้อมูลผิดรูปแบบ (400)
//   ErrScheduleConflict = ผิดกฎธุรกิจ เช่น นอกเวลาว่าง/เวลาชน/สนามซ้อน (409)
var (
	ErrScheduleInvalid  = errors.New("ข้อมูลตารางงานไม่ถูกต้อง")
	ErrScheduleConflict = errors.New("ตารางงานขัดแย้งกับข้อมูลที่มีอยู่")
)

// validateScheduleSlot ตรวจว่า slot ที่จะบันทึก/แก้ไขถูกต้องตามกฎทั้งหมด:
//   - วันที่รูปแบบ YYYY-MM-DD และเวลา HH:MM (start < end)
//   - อยู่ในช่วงเวลาว่างของโค้ชในวันนั้น
//   - ไม่ชนกับคาบอื่นของโค้ชคนเดียวกันในวันเดียวกัน
//   - สนาม (court) เดียวกันในวัน/เวลาเดียวกันต้องไม่ถูกใช้โดยคาบอื่น (แม้เป็นโค้ชคนอื่น)
//
// excludeID = 0 สำหรับสร้างใหม่, = schedule.ID สำหรับแก้ไข (จะข้าม record ตัวเองตอนเช็คการชน)
// รับ tx เข้ามาเพื่อให้ทำงานภายใต้ transaction เดียวกับการเขียนข้อมูล
func (s *workScheduleService) validateScheduleSlot(tx *gorm.DB, req dto.CreateWorkScheduleRequest, excludeID uint) error {
	parsedDate, err := time.Parse("2006-01-02", req.Date)
	if err != nil {
		return fmt.Errorf("%w: รูปแบบวันที่ต้องเป็น YYYY-MM-DD", ErrScheduleInvalid)
	}
	dayOfWeekStr := parsedDate.Weekday().String() // "Monday", "Tuesday", ...

	reqStart, err := timeToMinutesWS(req.StartTime)
	if err != nil {
		return fmt.Errorf("%w: start_time %v", ErrScheduleInvalid, err)
	}
	reqEnd, err := timeToMinutesWS(req.EndTime)
	if err != nil {
		return fmt.Errorf("%w: end_time %v", ErrScheduleInvalid, err)
	}
	if reqStart >= reqEnd {
		return fmt.Errorf("%w: start_time ต้องน้อยกว่า end_time", ErrScheduleInvalid)
	}

	// 0) โค้ชที่ถูกพักงาน (status = inactive) มอบหมายงานไม่ได้ (บล็อกแม้โหมดฉุกเฉิน)
	var coach models.Coach
	if err := tx.Select("status").First(&coach, req.CoachID).Error; err != nil {
		return err
	}
	if coach.Status == "inactive" {
		return fmt.Errorf("%w: โค้ชคนนี้ถูกพักงาน (inactive) จึงมอบหมายงานไม่ได้", ErrScheduleConflict)
	}

	// 1) ต้องอยู่ในช่วงเวลาว่างของโค้ชในวันนั้น
	// ยกเว้นกรณีฉุกเฉิน (IgnoreAvailability = true) ที่แอดมินยืนยันจะ assign แม้โค้ชไม่ว่าง
	// แต่ยังคงเช็คเวลาชน/สนามซ้อนด้านล่างเสมอ (ห้ามข้าม เพราะ double-booking เป็น error จริง)
	if !req.IgnoreAvailability {
		var availabilities []models.CoachAvailability
		if err := tx.Where("coach_id = ? AND day_of_week = ?", req.CoachID, dayOfWeekStr).Find(&availabilities).Error; err != nil {
			return err
		}
		if len(availabilities) == 0 {
			return fmt.Errorf("%w: โค้ชไม่ได้ตั้งเวลาว่างไว้ในวัน %s", ErrScheduleConflict, dayOfWeekStr)
		}
		isAvailable := false
		for _, a := range availabilities {
			as, err1 := timeToMinutesWS(a.StartTime)
			ae, err2 := timeToMinutesWS(a.EndTime)
			if err1 != nil || err2 != nil {
				continue
			}
			if reqStart >= as && reqEnd <= ae {
				isAvailable = true
				break
			}
		}
		if !isAvailable {
			return fmt.Errorf("%w: เวลาที่จะมอบหมายอยู่นอกช่วงเวลาว่างของโค้ช", ErrScheduleConflict)
		}
	}

	// 2) โค้ชคนเดียวกันต้องไม่มีคาบสอนอื่นซ้อนช่วงเวลานี้ในวันเดียวกัน (ยกเว้น record ตัวเอง)
	var coachJobs []models.WorkSchedule
	if err := tx.Where("coach_id = ? AND date = ? AND id <> ?", req.CoachID, req.Date, excludeID).Find(&coachJobs).Error; err != nil {
		return err
	}
	for _, w := range coachJobs {
		ws, _ := timeToMinutesWS(w.StartTime)
		we, _ := timeToMinutesWS(w.EndTime)
		if reqStart < we && ws < reqEnd {
			return fmt.Errorf("%w: โค้ชมีคาบสอนอื่นซ้อนช่วงเวลานี้อยู่แล้ว", ErrScheduleConflict)
		}
	}

	// 3) สนาม (optional): ถ้าระบุสนามมา ต้องไม่ถูกใช้โดย "คลาสอื่น" ที่ต่างคลาสกันในเวลาชนกัน
	//    แต่อนุญาตให้สนามซ้ำได้ถ้าเป็น "คลาสเดียวกัน" (โค้ชหลายคน co-teach คลาสเดียวกัน)
	//    นิยาม "คลาสเดียวกัน" = course + วัน + เวลาเริ่ม-จบ ตรงกัน (package เป็นแค่โควตาจำนวนครั้ง ไม่ใช่ตัวแยกคลาส)
	if strings.TrimSpace(req.CourtNumber) != "" {
		var courtJobs []models.WorkSchedule
		if err := tx.Where("court_number = ? AND date = ? AND id <> ?", req.CourtNumber, req.Date, excludeID).Find(&courtJobs).Error; err != nil {
			return err
		}
		for _, w := range courtJobs {
			ws, _ := timeToMinutesWS(w.StartTime)
			we, _ := timeToMinutesWS(w.EndTime)
			if reqStart < we && ws < reqEnd {
				sameClass := w.CourseID == req.CourseID && w.StartTime == req.StartTime && w.EndTime == req.EndTime
				if sameClass {
					continue // อนุญาต: โค้ชอีกคนสอนคลาสเดียวกันบนสนามเดียวกัน
				}
				return fmt.Errorf("%w: สนาม %s ถูกใช้งานโดยคลาสอื่นในช่วงเวลานี้แล้ว", ErrScheduleConflict, req.CourtNumber)
			}
		}
	}

	return nil
}

// AssignWorkSchedule สร้างตารางงานใหม่ให้ coach หลังผ่าน validation ครบ (ทำในทรานแซกชันเดียว)
func (s *workScheduleService) AssignWorkSchedule(req dto.CreateWorkScheduleRequest) (*models.WorkSchedule, error) {
	// ห้ามมอบหมายคาบที่วันผ่านไปแล้ว (กันย้อนหลัง — เช็คที่ server ด้วย ไม่ใช่แค่ที่ UI)
	if d, err := time.Parse("2006-01-02", req.Date); err == nil {
		today := time.Now().Truncate(24 * time.Hour)
		if d.Before(today) {
			return nil, fmt.Errorf("%w: ไม่สามารถมอบหมายคาบสอนของวันที่ผ่านไปแล้ว", ErrScheduleConflict)
		}
	}

	var work models.WorkSchedule

	err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := s.validateScheduleSlot(tx, req, 0); err != nil {
			return err
		}

		work = models.WorkSchedule{
			Date:              req.Date,
			StartTime:         req.StartTime,
			EndTime:           req.EndTime,
			Description:       req.Description,
			Courtnumber:       req.CourtNumber,
			CoachID:           req.CoachID,
			CourseID:          req.CourseID,
			PackageID:         req.PackageID,
			PackageScheduleID: req.PackageScheduleID,
			IsEmergency:       req.IgnoreAvailability,
		}
		return tx.Create(&work).Error
	})

	if err != nil {
		return nil, err
	}

	// แจ้งโค้ชว่าได้รับมอบหมายคาบสอนใหม่ (work.CoachID = coaches.id → หา users.id จาก Coach.UserID)
	var coach models.Coach
	if e := s.db.First(&coach, work.CoachID).Error; e == nil && coach.UserID != 0 {
		CreateNotification(s.db, coach.UserID,
			"work_assigned",
			fmt.Sprintf("workschedule-%d", work.ID),
			"ได้รับมอบหมายคาบสอนใหม่",
			fmt.Sprintf("วันที่ %s เวลา %s-%s น.", work.Date, work.StartTime, work.EndTime),
			"/coach/schedule",
			"info",
		)
	}

	return &work, nil
}

// GetAll ดึงตารางงานทั้งหมด (ใช้ในหน้า admin ดูปฏิทินรวมของทุก coach)
func (s *workScheduleService) GetAll() ([]models.WorkSchedule, error) {
	var schedules []models.WorkSchedule
	err := s.db.Preload("Coach").Preload("Course").Find(&schedules).Error
	return schedules, err
}

// GetByCoachID ดึงตารางงานของ coach คนเดียว (ใช้ในหน้า coach ดูตารางสอนของตัวเอง)
// coach ดูได้เฉพาะของตัวเอง, admin ดูได้ทุกคน
func (s *workScheduleService) GetByCoachID(coachID uint, userID uint, role string) ([]models.WorkSchedule, error) {
	if err := VerifyCoachOwnership(s.db, coachID, userID, role); err != nil {
		return nil, err
	}

	var schedules []models.WorkSchedule
	err := s.db.Where("coach_id = ?", coachID).Preload("Course").Find(&schedules).Error
	return schedules, err
}

// TaughtSessionDates คืน "วันที่ของคาบที่สอนจริง" ของโค้ช (รูปแบบ YYYY-MM-DD)
// ใช้คำนวณค่าจ้าง (นับจำนวน) และให้ frontend จัดกลุ่มรายเดือนได้ด้วยเกณฑ์เดียวกันทั้งระบบ
//
// นิยาม "สอนจริง" = คาบสอน (WorkSchedule) ที่มีรอบเช็คชื่อ (AttendanceSession) ของ
// package เดียวกันในวันเดียวกัน รอบนั้น "ปิดแล้ว" (status = closed)
// และโค้ชคนนั้น "ไม่ได้ถูกมาร์คว่าขาดงาน" ในรอบนั้น
// การปิดรอบเช็คชื่อคือหลักฐานว่าคาบนั้นเกิดขึ้นจริง (ไม่ใช่แค่มีตารางในอดีต)
//
// ผลที่ได้:
//   - คาบที่ถูกยกเลิก (ลบตารางทิ้ง = soft delete) ไม่ถูกนับอยู่แล้ว
//   - คาบในอดีตที่ไม่เคยเปิด/ปิดรอบเช็คชื่อ (โค้ชไม่มา/ไม่ได้สอน) ก็ไม่ถูกนับ
//   - คาบที่โค้ชถูกมาร์ค absent ไม่ถูกนับ
//
// ─── เงื่อนไข "ไม่ขาดงาน" ใช้เกณฑ์แบบผ่อนปรน ───
//
// ตัดออกเฉพาะเมื่อ "มีแถว coach_attendances ที่บอกว่า absent ชัดเจน" เท่านั้น
// ไม่ใช่ "ต้องมีแถว present ถึงจะได้เงิน" — สองแบบนี้ต่างกันตรงแถวที่หายไป
//
// เลือกแบบผ่อนปรนเพราะ:
//
//  1. สำหรับข้อมูลใหม่ ให้ผลเหมือนแบบเข้มงวดทุกประการอยู่แล้ว เนื่องจาก
//     markCoachAbsentees สร้างแถว absent ให้โค้ชทุกคนที่มีตารางแต่ไม่ได้สแกน
//     ตอนปิดรอบ และจับคู่ด้วยคีย์ชุดเดียวกับ query นี้ (package_id + date)
//     หลังปิดรอบจึงไม่มีคาบไหนที่ "ไม่มีแถว" หลงเหลือ
//
//  2. แต่กับข้อมูลเก่าที่ปิดรอบไปก่อนระบบเช็คชื่อโค้ชจะมีผลบังคับ ยังไม่มีแถวเลย
//     ถ้าใช้เกณฑ์เข้มงวด คาบเหล่านั้นจะกลายเป็นศูนย์ยกแผง แล้วยอดค่าจ้าง
//     ย้อนหลังทั้งระบบจะเปลี่ยนทันทีที่ deploy โดยไม่มีใครตั้งใจ
//
// สรุปคือ "ไม่มีข้อมูล" ไม่ได้แปลว่า "ขาดงาน" — ต้องมีคนหรือระบบมาร์คไว้จริงเท่านั้น
//
// ⚠️ ถ้าโค้ชมาสอนจริงแต่ลืมสแกน ระบบจะมาร์ค absent ให้ตอนปิดรอบและโค้ชจะไม่ได้เงิน
// ทางแก้คือให้แอดมินแก้สถานะย้อนหลังผ่าน UpdateCoachAttendanceStatus
// (หน้ารอบที่เปิดอยู่ และหน้าประวัติเช็คชื่อ ทั้งสองหน้ามีปุ่มแก้ให้แล้ว)
//
// Fallback สำหรับคาบแบบเก่า (package_id = NULL) ที่จับคู่ attendance ไม่ได้:
// ใช้เกณฑ์เดิม = คาบที่วันสอนผ่านไปแล้ว (date < วันนี้) และยังไม่ถูกลบ
// เพื่อให้คาบเก่าที่สอนไปจริงยังได้ค่าจ้าง (สองเงื่อนไขไม่ทับกัน: NOT NULL vs NULL)
func (s *workScheduleService) TaughtSessionDates(coachID uint, userID uint, role string) ([]string, error) {
	if err := VerifyCoachOwnership(s.db, coachID, userID, role); err != nil {
		return nil, err
	}
	return s.taughtSessionDates(coachID)
}

// taughtScheduleScope จำกัดผลลัพธ์ให้เหลือเฉพาะคาบที่ "นับว่าสอนจริง" ของโค้ชคนหนึ่ง
// (เฉพาะคาบใหม่ที่มี package_id — คาบเก่าใช้เกณฑ์อื่น ดู taughtSessionDates)
//
// แยกออกมาเป็นฟังก์ชันของตัวเองด้วยสองเหตุผล:
//
//  1. นี่คือกติกาที่ตัดสินว่าโค้ชได้เงินกี่คาบ ควรมีที่มาที่เดียวและมีชื่อเรียก
//     ไม่ใช่เงื่อนไขที่ฝังอยู่กลาง query จนคนอ่านไม่ทันสังเกตว่าแตะเงิน
//
//  2. เทสยิงเข้ามาที่นี่ได้ตรง ๆ โดยไม่ต้องผ่าน to_char ซึ่งเป็นฟังก์ชันเฉพาะของ
//     postgres (sqlite ที่ใช้ในเทสไม่มี) ส่วน to_char เป็นแค่การจัดรูปแบบวันที่
//     ไม่ใช่ตรรกะที่ต้องเทส
//
// ใช้ NOT EXISTS แทน LEFT JOIN แล้วเช็ค NULL โดยตั้งใจ — LEFT JOIN ทำให้จำนวนแถว
// ผลลัพธ์ขึ้นกับตารางที่ join เข้ามา ซึ่งเสี่ยงไปกระทบการนับคาบ (= จำนวนเงิน)
// ส่วน NOT EXISTS เป็นแค่ตัวกรอง ไม่เพิ่มไม่ลดแถว
func taughtScheduleScope(db *gorm.DB, coachID uint) *gorm.DB {
	return db.Model(&models.WorkSchedule{}).
		Joins("JOIN attendance_sessions a ON a.package_id = work_schedules.package_id AND a.session_date = work_schedules.date AND a.deleted_at IS NULL").
		Where("work_schedules.coach_id = ? AND work_schedules.package_id IS NOT NULL AND a.status = ?",
			coachID, models.AttendanceSessionClosed).
		Where(`NOT EXISTS (
			SELECT 1 FROM coach_attendances ca
			WHERE ca.coach_id = work_schedules.coach_id
			  AND ca.attendance_session_id = a.id
			  AND ca.status = ?
			  AND ca.deleted_at IS NULL
		)`, models.AttendanceStatusAbsent)
}

// taughtSessionDates เป็น query จริง (ไม่เช็คสิทธิ์) — ให้ public method ข้างบนเรียกหลังตรวจสิทธิ์แล้ว
// คืนวันที่แบบ YYYY-MM-DD ผ่าน to_char เพื่อกัน format วันที่เพี้ยนจากชนิด time.Time ของ driver
func (s *workScheduleService) taughtSessionDates(coachID uint) ([]string, error) {
	// คาบใหม่ (มี package_id): เอาเฉพาะที่มีรอบเช็คชื่อปิดแล้วจริง และโค้ชไม่ได้ถูกมาร์คว่าขาด
	var attended []string
	if err := taughtScheduleScope(s.db, coachID).
		Pluck("to_char(work_schedules.date, 'YYYY-MM-DD')", &attended).Error; err != nil {
		return nil, err
	}

	// คาบเก่า (package_id = NULL): ใช้วันที่ท้องถิ่นไทยเป็นเส้นแบ่ง "อดีต"
	loc, err := time.LoadLocation("Asia/Bangkok")
	if err != nil {
		loc = time.Local
	}
	todayStr := time.Now().In(loc).Format("2006-01-02")

	var legacy []string
	if err := s.db.Model(&models.WorkSchedule{}).
		Where("coach_id = ? AND package_id IS NULL AND date < ?", coachID, todayStr).
		Pluck("to_char(date, 'YYYY-MM-DD')", &legacy).Error; err != nil {
		return nil, err
	}

	return append(attended, legacy...), nil
}

// GetByID ดึงตารางงาน 1 รายการ
func (s *workScheduleService) GetByID(id uint) (*models.WorkSchedule, error) {
	var schedule models.WorkSchedule
	err := s.db.Preload("Coach").Preload("Course").First(&schedule, id).Error
	if err != nil {
		return nil, err
	}
	return &schedule, nil
}

// Update แก้ไขตารางงานที่มีอยู่ (เช่น admin เลื่อนเวลา หรือเปลี่ยน court)
// ตรวจ availability/เวลาชน/สนามซ้อน ด้วยกฎเดียวกับตอน assign (ยกเว้น record ตัวเอง) ในทรานแซกชันเดียว
func (s *workScheduleService) Update(id uint, req dto.CreateWorkScheduleRequest) (*models.WorkSchedule, error) {
	var schedule models.WorkSchedule

	err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.First(&schedule, id).Error; err != nil {
			return err
		}

		if err := s.validateScheduleSlot(tx, req, id); err != nil {
			return err
		}

		// ไม่มี is_emergency โดยตั้งใจ — เป็นบันทึกว่าคาบนี้เคยถูกมอบหมายนอกกฎ
		// การเติมสนามทีหลังไม่ได้ลบข้อเท็จจริงนั้นทิ้ง
		updateData := map[string]interface{}{
			"date":         req.Date,
			"start_time":   req.StartTime,
			"end_time":     req.EndTime,
			"court_number": req.CourtNumber,
			"description":  req.Description,
			"coach_id":     req.CoachID,
			"course_id":    req.CourseID,
		}

		if err := tx.Model(&schedule).Updates(updateData).Error; err != nil {
			return err
		}

		return tx.First(&schedule, id).Error
	})

	if err != nil {
		return nil, err
	}
	return &schedule, nil
}

// Delete ลบตารางงาน (เช่น admin ยกเลิกคาบสอน)
func (s *workScheduleService) Delete(id uint) error {
	var schedule models.WorkSchedule
	if err := s.db.First(&schedule, id).Error; err != nil {
		return err
	}
	return s.db.Delete(&schedule).Error
}

// GetWeekSessions คืนคาบเรียนของทุก package ในสัปดาห์ที่เลือก (session-centric)
// แสดงเฉพาะ package ที่มี enrollment สถานะ active และช่วงสิทธิ์เรียนคลุมสัปดาห์นั้น
// พร้อมรายชื่อโค้ชที่ถูก assign ให้แต่ละคาบไปแล้ว (ถ้ามี)
func (s *workScheduleService) GetWeekSessions(weekStart string) ([]dto.WeekSessionResponse, error) {
	start, err := time.Parse("2006-01-02", weekStart)
	if err != nil {
		return nil, fmt.Errorf("%w: week_start ต้องเป็น YYYY-MM-DD", ErrScheduleInvalid)
	}
	start = time.Date(start.Year(), start.Month(), start.Day(), 0, 0, 0, 0, time.UTC)
	weekEnd := start.AddDate(0, 0, 7).Add(-time.Second) // ถึงสิ้นวันเสาร์

	// 1) enrollment ที่ active และช่วงสิทธิ์คลุมสัปดาห์นี้
	var enrollments []models.Enrollment
	if err := s.db.
		Where("status = ? AND started_at IS NOT NULL AND started_at <= ? AND (expires_at IS NULL OR expires_at >= ?)",
			models.EnrollmentStatusActive, weekEnd, start).
		Find(&enrollments).Error; err != nil {
		return nil, err
	}
	if len(enrollments) == 0 {
		return []dto.WeekSessionResponse{}, nil
	}

	pkgIDSet := make(map[uint]bool)
	for _, e := range enrollments {
		pkgIDSet[e.PackageID] = true
	}
	pkgIDs := make([]uint, 0, len(pkgIDSet))
	for id := range pkgIDSet {
		pkgIDs = append(pkgIDs, id)
	}

	// 2) โหลด package พร้อมตารางเรียนและคอร์ส
	var packages []models.Package
	if err := s.db.Preload("Schedules").Preload("Course").Where("id IN ?", pkgIDs).Find(&packages).Error; err != nil {
		return nil, err
	}

	// 2.1) เตรียมนับจำนวนนักเรียน: จับ enrollment เข้าตาม package
	//      + โหลด "ยืนยันมาเรียน" (ClassConfirmation going) ของทั้งสัปดาห์ทีเดียว กัน N+1
	enrollmentsByPackage := make(map[uint][]*models.Enrollment)
	enrollmentIDs := make([]uint, 0, len(enrollments))
	for i := range enrollments {
		e := &enrollments[i]
		enrollmentsByPackage[e.PackageID] = append(enrollmentsByPackage[e.PackageID], e)
		enrollmentIDs = append(enrollmentIDs, e.ID)
	}

	goingSet := make(map[confirmKey]bool)
	if len(enrollmentIDs) > 0 {
		var confs []models.ClassConfirmation
		if err := s.db.
			Where("enrollment_id IN ? AND status = ? AND class_date >= ? AND class_date <= ?",
				enrollmentIDs, models.ClassConfirmationGoing, start, weekEnd).
			Find(&confs).Error; err != nil {
			return nil, err
		}
		for _, c := range confs {
			goingSet[keyOf(c.EnrollmentID, sessionDateValue(c.ClassDate))] = true
		}
	}

	// 3) รวมคาบเป็น "คลาส" ตาม course + วันที่ + เวลาเริ่ม-จบ
	//    package เป็นแค่โควตาจำนวนครั้งที่นักเรียนมาเรียนได้ ไม่ใช่ตัวแยกคลาส
	//    ดังนั้นหลาย package ของคอร์สเดียวกันที่เรียนวัน-เวลาเดียวกัน = คลาสเดียว การ์ดเดียว
	type classKey struct {
		courseID uint
		date     string
		start    string
		end      string
	}
	classMap := make(map[classKey]*dto.WeekSessionResponse)

	for _, pkg := range packages {
		courseName := ""
		courseID := pkg.CourseID
		if pkg.Course != nil {
			courseName = pkg.Course.CourseName
			courseID = pkg.Course.ID
		}

		for _, sch := range pkg.Schedules {
			off, ok := weekdayOffset[string(sch.DayOfWeek)]
			if !ok {
				continue
			}
			classDate := sessionDateValue(start.AddDate(0, 0, off))
			dateStr := classDate.Format("2006-01-02")
			key := classKey{courseID: courseID, date: dateStr, start: sch.StartTime, end: sch.EndTime}
			entry, exists := classMap[key]
			if !exists {
				entry = &dto.WeekSessionResponse{
					PackageID:         pkg.ID, // แค่ตัวแทน (มีหลาย package ในคลาสเดียว)
					PackageScheduleID: sch.ID, // แค่ตัวแทน
					CourseID:          courseID,
					CourseName:        courseName,
					Date:              dateStr,
					DayOfWeek:         string(sch.DayOfWeek),
					StartTime:         sch.StartTime,
					EndTime:           sch.EndTime,
				}
				classMap[key] = entry
			}

			// นับนักเรียนของ package นี้เข้า "คลาส" — หลาย package ของคอร์ส/เวลาเดียวกัน
			// ใช้คีย์เดียวกัน ยอดจึงบวกรวมข้าม package ให้อัตโนมัติตามที่ต้องการ
			for _, e := range enrollmentsByPackage[pkg.ID] {
				if !canAttend(e, classDate) {
					continue
				}
				entry.TotalCount++
				if goingSet[keyOf(e.ID, classDate)] {
					entry.GoingCount++
				}
			}
		}
	}

	// 4) ดึงโค้ชที่ถูก assign ให้แต่ละคลาส (match ด้วย course + วันที่ + เวลา ไม่ใช่ package_schedule_id)
	sessions := make([]dto.WeekSessionResponse, 0, len(classMap))
	for _, sess := range classMap {
		var ws []models.WorkSchedule
		if err := s.db.Preload("Coach.User").
			Where("course_id = ? AND date = ? AND start_time = ? AND end_time = ?", sess.CourseID, sess.Date, sess.StartTime, sess.EndTime).
			Find(&ws).Error; err != nil {
			return nil, err
		}
		coaches := make([]dto.WeekSessionCoach, 0, len(ws))
		seen := make(map[uint]bool) // กันโค้ชซ้ำ (เผื่อข้อมูลเก่าที่ assign ต่อ package)
		for _, w := range ws {
			if seen[w.CoachID] {
				continue
			}
			seen[w.CoachID] = true
			name := ""
			if w.Coach != nil {
				name = w.Coach.Nickname
				if name == "" && w.Coach.User != nil {
					name = w.Coach.User.FirstName + " " + w.Coach.User.LastName
				}
			}
			coaches = append(coaches, dto.WeekSessionCoach{
				WorkScheduleID: w.ID,
				CoachID:        w.CoachID,
				CoachName:      name,
				CourtNumber:    w.Courtnumber,
				IsEmergency:    w.IsEmergency,
			})
		}
		sess.AssignedCoaches = coaches
		sessions = append(sessions, *sess)
	}

	sort.Slice(sessions, func(i, j int) bool {
		if sessions[i].Date != sessions[j].Date {
			return sessions[i].Date < sessions[j].Date
		}
		if sessions[i].StartTime != sessions[j].StartTime {
			return sessions[i].StartTime < sessions[j].StartTime
		}
		return sessions[i].CourseName < sessions[j].CourseName
	})

	return sessions, nil
}

// timeToMinutesWS แปลงเวลา "HH:MM" เป็นนาทีนับจากเที่ยงคืน
// หมายเหตุ: ตั้งชื่อแยกจาก timeToMinutes ใน coach_filter_service.go เพื่อไม่ให้ชนกัน (ทั้งคู่อยู่ package services เดียวกัน)
// แนะนำในระยะยาวให้รวมเป็นฟังก์ชันเดียวใน package utils แทน
func timeToMinutesWS(t string) (int, error) {
	var h, m int
	n, err := fmt.Sscanf(t, "%d:%d", &h, &m)
	if err != nil || n != 2 {
		return 0, fmt.Errorf("invalid time format, expected HH:MM, got %q", t)
	}
	if h < 0 || h > 23 || m < 0 || m > 59 {
		return 0, fmt.Errorf("time out of range: %q", t)
	}
	return h*60 + m, nil
}