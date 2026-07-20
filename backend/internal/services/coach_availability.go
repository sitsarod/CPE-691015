package services

import (
	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"

	"gorm.io/gorm"
)

type CoachAvailabilityService struct {
	db *gorm.DB
}

// NewCoachAvailabilityService creates a new instance of CoachAvailabilityService
func NewCoachAvailabilityService(db *gorm.DB) *CoachAvailabilityService {
	return &CoachAvailabilityService{db: db}
}

// GetByCoachID ดึงตารางเวลาว่างทั้งหมดของ coach คนหนึ่ง (ใช้แสดงหน้า "ตารางเวลาว่าง" ของ coach)
func (s *CoachAvailabilityService) GetByCoachID(coachID uint) ([]models.CoachAvailability, error) {
	var availabilities []models.CoachAvailability
	err := s.db.Where("coach_id = ?", coachID).Find(&availabilities).Error
	return availabilities, err
}

// UpdateAvailability แทนที่ตารางเวลาว่างทั้งหมดของ coach ด้วยชุดใหม่ที่ส่งมา
// (ตาม flow ที่อธิบายไว้: "โค้ชกดยืนยันตารางเวลาว่างทั้งหมดเข้ามา" ทีเดียว ไม่ใช่ทีละช่วง
// จึงลบของเก่าทิ้งแล้วสร้างใหม่ทั้งหมดใน transaction เดียว ป้องกันข้อมูลค้างถ้าทำแค่ครึ่งเดียว)
func (s *CoachAvailabilityService) UpdateAvailability(coachID uint, req dto.UpdateCoachAvailabilityRequest) ([]models.CoachAvailability, error) {
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