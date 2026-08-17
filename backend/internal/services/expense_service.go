package services

import (
	"errors"
	"fmt"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
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

	// แจ้งโค้ชเมื่อแอดมินบันทึกค่าจ้าง/รายได้ให้ (expense.Coach.UserID = users.id)
	if expense.CoachID != nil && expense.Coach != nil && expense.Coach.UserID != 0 {
		label := "ค่าใช้จ่าย"
		switch expense.Type {
		case models.ExpenseTypeCoach:
			label = "ค่าจ้างการสอน"
		case models.ExpenseTypeCoachOther:
			label = "รายได้อื่น / โบนัส"
		}
		CreateNotification(s.db, expense.Coach.UserID,
			"coach_expense",
			fmt.Sprintf("expense-%d", expense.ID),
			"มีการบันทึกรายได้ให้คุณ",
			fmt.Sprintf("%s ยอด ฿%.2f", label, expense.Amount),
			"/coach/payment",
			"success",
		)
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

// GetByCoachID ดึงประวัติค่าจ้างของ coach คนเดียว ใช้กับหน้า "การเงิน" ที่โค้ชดูรายได้ตัวเอง
// coach ดูได้เฉพาะของตัวเอง, admin ดูได้ทุกคน (กัน IDOR เหมือน endpoint อื่นของ coach)
func (s *ExpenseService) GetByCoachID(coachID uint, userID uint, role string) ([]models.Expense, error) {
	if err := VerifyCoachOwnership(s.db, coachID, userID, role); err != nil {
		return nil, err
	}

	var expenses []models.Expense
	if err := s.db.Where("coach_id = ?", coachID).Preload("Coach").Preload("Coach.User").Order("date DESC, id DESC").Find(&expenses).Error; err != nil {
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
