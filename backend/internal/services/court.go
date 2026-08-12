package services

import (
	"errors"
	"strings"

	"CPE-691015/internal/models"

	"gorm.io/gorm"
)

var ErrCourtNameRequired = errors.New("ต้องระบุชื่อสนาม")

type CourtService struct {
	db *gorm.DB
}

func NewCourtService(db *gorm.DB) *CourtService {
	return &CourtService{db: db}
}

// GetAll คืนรายการสนามทั้งหมด (เรียงตาม id)
func (s *CourtService) GetAll() ([]models.Court, error) {
	var courts []models.Court
	err := s.db.Order("id asc").Find(&courts).Error
	return courts, err
}

// Create เพิ่มสนามใหม่
func (s *CourtService) Create(name string) (*models.Court, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, ErrCourtNameRequired
	}
	court := models.Court{Name: name, IsActive: true}
	if err := s.db.Create(&court).Error; err != nil {
		return nil, err
	}
	return &court, nil
}

// Update แก้ชื่อ/สถานะสนาม (ส่งเฉพาะ field ที่ต้องการแก้)
func (s *CourtService) Update(id uint, name *string, isActive *bool) (*models.Court, error) {
	var court models.Court
	if err := s.db.First(&court, id).Error; err != nil {
		return nil, err
	}

	updateData := make(map[string]interface{})
	if name != nil {
		trimmed := strings.TrimSpace(*name)
		if trimmed == "" {
			return nil, ErrCourtNameRequired
		}
		updateData["name"] = trimmed
	}
	if isActive != nil {
		updateData["is_active"] = *isActive
	}

	if len(updateData) > 0 {
		if err := s.db.Model(&court).Updates(updateData).Error; err != nil {
			return nil, err
		}
	}
	if err := s.db.First(&court, id).Error; err != nil {
		return nil, err
	}
	return &court, nil
}

// Delete ลบสนาม (คาบที่ถูก assign ไปแล้วยังเก็บชื่อสนามเป็น string ไว้ ไม่กระทบ)
func (s *CourtService) Delete(id uint) error {
	return s.db.Delete(&models.Court{}, id).Error
}
