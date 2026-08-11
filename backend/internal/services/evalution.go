package services

import (
	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
	"errors"
	"gorm.io/gorm"
)

type EvaluationService struct {
	db *gorm.DB
}

func NewEvaluationService(db *gorm.DB) *EvaluationService {
	return &EvaluationService{db: db}
}

// CreateEvaluation บันทึกการประเมินนักเรียนโดยโค้ช
func (s *EvaluationService) CreateEvaluation(coachUserID uint, req dto.CreateEvaluationRequest) (*models.Evaluation, error) {
	// 1. ตรวจสอบว่าโค้ชมีจริงหรือไม่
	var coach models.Coach
	if err := s.db.Where("user_id = ?", coachUserID).First(&coach).Error; err != nil {
		return nil, errors.New("ไม่พบข้อมูลโค้ชผู้ทำการประเมิน")
	}

	// 2. ตรวจสอบว่านักเรียน (Customer) มีจริงหรือไม่
	var customer models.Customer
	if err := s.db.First(&customer, req.CustomerID).Error; err != nil {
		return nil, errors.New("ไม่พบข้อมูลนักเรียนที่ต้องการประเมิน")
	}

	evaluation := models.Evaluation{
		CustomerID: req.CustomerID,
		CoachID:    coach.ID,
		Assessment: req.Assessment,
		Score:      req.Score,
		VideoURL:   req.VideoURL,
	}

	if err := s.db.Create(&evaluation).Error; err != nil {
		return nil, errors.New("ไม่สามารถบันทึกข้อมูลการประเมินได้")
	}

	// Preload ความสัมพันธ์
	if err := s.db.Preload("Customer").Preload("Customer.User").Preload("Coach").Preload("Coach.User").First(&evaluation, evaluation.ID).Error; err != nil {
		return nil, err
	}

	return &evaluation, nil
}

// GetEvaluationsByStudentID ดึงข้อมูลการประเมินของนักเรียนคนนั้นๆ (CustomerID)
func (s *EvaluationService) GetEvaluationsByStudentID(customerID uint) ([]models.Evaluation, error) {
	var evaluations []models.Evaluation
	if err := s.db.Where("customer_id = ?", customerID).
		Preload("Coach").
		Preload("Coach.User").
		Order("created_at DESC").
		Find(&evaluations).Error; err != nil {
		return nil, errors.New("ไม่สามารถดึงข้อมูลการประเมินได้")
	}
	return evaluations, nil
}

// GetEvaluationsByCoachUserID ดึงข้อมูลการประเมินทั้งหมดที่โค้ชคนนี้เป็นคนทำ
func (s *EvaluationService) GetEvaluationsByCoachUserID(coachUserID uint) ([]models.Evaluation, error) {
	var coach models.Coach
	if err := s.db.Where("user_id = ?", coachUserID).First(&coach).Error; err != nil {
		return nil, errors.New("ไม่พบข้อมูลโค้ช")
	}

	var evaluations []models.Evaluation
	if err := s.db.Where("coach_id = ?", coach.ID).
		Preload("Customer").
		Preload("Customer.User").
		Order("created_at DESC").
		Find(&evaluations).Error; err != nil {
		return nil, errors.New("ไม่สามารถดึงข้อมูลการประเมินได้")
	}
	return evaluations, nil
}

// DeleteEvaluation ลบข้อมูลการประเมิน
func (s *EvaluationService) DeleteEvaluation(id uint) error {
	var evaluation models.Evaluation
	if err := s.db.First(&evaluation, id).Error; err != nil {
		return errors.New("ไม่พบข้อมูลการประเมินที่ต้องการลบ")
	}

	if err := s.db.Delete(&evaluation).Error; err != nil {
		return errors.New("ไม่สามารถลบข้อมูลการประเมินได้")
	}

	return nil
}
