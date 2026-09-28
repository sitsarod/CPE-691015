package services

import (
	"errors"
	"fmt"
	"log"
	"time"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type ExpenseService struct {
	db *gorm.DB
}

func NewExpenseService(db *gorm.DB) *ExpenseService {
	return &ExpenseService{db: db}
}

// ErrExpenseUnknownType = ประเภทค่าใช้จ่ายที่ระบบไม่รู้จัก
//
// ต้องปฏิเสธ ไม่ใช่บันทึกไว้เฉย ๆ เพราะรายงานทุกตัว switch ตาม type
// แถวที่ type เพี้ยนจะหายไปจากทุกกราฟโดยไม่มีใครรู้ว่ามีอยู่
var ErrExpenseUnknownType = errors.New("ประเภทค่าใช้จ่ายไม่ถูกต้อง")

// isKnownExpenseType เป็นรายชื่อเดียวของประเภทที่ระบบรองรับ
// ต้องตรงกับ oneof ใน dto.CreateExpenseRequest
func isKnownExpenseType(t models.ExpenseType) bool {
	switch t {
	case models.ExpenseTypeCoach, models.ExpenseTypeCoachOther,
		models.ExpenseTypeCourt, models.ExpenseTypeEquipment,
		models.ExpenseTypeAdvertising, models.ExpenseTypeOther:
		return true
	default:
		return false
	}
}

// CreateExpense บันทึกค่าใช้จ่ายหนึ่งรายการ — เป็น wrapper บน CreateExpenses
//
// เหลือเส้นทางเขียนเส้นเดียวโดยตั้งใจ ด่านตรวจยอดค่าจ้างกับการล็อกแถวโค้ช
// จึงทำงานเหมือนกันทั้งกรณีบันทึกทีเดียวและบันทึกหลายรายการ
func (s *ExpenseService) CreateExpense(req dto.CreateExpenseRequest, actorID uint) (*models.Expense, error) {
	created, err := s.CreateExpenses([]dto.CreateExpenseRequest{req}, actorID)
	if err != nil {
		return nil, err
	}
	return &created[0], nil
}

// CreateExpenses บันทึกหลายรายการเป็นก้อนเดียว สำเร็จทั้งหมดหรือไม่สำเร็จเลย
//
// ─── ทำไมต้องเป็นก้อนเดียว ───
//
// หน้าจ่ายค่าจ้างบันทึก "ค่าจ้าง + โบนัสหลายรายการ" ของโค้ชคนเดียวพร้อมกัน
// เดิมหน้าเว็บวนลูปยิงทีละรายการ ถ้าพังกลางทางจะเหลือผลลัพธ์ครึ่ง ๆ
// แล้วแอดมินไม่รู้ว่าอันไหนลงไปแล้ว จะกดซ้ำก็ไม่กล้า
//
// ─── ทำไมต้องล็อกแถวโค้ช ───
//
// ด่านตรวจยอดค่าจ้างเป็น "อ่านแล้วเขียน" (คิดยอดค้าง แล้วค่อยบันทึก)
// สองคำสั่งนี้ไม่ได้เป็นอะตอมด้วยตัวเอง แอดมินสองคนที่กดจ่ายพร้อมกันจะเห็น
// ยอดค้างก้อนเดียวกันทั้งคู่ แล้วผ่านด่านทั้งคู่ = จ่ายซ้ำเป็นสองเท่า
//
// ล็อกแถวใน coaches ทำให้การจ่ายเงินของโค้ชคนเดียวกันเข้าคิวกัน
// (โค้ชคนละคนไม่บล็อกกัน) หลักเดียวกับที่ recordCoachAttendance พึ่ง unique index
// แทนการ SELECT-แล้ว-INSERT
func (s *ExpenseService) CreateExpenses(reqs []dto.CreateExpenseRequest, actorID uint) ([]models.Expense, error) {
	if len(reqs) == 0 {
		return nil, errors.New("ไม่มีรายการค่าใช้จ่ายที่จะบันทึก")
	}

	// ⚠️ ค่าจ้างของโค้ชคนเดียวกันซ้อนกันในก้อนเดียวไม่ได้
	// ด่านตรวจยอดคิดจากยอดค้าง ณ ตอนนั้น ถ้ามีสองรายการในก้อนเดียวจะผ่านทั้งคู่
	// ด้วยยอดเต็มทั้งสองรายการ = จ่ายเกิน ให้รวมเป็นรายการเดียวมาแทน
	wageCoaches := map[uint]bool{}
	for _, r := range reqs {
		if r.Type != models.ExpenseTypeCoach {
			continue
		}
		if r.CoachID == nil || *r.CoachID == 0 {
			return nil, ErrPayrollNeedsCoach
		}
		if wageCoaches[*r.CoachID] {
			return nil, fmt.Errorf("%w (มีรายการค่าจ้างของโค้ชคนเดียวกันซ้อนกันในคำขอเดียว)",
				ErrPayrollExceeds)
		}
		wageCoaches[*r.CoachID] = true
	}

	created := make([]models.Expense, 0, len(reqs))

	err := s.db.Transaction(func(tx *gorm.DB) error {
		// ล็อกก่อนอ่านยอด ไม่ใช่หลัง — ล็อกหลังอ่านก็ไม่ต่างจากไม่ล็อก
		for coachID := range wageCoaches {
			if err := lockCoachRow(tx, coachID); err != nil {
				return err
			}
		}

		created = created[:0]
		for _, req := range reqs {
			if req.CoachID != nil {
				var coach models.Coach
				if err := tx.First(&coach, *req.CoachID).Error; err != nil {
					return errors.New("ไม่พบข้อมูลโค้ชที่ระบุ")
				}
			}

			if err := s.validateCoachWage(tx, req); err != nil {
				return err
			}

			expense := models.Expense{
				Amount:      req.Amount,
				Type:        req.Type,
				Description: req.Description,
				Date:        req.Date,
				CoachID:     req.CoachID,
				ReceiptURL:  req.ReceiptURL,
			}
			// บันทึกว่าใครเป็นคนทำรายการ — ต้องตอบได้ย้อนหลังว่าเงินก้อนนี้ใครสั่งจ่าย
			if actorID != 0 {
				expense.CreatedByID = &actorID
			}
			if err := tx.Create(&expense).Error; err != nil {
				return errors.New("ไม่สามารถบันทึกค่าใช้จ่ายได้")
			}
			created = append(created, expense)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	// โหลดความสัมพันธ์และแจ้งเตือนหลัง commit
	// การแจ้งเตือนล้มเหลวต้องไม่ทำให้การบันทึกที่สำเร็จแล้วถูก rollback
	for i := range created {
		if err := s.db.Preload("Coach").Preload("Coach.User").
			Preload("CreatedBy").Preload("UpdatedBy").
			First(&created[i], created[i].ID).Error; err != nil {
			continue
		}
		s.notifyExpenseRecorded(&created[i])
	}

	return created, nil
}

// lockCoachRow จับแถวโค้ชไว้จนจบทรานแซกชัน เพื่อให้การจ่ายเงินของคนเดียวกันเข้าคิว
//
// sqlite (ที่ใช้ในเทส) ไม่รองรับ SELECT ... FOR UPDATE จึงข้ามการล็อกไป
// ไม่กระทบความถูกต้องของเทส เพราะเทสรันทีละคำสั่งอยู่แล้ว และ sqlite
// ล็อกทั้งไฟล์ตอนเขียนอยู่ดี ส่วนของจริงเป็น postgres ซึ่งได้ล็อกครบ
func lockCoachRow(tx *gorm.DB, coachID uint) error {
	q := tx.Model(&models.Coach{}).Where("id = ?", coachID)
	if tx.Dialector.Name() == "postgres" {
		q = q.Clauses(clause.Locking{Strength: "UPDATE"})
	}

	var coach models.Coach
	if err := q.First(&coach).Error; err != nil {
		return errors.New("ไม่พบข้อมูลโค้ชที่ระบุ")
	}
	return nil
}

// notifyExpenseRecorded แจ้งโค้ชว่ามีการบันทึกรายได้ให้ (expense.Coach.UserID = users.id)
func (s *ExpenseService) notifyExpenseRecorded(expense *models.Expense) {
	if expense.CoachID == nil || expense.Coach == nil || expense.Coach.UserID == 0 {
		return
	}

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
func (s *ExpenseService) validateCoachWage(tx *gorm.DB, req dto.CreateExpenseRequest) error {
	// ⚠️ ย้ำที่นี่ด้วย ห้ามพึ่ง binding อย่างเดียว
	//
	// binding ทำงานเฉพาะเส้นที่ผ่าน gin ถ้ามีใครเรียก service ตรง ๆ (งาน batch,
	// เทส, โค้ดใหม่ในอนาคต) ด่านจะหายไปเงียบ ๆ
	//
	// type ที่ระบบไม่รู้จักอันตรายเป็นพิเศษ เพราะ paidWages นับเฉพาะ coach_wages
	// แถวที่ type เพี้ยนจึงไม่ถูกหักออกจากยอดค้าง = จ่ายไปแล้วแต่ระบบยังบอกว่าค้างเต็ม
	if !isKnownExpenseType(req.Type) {
		return fmt.Errorf("%w (%q)", ErrExpenseUnknownType, req.Type)
	}

	if req.Type != models.ExpenseTypeCoach {
		return nil
	}
	if req.CoachID == nil || *req.CoachID == 0 {
		return ErrPayrollNeedsCoach
	}

	// ต้องคิดยอดผ่าน tx ตัวเดียวกับที่จะเขียน ไม่ใช่ s.db
	// ไม่งั้นด่านนี้อ่านนอกทรานแซกชัน แล้วการล็อกแถวโค้ชก็ไม่มีความหมาย
	//
	// ⚠️ และต้องคิดยอดของ "งวดที่แถวนี้จะถูกบันทึก" (req.Date) ไม่ใช่ของวันนี้
	//
	// ยอดค้างของโค้ชรายเดือนนับเฉพาะเงินที่จ่ายในเดือนนั้น (monthRange)
	// ถ้าด่านคิดจากเดือนปัจจุบันแต่แถวถูกบันทึกลงเดือนก่อน แถวนั้นจะตกนอกหน้าต่าง
	// ที่ด่านนับ → ยอดค้างไม่ลดลงเลย → กดจ่ายซ้ำได้ไม่จำกัด
	// (พิสูจน์แล้ว: เงินเดือน 20,000 จ่ายผ่าน 5 ครั้งติด รวม 100,000 ไม่มี error)
	//
	// การจ่ายเงินเดือนงวดที่แล้วในต้นเดือนใหม่เป็นพฤติกรรมปกติ ด่านนี้จึงแทบไม่เคยทำงาน
	asOf := req.Date
	if asOf.IsZero() {
		asOf = time.Now()
	}
	payroll, err := ComputeCoachPayroll(tx, *req.CoachID, asOf)
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

// UpdateExpense แก้ไขรายการค่าใช้จ่ายที่บันทึกไปแล้ว
//
// สำหรับ coach_wages: ตรวจว่ายอดใหม่ไม่เกิน "ค้างจ่ายจริง + ยอดเดิมของรายการนี้"
// (ยอดเดิมถูกนับเป็นจ่ายไปแล้วอยู่ จึงต้องบวกกลับเป็นเพดานที่แก้ได้ ไม่งั้นแก้ยอดตัวเองไม่ได้เลย)
//
// ─── สิ่งที่เติมจากฉบับเดิมตอน merge ───
//
//   - ครอบทรานแซกชันเดียว + ล็อกแถวโค้ช — การแก้ยอดก็เป็น "อ่านแล้วเขียน" เหมือนการสร้าง
//     สองคนแก้พร้อมกันจะผ่านเพดานทั้งคู่ (เหตุผลเดียวกับ CreateExpenses)
//   - ตรวจ type ที่ระบบไม่รู้จัก — ไม่งั้นแก้ type เป็นค่าอื่นแล้วข้ามด่านเพดานได้
//   - คิดยอดค้าง ณ "งวดของรายการ" (expense.Date) ไม่ใช่วันนี้ — โค้ชรายเดือน
//     นับยอดค้างเป็นรายเดือน ถ้าใช้วันนี้จะเทียบผิดงวด (ดู validateCoachWage)
func (s *ExpenseService) UpdateExpense(id uint, req dto.UpdateExpenseRequest, actorID uint) (*models.Expense, error) {
	var expense models.Expense

	err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.First(&expense, id).Error; err != nil {
			return errors.New("ไม่พบข้อมูลค่าใช้จ่าย")
		}

		prevAmount := expense.Amount
		// เก็บค่าเดิมของ row ก่อนถูกแก้ ไว้ใช้ตัดสินว่ายอดเดิมถูกนับอยู่ใน AlreadyPaid ของโค้ช
		// ที่กำลังตรวจหรือไม่ (paidWages นับเฉพาะ coach_id + type=coach_wages และรายเดือนยังกรองงวด)
		origType := expense.Type
		origDate := expense.Date
		var origCoachID *uint
		if expense.CoachID != nil {
			v := *expense.CoachID
			origCoachID = &v
		}

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
			return errors.New("จำนวนเงินต้องมากกว่า 0")
		}
		if !isKnownExpenseType(expense.Type) {
			return fmt.Errorf("%w (%q)", ErrExpenseUnknownType, expense.Type)
		}

		if expense.CoachID != nil {
			var coach models.Coach
			if err := tx.First(&coach, *expense.CoachID).Error; err != nil {
				return errors.New("ไม่พบข้อมูลโค้ชที่ระบุ")
			}
		}

		// ตรวจเพดานค่าจ้างเฉพาะ coach_wages (เพดาน = ค้างจ่าย + ยอดเดิม)
		if expense.Type == models.ExpenseTypeCoach {
			if expense.CoachID == nil || *expense.CoachID == 0 {
				return ErrPayrollNeedsCoach
			}
			if err := lockCoachRow(tx, *expense.CoachID); err != nil {
				return err
			}

			asOf := expense.Date
			if asOf.IsZero() {
				asOf = time.Now()
			}
			payroll, err := ComputeCoachPayroll(tx, *expense.CoachID, asOf)
			if err != nil {
				return err
			}

			// เพดาน = ยอดที่ควรได้ (Expected) หัก "ยอดที่จ่ายไปแล้วโดย row อื่น"
			// AlreadyPaid ที่ ComputeCoachPayroll คืนมา รวมยอดเดิมของ row นี้ไว้ก็ต่อเมื่อ row นี้
			// เข้าเงื่อนไขของ paidWages สำหรับโค้ชที่กำลังตรวจ จึงต้องหักยอดเดิมออกเฉพาะกรณีนั้น
			// ไม่งั้น (เช่น ย้ายโค้ช, เปลี่ยน type จาก non-wage เป็น wage, หรือย้ายงวดเดือน)
			// จะบวกยอดเดิมกลับทั้งที่ไม่ได้อยู่ใน AlreadyPaid ของโค้ชใหม่ = เพดานเฟ้อ จ่ายเกินได้
			oldContribution := 0.0
			sameCoach := origCoachID != nil && *origCoachID == *expense.CoachID
			if origType == models.ExpenseTypeCoach && sameCoach {
				if payroll.PaymentType == PaymentTypeMonthly {
					// รายเดือน: AlreadyPaid กรองเฉพาะงวดของ asOf → ยอดเดิมนับก็ต่อเมื่ออยู่เดือนเดียวกัน
					mr := monthRange(asOf)
					if !origDate.Before(mr[0]) && origDate.Before(mr[1]) {
						oldContribution = prevAmount
					}
				} else {
					// รายคาบ: AlreadyPaid รวมทุกงวด → ยอดเดิมนับเสมอเมื่อเป็นโค้ช/type เดียวกัน
					oldContribution = prevAmount
				}
			}

			ceiling := payroll.Expected - (payroll.AlreadyPaid - oldContribution)
			if expense.Amount > ceiling+payrollEpsilon {
				return fmt.Errorf("%w (แก้ได้ไม่เกิน %.2f บาท แต่กรอกมา %.2f บาท)",
					ErrPayrollExceeds, positive(ceiling), expense.Amount)
			}
		}

		if actorID != 0 {
			expense.UpdatedByID = &actorID
		}

		if err := tx.Save(&expense).Error; err != nil {
			return errors.New("ไม่สามารถบันทึกการแก้ไขค่าใช้จ่ายได้")
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	if err := s.db.Preload("Coach").Preload("Coach.User").
		Preload("CreatedBy").Preload("UpdatedBy").
		First(&expense, expense.ID).Error; err != nil {
		return nil, err
	}
	return &expense, nil
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
	if err := s.db.Preload("Coach").Preload("Coach.User").
		Preload("CreatedBy").Preload("UpdatedBy").
		Order("date DESC, id DESC").Find(&expenses).Error; err != nil {
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
	// ⚠️ กรอง type ด้วย — แถวประเภทอื่น (ค่าเช่าสนาม ฯลฯ) ที่เผลอผูก coach_id ไว้
	// จะไปโผล่ในหน้า "รายได้ของฉัน" ของโค้ช ทั้งที่ไม่ใช่เงินของเขา
	if err := s.db.
		Where("coach_id = ? AND type IN ?", coachID,
			[]models.ExpenseType{models.ExpenseTypeCoach, models.ExpenseTypeCoachOther}).
		Preload("Coach").Preload("Coach.User").Order("date DESC, id DESC").Find(&expenses).Error; err != nil {
		return nil, errors.New("ไม่สามารถดึงข้อมูลค่าใช้จ่ายได้")
	}
	return expenses, nil
}

// DeleteExpense ลบรายการค่าใช้จ่ายแบบ soft delete
//
// ⚠️ เดิมเป็น hard delete (Unscoped().Delete) ซึ่งเป็นบั๊กเดียวกับปุ่มลบโค้ช
// แต่ลงบนตาราง expenses ที่การแก้ปุ่มลบโค้ชอุตส่าห์ปกป้องไว้:
//
//	หลักฐานการจ่ายเงินหายถาวร ตรวจย้อนหลังไม่ได้เลย
//	ยอดค้างจ่ายเด้งกลับขึ้นมา จ่ายค่าจ้างก้อนเดิมได้อีกรอบ
//	ประวัติรายได้ของโค้ชเปลี่ยนโดยเจ้าตัวไม่รู้
//
// soft delete แก้ข้อแรก (แถวยังอยู่ ตรวจย้อนได้ด้วย Unscoped)
// ส่วนยอดค้างที่เด้งกลับเป็นพฤติกรรมที่ต้องการ เพราะจุดประสงค์ของการลบคือแก้รายการที่ผิด
// สิ่งที่ต้องไม่เกิดคือมันเงียบ จึงแจ้งโค้ชทุกครั้งและเขียน log ไว้ว่าใครลบ
func (s *ExpenseService) DeleteExpense(id uint, actorUserID uint) error {
	var expense models.Expense
	if err := s.db.Preload("Coach").First(&expense, id).Error; err != nil {
		return errors.New("ไม่พบข้อมูลค่าใช้จ่าย")
	}

	if err := s.db.Delete(&expense).Error; err != nil {
		return errors.New("ไม่สามารถลบข้อมูลค่าใช้จ่ายได้")
	}

	log.Printf("[expense] ลบรายการ #%d (%s ยอด %.2f) โดย users.id=%d",
		expense.ID, expense.Type, expense.Amount, actorUserID)

	// รายการที่ผูกกับโค้ชคือรายได้ของเขา การหายไปต้องไม่เงียบ
	if expense.CoachID != nil && expense.Coach != nil && expense.Coach.UserID != 0 {
		body := fmt.Sprintf("รายการรายได้ยอด %.2f บาท ถูกยกเลิกโดยแอดมิน หากไม่ถูกต้องกรุณาแจ้งแอดมิน",
			expense.Amount)
		if expense.Type == models.ExpenseTypeCoach {
			body = fmt.Sprintf("รายการค่าจ้างยอด %.2f บาท ถูกยกเลิกโดยแอดมิน ยอดนี้จะกลับไปเป็นค่าจ้างค้างจ่าย",
				expense.Amount)
		}
		CreateNotification(s.db, expense.Coach.UserID,
			"coach_expense_removed",
			fmt.Sprintf("expense-removed-%d", expense.ID),
			"รายการรายได้ถูกยกเลิก",
			body, "/coach/payment", "warning",
		)
	}

	return nil
}
