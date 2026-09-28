package services

import (
	"errors"
	"fmt"
	"strings"
	"time"

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

// cleanCourtName ตัด/ยุบช่องว่าง แล้วตรวจว่าไม่ว่างและไม่ยาวเกิน
func cleanCourtName(name string) (string, error) {
	name = strings.Join(strings.Fields(name), " ")
	if name == "" {
		return "", ErrCourtNameRequired
	}
	if err := validateCourtNameLength(name); err != nil {
		return "", err
	}
	return name, nil
}

// Create เพิ่มสนามใหม่
func (s *CourtService) Create(name string) (*models.Court, error) {
	name, err := cleanCourtName(name)
	if err != nil {
		return nil, err
	}

	court := models.Court{Name: name, IsActive: true}
	err = s.db.Transaction(func(tx *gorm.DB) error {
		if err := ensureCourtNameUnique(tx, name, 0); err != nil {
			return err
		}
		return tx.Create(&court).Error
	})
	if err != nil {
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
		cleaned, err := cleanCourtName(*name)
		if err != nil {
			return nil, err
		}
		if err := ensureCourtNameUnique(s.db, cleaned, id); err != nil {
			return nil, err
		}
		updateData["name"] = cleaned
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

// Delete ลบสนาม · ห้ามลบถ้ายังมีคาบในอนาคตผูกอยู่ (ให้ปิดใช้งานแทน หรือย้ายคาบก่อน)
// ⚠️ ถ้าปล่อยลบ คาบที่ค้างอยู่ชี้สนามที่ไม่มีแล้ว และสนามชื่อเดิมที่สร้างใหม่จะจองทับได้
func (s *CourtService) Delete(id uint) error {
	today := localDateString(time.Now())

	var future int64
	if err := s.db.Model(&models.WorkSchedule{}).
		Where("court_id = ? AND date >= ?", id, today).
		Count(&future).Error; err != nil {
		return err
	}
	if future > 0 {
		return fmt.Errorf("%w %d คาบ — ปิดใช้งานสนามแทน หรือย้ายคาบไปสนามอื่นก่อน", ErrCourtInUse, future)
	}
	return s.db.Delete(&models.Court{}, id).Error
}
