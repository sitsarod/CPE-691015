package services

import (
	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
	"errors"
	"gorm.io/gorm"
)

type ExpenseService struct {
	db *gorm.DB
}

func NewExpenseService(db *gorm.DB) *ExpenseService {
	return &ExpenseService{db: db}
}

func (s *ExpenseService) CreateExpense(req dto.CreateExpenseRequest) (*models.Expense, error) {
	expense := models.Expense{
		Amount:      req.Amount,
		Type:        req.Type,
		Description: req.Description,
		Date:        req.Date,
		CoachID:     req.CoachID,
		ReceiptURL:  req.ReceiptURL,
	}

	if req.CoachID != nil {
		var coach models.Coach
		if err := s.db.First(&coach, *req.CoachID).Error; err != nil {
			return nil, errors.New("ไม่พบข้อมูลโค้ชที่ระบุ")
		}
	}

	if err := s.db.Create(&expense).Error; err != nil {
		return nil, errors.New("ไม่สามารถบันทึกค่าใช้จ่ายได้")
	}

	// Preload relations
	if err := s.db.Preload("Coach").Preload("Coach.User").First(&expense, expense.ID).Error; err != nil {
		return nil, err
	}

	return &expense, nil
}

func (s *ExpenseService) GetAllExpenses() ([]models.Expense, error) {
	var expenses []models.Expense
	if err := s.db.Preload("Coach").Preload("Coach.User").Order("date DESC, id DESC").Find(&expenses).Error; err != nil {
		return nil, errors.New("ไม่สามารถดึงข้อมูลค่าใช้จ่ายได้")
	}
	return expenses, nil
}

func (s *ExpenseService) DeleteExpense(id uint) error {
	var expense models.Expense
	if err := s.db.First(&expense, id).Error; err != nil {
		return errors.New("ไม่พบข้อมูลค่าใช้จ่าย")
	}

	// Hard delete
	if err := s.db.Unscoped().Delete(&expense).Error; err != nil {
		return errors.New("ไม่สามารถลบข้อมูลค่าใช้จ่ายได้")
	}

	return nil
}
