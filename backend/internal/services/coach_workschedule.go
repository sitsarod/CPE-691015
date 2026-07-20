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
	GetByCoachID(coachID uint) ([]models.WorkSchedule, error)
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

// AssignWorkSchedule สร้างตารางงานใหม่ให้ coach หลังเช็คว่าเวลาที่จะ assign อยู่ในช่วงที่ coach ว่างจริง
func (s *workScheduleService) AssignWorkSchedule(req dto.CreateWorkScheduleRequest) (*models.WorkSchedule, error) {
	// 1. แปลงวันที่ที่ส่งมา (YYYY-MM-DD) เพื่อหาว่าเป็นวันไหนของสัปดาห์ (เช่น Monday, Tuesday)
	parsedDate, err := time.Parse("2006-01-02", req.Date)
	if err != nil {
		return nil, errors.New("invalid date format, use YYYY-MM-DD")
	}
	dayOfWeekStr := parsedDate.Weekday().String() // ได้ผลลัพธ์เป็น "Monday", "Tuesday", ...

	// 2. ไปดึงข้อมูลเวลาว่างของโค้ชคนนี้ในวันนั้นๆ จาก Database
	var availabilities []models.CoachAvailability
	err = s.db.Where("coach_id = ? AND day_of_week = ?", req.CoachID, dayOfWeekStr).Find(&availabilities).Error
	if err != nil {
		return nil, err
	}

	if len(availabilities) == 0 {
		return nil, fmt.Errorf("coach is not available on %s", dayOfWeekStr)
	}

	// 3. ลอจิกเปรียบเทียบเวลา
	reqStartMin, err := timeToMinutesWS(req.StartTime)
	if err != nil {
		return nil, err
	}
	reqEndMin, err := timeToMinutesWS(req.EndTime)
	if err != nil {
		return nil, err
	}

	isAvailable := false
	for _, avail := range availabilities {
		availStartMin, err := timeToMinutesWS(avail.StartTime)
		if err != nil {
			continue
		}
		availEndMin, err := timeToMinutesWS(avail.EndTime)
		if err != nil {
			continue
		}

		if reqStartMin >= availStartMin && reqEndMin <= availEndMin {
			isAvailable = true
			break
		}
	}

	if !isAvailable {
		return nil, errors.New("the assigned time sits outside of the coach's available hours")
	}

	// 4. เช็คว่าเวลานี้ชนกับงานอื่นที่ coach คนนี้มีอยู่แล้วในวันเดียวกันหรือไม่ (กันสอนซ้อนกัน)
	var conflicting []models.WorkSchedule
	err = s.db.Where("coach_id = ? AND date = ?", req.CoachID, req.Date).Find(&conflicting).Error
	if err != nil {
		return nil, err
	}
	for _, w := range conflicting {
		existStart, _ := timeToMinutesWS(w.StartTime)
		existEnd, _ := timeToMinutesWS(w.EndTime)
		// ชนกันถ้าช่วงเวลาซ้อนทับกันแม้บางส่วน
		if reqStartMin < existEnd && reqEndMin > existStart {
			return nil, errors.New("coach already has a work schedule that overlaps this time")
		}
	}

	// 5. บันทึกตารางงานลง Database
	work := models.WorkSchedule{
		Date:        req.Date,
		StartTime:   req.StartTime,
		EndTime:     req.EndTime,
		Description: req.Description,
		Courtnumber: req.CourtNumber,
		CoachID:     req.CoachID,
		CourseID:    req.CourseID,
	}

	if err := s.db.Create(&work).Error; err != nil {
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
func (s *workScheduleService) GetByCoachID(coachID uint) ([]models.WorkSchedule, error) {
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
func (s *workScheduleService) Update(id uint, req dto.CreateWorkScheduleRequest) (*models.WorkSchedule, error) {
	var schedule models.WorkSchedule
	if err := s.db.First(&schedule, id).Error; err != nil {
		return nil, err
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

	if err := s.db.Model(&schedule).Updates(updateData).Error; err != nil {
		return nil, err
	}

	if err := s.db.First(&schedule, id).Error; err != nil {
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