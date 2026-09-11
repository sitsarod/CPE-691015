package services

import (
	"errors"
	"fmt"
	"time"

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

// CreateExpense บันทึกค่าใช้จ่าย
//
// ⚠️ ค่าใช้จ่ายประเภท coach_wages ถูกตรวจยอดที่นี่ก่อนบันทึกเสมอ
// เดิมรับ Amount มาเท่าไหร่ก็บันทึกลงตารางตรง ๆ ไม่เคยตรวจอะไร — ยิง API ตรง
// (หรือแก้ช่องกรอกใน devtools) ด้วยยอดเท่าไหร่ก็ผ่าน
func (s *ExpenseService) CreateExpense(req dto.CreateExpenseRequest, actorID uint) (*models.Expense, error) {
	expense := models.Expense{
		Amount:      req.Amount,
		Type:        req.Type,
		Description: req.Description,
		Date:        req.Date,
		CoachID:     req.CoachID,
		ReceiptURL:  req.ReceiptURL,
	}
	if actorID != 0 {
		expense.CreatedByID = &actorID
	}

	if req.CoachID != nil {
		var coach models.Coach
		if err := s.db.First(&coach, *req.CoachID).Error; err != nil {
			return nil, errors.New("ไม่พบข้อมูลโค้ชที่ระบุ")
		}
	}

	if err := s.validateCoachWage(req); err != nil {
		return nil, err
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

// validateCoachWage ตรวจว่ายอดค่าจ้างที่ส่งมาไม่เกินที่โค้ชควรได้จริง
//
// ─── ทำไมตรวจเฉพาะ coach_wages ───
//
// coach_other (โบนัส/รายได้อื่น) ไม่ได้ผูกกับจำนวนคาบโดยนิยาม จึงไม่มียอดให้เทียบ
// ถ้าแอดมินต้องการจ่ายเกินยอดคาบด้วยเหตุผลอะไรก็ตาม ให้ใช้ประเภทนั้นแทน
// จะได้แยกออกจากกันในรายงาน ไม่ใช่ปนกับค่าจ้างตามคาบจนตรวจย้อนหลังไม่ได้
//
// ─── ทำไมยอมให้จ่ายน้อยกว่าได้ ───
//
// จ่ายบางส่วน (แบ่งจ่าย/ทยอยจ่าย) เป็นเรื่องปกติ ยอดที่เหลือจะยังค้างอยู่ในระบบ
// สิ่งที่ห้ามคือจ่าย "เกิน" ยอดที่คำนวณได้ เพราะนั่นแปลว่ามีตัวเลขที่ระบบอธิบายไม่ได้
func (s *ExpenseService) validateCoachWage(req dto.CreateExpenseRequest) error {
	if req.Type != models.ExpenseTypeCoach {
		return nil
	}
	if req.CoachID == nil || *req.CoachID == 0 {
		return ErrPayrollNeedsCoach
	}

	payroll, err := ComputeCoachPayroll(s.db, *req.CoachID, time.Now())
	if err != nil {
		return err
	}

	if payroll.Unpaid <= 0 {
		if payroll.UnresolvedSessions > 0 {
			return fmt.Errorf("%w (มี %d คาบที่ยังไม่มีรอบเช็คชื่อ จึงยังไม่ถูกนับเป็นเงิน — เคลียร์ก่อนแล้วลองใหม่)",
				ErrPayrollNoUnpaid, payroll.UnresolvedSessions)
		}
		return ErrPayrollNoUnpaid
	}

	if req.Amount > payroll.Unpaid+payrollEpsilon {
		return fmt.Errorf("%w (ค้างจ่ายจริง %.2f บาท แต่กรอกมา %.2f บาท)",
			ErrPayrollExceeds, payroll.Unpaid, req.Amount)
	}
	return nil
}

// GetCoachPayroll คืนยอดค่าจ้างที่ backend คำนวณให้ — หน้าเว็บใช้ตัวนี้แทนการคิดเอง
//
// coach ดูได้เฉพาะของตัวเอง, admin ดูได้ทุกคน (กัน IDOR เหมือน endpoint อื่นของ coach)
func (s *ExpenseService) GetCoachPayroll(coachID uint, userID uint, role string) (*dto.CoachPayrollDTO, error) {
	if err := VerifyCoachOwnership(s.db, coachID, userID, role); err != nil {
		return nil, err
	}
	return ComputeCoachPayroll(s.db, coachID, time.Now())
}

func (s *ExpenseService) GetAllExpenses() ([]models.Expense, error) {
	var expenses []models.Expense
	if err := s.db.Preload("Coach").Preload("Coach.User").Preload("CreatedBy").Preload("UpdatedBy").Order("date DESC, id DESC").Find(&expenses).Error; err != nil {
		return nil, errors.New("ไม่สามารถดึงข้อมูลค่าใช้จ่ายได้")
	}
	return expenses, nil
}

// UpdateExpense แก้ไขค่าใช้จ่ายที่มีอยู่ (แอดมิน) และบันทึกว่าใครเป็นผู้แก้ไขล่าสุด
//
// สำหรับ coach_wages: ตรวจว่ายอดใหม่ไม่เกิน "ค้างจ่ายจริง + ยอดเดิมของรายการนี้"
// (ยอดเดิมถูกนับเป็นจ่ายไปแล้วอยู่ จึงต้องบวกกลับเป็นเพดานที่แก้ได้ ไม่งั้นแก้ยอดตัวเองไม่ได้เลย)
func (s *ExpenseService) UpdateExpense(id uint, req dto.UpdateExpenseRequest, actorID uint) (*models.Expense, error) {
	var expense models.Expense
	if err := s.db.First(&expense, id).Error; err != nil {
		return nil, errors.New("ไม่พบข้อมูลค่าใช้จ่าย")
	}

	prevAmount := expense.Amount

	// รวมค่าที่แก้เข้ากับของเดิมเพื่อได้สถานะสุดท้าย แล้วค่อยตรวจกฎ
	if req.Amount != nil {
		expense.Amount = *req.Amount
	}
	if req.Type != nil {
		expense.Type = *req.Type
	}
	if req.Description != nil {
		expense.Description = *req.Description
	}
	if req.Date != nil {
		expense.Date = *req.Date
	}
	if req.ReceiptURL != nil {
		expense.ReceiptURL = *req.ReceiptURL
	}
	if req.CoachID != nil {
		expense.CoachID = req.CoachID
	}

	if expense.Amount <= 0 {
		return nil, errors.New("จำนวนเงินต้องมากกว่า 0")
	}

	if expense.CoachID != nil {
		var coach models.Coach
		if err := s.db.First(&coach, *expense.CoachID).Error; err != nil {
			return nil, errors.New("ไม่พบข้อมูลโค้ชที่ระบุ")
		}
	}

	// ตรวจเพดานค่าจ้างเฉพาะ coach_wages (เพดาน = ค้างจ่าย + ยอดเดิม)
	if expense.Type == models.ExpenseTypeCoach {
		if expense.CoachID == nil || *expense.CoachID == 0 {
			return nil, ErrPayrollNeedsCoach
		}
		payroll, err := ComputeCoachPayroll(s.db, *expense.CoachID, time.Now())
		if err != nil {
			return nil, err
		}
		ceiling := payroll.Unpaid + prevAmount
		if expense.Amount > ceiling+payrollEpsilon {
			return nil, fmt.Errorf("%w (แก้ได้ไม่เกิน %.2f บาท แต่กรอกมา %.2f บาท)",
				ErrPayrollExceeds, ceiling, expense.Amount)
		}
	}

	if actorID != 0 {
		expense.UpdatedByID = &actorID
	}

	if err := s.db.Save(&expense).Error; err != nil {
		return nil, errors.New("ไม่สามารถบันทึกการแก้ไขค่าใช้จ่ายได้")
	}

	if err := s.db.Preload("Coach").Preload("Coach.User").Preload("CreatedBy").Preload("UpdatedBy").First(&expense, expense.ID).Error; err != nil {
		return nil, err
	}
	return &expense, nil
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
