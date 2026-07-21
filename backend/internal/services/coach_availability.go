package services

import (
	"errors"
	"fmt"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"

	"gorm.io/gorm"
)

// ErrInvalidAvailability ใช้เมื่อชุดเวลาว่างที่ส่งมาไม่ผ่าน validation
// controller ควรแมป error นี้เป็น HTTP 400 (client ส่งข้อมูลผิด ไม่ใช่ระบบพัง)
var ErrInvalidAvailability = errors.New("ข้อมูลเวลาว่างไม่ถูกต้อง")

// isValidDayOfWeek ตรวจว่า day เป็น 1 ใน Monday..Sunday (ตรงกับค่าที่ AssignWorkSchedule ใช้เทียบ)
func isValidDayOfWeek(day string) bool {
	switch models.DayOfWeek(day) {
	case models.Monday, models.Tuesday, models.Wednesday, models.Thursday,
		models.Friday, models.Saturday, models.Sunday:
		return true
	default:
		return false
	}
}

// validateAvailabilities ตรวจความถูกต้องของชุดเวลาว่างก่อนบันทึก:
//   - DayOfWeek ต้องเป็น Monday..Sunday (กันปัญหา match ไม่เจอตอน assign งาน)
//   - เวลาเป็นรูปแบบ HH:MM และ StartTime ต้องน้อยกว่า EndTime
//   - ช่วงเวลาในวันเดียวกันต้องไม่ซ้อนทับกันเอง
func validateAvailabilities(items []dto.AvailabilityDetail) error {
	type slot struct{ start, end int }
	perDay := make(map[string][]slot)

	for i, a := range items {
		if !isValidDayOfWeek(a.DayOfWeek) {
			return fmt.Errorf("%w: รายการที่ %d day_of_week ไม่ถูกต้อง (%q) ต้องเป็น Monday ถึง Sunday", ErrInvalidAvailability, i+1, a.DayOfWeek)
		}

		start, err := timeToMinutesWS(a.StartTime)
		if err != nil {
			return fmt.Errorf("%w: รายการที่ %d start_time %v", ErrInvalidAvailability, i+1, err)
		}
		end, err := timeToMinutesWS(a.EndTime)
		if err != nil {
			return fmt.Errorf("%w: รายการที่ %d end_time %v", ErrInvalidAvailability, i+1, err)
		}
		if start >= end {
			return fmt.Errorf("%w: รายการที่ %d start_time ต้องน้อยกว่า end_time (%s-%s)", ErrInvalidAvailability, i+1, a.StartTime, a.EndTime)
		}

		// เช็คซ้อนทับกับช่วงอื่นในวันเดียวกัน (ซ้อนกันเมื่อ start < end อีกช่วง และ start อีกช่วง < end)
		for _, prev := range perDay[a.DayOfWeek] {
			if start < prev.end && prev.start < end {
				return fmt.Errorf("%w: ช่วงเวลาในวัน %s ซ้อนทับกันเอง", ErrInvalidAvailability, a.DayOfWeek)
			}
		}
		perDay[a.DayOfWeek] = append(perDay[a.DayOfWeek], slot{start: start, end: end})
	}
	return nil
}

type CoachAvailabilityService struct {
	db *gorm.DB
}

// NewCoachAvailabilityService creates a new instance of CoachAvailabilityService
func NewCoachAvailabilityService(db *gorm.DB) *CoachAvailabilityService {
	return &CoachAvailabilityService{db: db}
}

// GetByCoachID ดึงตารางเวลาว่างทั้งหมดของ coach คนหนึ่ง (ใช้แสดงหน้า "ตารางเวลาว่าง" ของ coach)
// coach ดูได้เฉพาะของตัวเอง, admin ดูได้ทุกคน
func (s *CoachAvailabilityService) GetByCoachID(coachID uint, userID uint, role string) ([]models.CoachAvailability, error) {
	if err := VerifyCoachOwnership(s.db, coachID, userID, role); err != nil {
		return nil, err
	}

	var availabilities []models.CoachAvailability
	err := s.db.Where("coach_id = ?", coachID).Find(&availabilities).Error
	return availabilities, err
}

// UpdateAvailability แทนที่ตารางเวลาว่างทั้งหมดของ coach ด้วยชุดใหม่ที่ส่งมา
// (ตาม flow ที่อธิบายไว้: "โค้ชกดยืนยันตารางเวลาว่างทั้งหมดเข้ามา" ทีเดียว ไม่ใช่ทีละช่วง
// จึงลบของเก่าทิ้งแล้วสร้างใหม่ทั้งหมดใน transaction เดียว ป้องกันข้อมูลค้างถ้าทำแค่ครึ่งเดียว)
func (s *CoachAvailabilityService) UpdateAvailability(coachID uint, userID uint, role string, req dto.UpdateCoachAvailabilityRequest) ([]models.CoachAvailability, error) {
	// กัน IDOR + business rule: วันเวลาว่างเป็นของโค้ชเจ้าของเท่านั้น
	// coach คนอื่นแก้ไม่ได้ และ admin ก็แก้ไม่ได้ (VerifyCoachSelf จะปฏิเสธ admin ด้วย)
	if err := VerifyCoachSelf(s.db, coachID, userID, role); err != nil {
		return nil, err
	}

	// ตรวจความถูกต้องของเวลา/วันก่อนแตะ DB (กันข้อมูลขยะที่ทำให้ assign งานพลาด)
	if err := validateAvailabilities(req.Availabilities); err != nil {
		return nil, err
	}

	var result []models.CoachAvailability

	err := s.db.Transaction(func(tx *gorm.DB) error {
		// 1. ลบเวลาว่างเดิมของ coach คนนี้ทั้งหมด
		if err := tx.Where("coach_id = ?", coachID).Delete(&models.CoachAvailability{}).Error; err != nil {
			return err
		}

		// 2. สร้างชุดใหม่ตามที่ส่งมา
		newAvailabilities := make([]models.CoachAvailability, 0, len(req.Availabilities))
		for _, a := range req.Availabilities {
			newAvailabilities = append(newAvailabilities, models.CoachAvailability{
				CoachID:   coachID,
				DayOfWeek: models.DayOfWeek(a.DayOfWeek), // แปลง string -> custom type DayOfWeek
				StartTime: a.StartTime,
				EndTime:   a.EndTime,
			})
		}

		if len(newAvailabilities) > 0 {
			if err := tx.Create(&newAvailabilities).Error; err != nil {
				return err
			}
		}

		result = newAvailabilities
		return nil
	})

	if err != nil {
		return nil, err
	}
	return result, nil
}

// DeleteAll ลบเวลาว่างทั้งหมดของ coach (เผื่อใช้กรณี coach อยากล้างตารางแล้วเริ่มใหม่)
func (s *CoachAvailabilityService) DeleteAll(coachID uint) error {
	return s.db.Where("coach_id = ?", coachID).Delete(&models.CoachAvailability{}).Error
}