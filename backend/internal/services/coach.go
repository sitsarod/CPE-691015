package services

import (
	"errors"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"

	"gorm.io/gorm"
)

type CoachService struct {
	db *gorm.DB
}

// NewCoachService creates a new instance of CoachService
func NewCoachService(db *gorm.DB) *CoachService {
	return &CoachService{db: db}
}

// GetAll retrieves all coaches from the database
func (s *CoachService) GetAll() ([]models.Coach, error) {
	var coaches []models.Coach
	err := s.db.Preload("User").Find(&coaches).Error
	return coaches, err
}

// GetByID retrieves a single coach by id
func (s *CoachService) GetByID(id uint) (*models.Coach, error) {
	var coach models.Coach
	err := s.db.Preload("User").First(&coach, id).Error
	if err != nil {
		return nil, err
	}
	return &coach, nil
}

// Create inserts a new coach into the database, สร้างจาก CreateCoachRequest (admin เป็นคนกรอก รวมถึงระดับและค่าจ้างเริ่มต้น)
func (s *CoachService) Create(req dto.CreateCoachRequest) (*models.Coach, error) {
	// เช็คว่า Uid ซ้ำกับ coach ที่มีอยู่แล้วหรือไม่ (เหมือนที่ UserService เช็ค email ซ้ำ)
	var existing models.Coach
	if err := s.db.Where("uid = ?", req.Uid).First(&existing).Error; err == nil {
		return nil, errors.New("uid นี้ถูกใช้งานแล้ว")
	}

	coach := models.Coach{
		UserID:            req.UserID,
		Phone:             req.Phone,
		Uid:               req.Uid,
		Address:           req.Address,
		BirthDate:         req.BirthDate,
		Nickname:          req.Nickname,
		ProfilePicture:    req.ProfilePicture,
		Specialization:    req.Specialization,
		BankAccount:       req.BankAccount,
		PaymentInfo:       req.PaymentInfo,
		PayRatePerSession: req.PayRatePerSession,
	}

	if err := s.db.Create(&coach).Error; err != nil {
		return nil, err
	}
	return &coach, nil
}

// Update แก้ไขข้อมูล coach บางฟิลด์ที่ coach แก้เองได้ (ไม่รวม specialization/pay_rate_per_session
// เพราะ UpdateCoachRequest ไม่มี 2 ฟิลด์นี้แล้ว ต้องแก้ผ่าน AdminUpdate เท่านั้น)
func (s *CoachService) Update(id uint, req dto.UpdateCoachRequest) (*models.Coach, error) {
	var coach models.Coach
	if err := s.db.First(&coach, id).Error; err != nil {
		return nil, err
	}

	updateData := make(map[string]interface{})
	if req.Phone != nil {
		updateData["phone"] = *req.Phone
	}
	if req.Address != nil {
		updateData["address"] = *req.Address
	}
	if req.Nickname != nil {
		updateData["nickname"] = *req.Nickname
	}
	if req.ProfilePicture != nil {
		updateData["profile_picture"] = *req.ProfilePicture
	}
	if req.BankAccount != nil {
		updateData["bank_account"] = *req.BankAccount
	}
	if req.PaymentInfo != nil {
		updateData["payment_info"] = *req.PaymentInfo
	}

	if len(updateData) > 0 {
		if err := s.db.Model(&coach).Updates(updateData).Error; err != nil {
			return nil, err
		}
	}

	if err := s.db.First(&coach, id).Error; err != nil {
		return nil, err
	}
	return &coach, nil
}

// AdminUpdate แก้ไข specialization (ระดับ) และ/หรือ pay_rate_per_session (ค่าจ้างต่อครั้ง)
// เฉพาะ admin เท่านั้นที่ควรเรียกฟังก์ชันนี้ได้ (คุมสิทธิ์ที่ชั้น route ด้วย adminOnly middleware)
func (s *CoachService) AdminUpdate(id uint, req dto.AdminUpdateCoachRequest) (*models.Coach, error) {
	var coach models.Coach
	if err := s.db.First(&coach, id).Error; err != nil {
		return nil, err
	}

	updateData := make(map[string]interface{})
	if req.Specialization != nil {
		updateData["specialization"] = *req.Specialization
	}
	if req.PayRatePerSession != nil {
		if *req.PayRatePerSession < 0 {
			return nil, errors.New("pay_rate_per_session ต้องไม่ติดลบ")
		}
		updateData["pay_rate_per_session"] = *req.PayRatePerSession
	}

	if len(updateData) > 0 {
		if err := s.db.Model(&coach).Updates(updateData).Error; err != nil {
			return nil, err
		}
	}

	if err := s.db.First(&coach, id).Error; err != nil {
		return nil, err
	}
	return &coach, nil
}

// Delete removes a coach from the database (soft delete เพราะ gorm.Model มี DeletedAt)
func (s *CoachService) Delete(id uint) error {
	var coach models.Coach
	if err := s.db.First(&coach, id).Error; err != nil {
		return err
	}
	return s.db.Delete(&coach).Error
}