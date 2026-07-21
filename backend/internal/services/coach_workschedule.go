package services

import (
	"errors"
	"fmt"
	"time"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"

	"gorm.io/gorm"
)

type WorkScheduleService interface {
	AssignWorkSchedule(req dto.CreateWorkScheduleRequest) (*models.WorkSchedule, error)
	GetAll() ([]models.WorkSchedule, error)
	GetByCoachID(coachID uint, userID uint, role string) ([]models.WorkSchedule, error)
	GetByID(id uint) (*models.WorkSchedule, error)
	Update(id uint, req dto.CreateWorkScheduleRequest) (*models.WorkSchedule, error)
	Delete(id uint) error
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

	// 1) ต้องอยู่ในช่วงเวลาว่างของโค้ชในวันนั้น
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

	// 3) สนามเดียวกันในวันเดียวกันต้องไม่ถูกใช้โดยคาบอื่น (กันจองสนามซ้อน)
	var courtJobs []models.WorkSchedule
	if err := tx.Where("court_number = ? AND date = ? AND id <> ?", req.CourtNumber, req.Date, excludeID).Find(&courtJobs).Error; err != nil {
		return err
	}
	for _, w := range courtJobs {
		ws, _ := timeToMinutesWS(w.StartTime)
		we, _ := timeToMinutesWS(w.EndTime)
		if reqStart < we && ws < reqEnd {
			return fmt.Errorf("%w: สนาม %s ถูกใช้งานในช่วงเวลานี้แล้ว", ErrScheduleConflict, req.CourtNumber)
		}
	}

	return nil
}

// AssignWorkSchedule สร้างตารางงานใหม่ให้ coach หลังผ่าน validation ครบ (ทำในทรานแซกชันเดียว)
func (s *workScheduleService) AssignWorkSchedule(req dto.CreateWorkScheduleRequest) (*models.WorkSchedule, error) {
	var work models.WorkSchedule

	err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := s.validateScheduleSlot(tx, req, 0); err != nil {
			return err
		}

		work = models.WorkSchedule{
			Date:        req.Date,
			StartTime:   req.StartTime,
			EndTime:     req.EndTime,
			Description: req.Description,
			Courtnumber: req.CourtNumber,
			CoachID:     req.CoachID,
			CourseID:    req.CourseID,
		}
		return tx.Create(&work).Error
	})

	if err != nil {
		return nil, err
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