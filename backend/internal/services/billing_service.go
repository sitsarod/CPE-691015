package services

import (
	"errors"
	"fmt"
	"log"
	"math"
	"time"

	"CPE-691015/internal/models"
	"gorm.io/gorm"
)

// overdueCutoff คืนต้นวันของวันนี้ (เขตเวลาเครื่อง) — บิลที่ครบกำหนด "ก่อน" เวลานี้ถือว่าเกินกำหนด
// ผลคือบิลกลายเป็นเกินกำหนดในวันถัดจากวันครบกำหนด ให้ตรงกับการแสดงผลฝั่งหน้าเว็บ (isPastDue)
func overdueCutoff(now time.Time) time.Time {
	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
}

// notifyBillIssued แจ้งลูกค้าเมื่อมีบิลใหม่รอชำระ (best-effort)
// customerUserID = users.id (คอลัมน์ billings.customer_id อ้าง users.id)
func notifyBillIssued(db *gorm.DB, customerUserID, billingID uint, amount float64, desc string) {
	CreateNotification(db, customerUserID,
		"bill_issued",
		fmt.Sprintf("bill-%d", billingID),
		"มีบิลรอชำระ",
		fmt.Sprintf("%s • ยอด ฿%.2f รอการชำระเงิน", desc, amount),
		"/customer/payment?tab=billings",
		"warning",
	)
}

// notifyBillOverdue แจ้งลูกค้าเมื่อบิลเลยกำหนดชำระ (best-effort)
// กันซ้ำด้วย (type, signature) = แจ้งครั้งเดียวต่อบิล แม้ sweep จะรันซ้ำหลายรอบ
func notifyBillOverdue(db *gorm.DB, customerUserID, billingID uint, amount float64, desc string) {
	CreateNotification(db, customerUserID,
		"bill_overdue",
		fmt.Sprintf("bill-%d", billingID),
		"บิลเกินกำหนดชำระ",
		fmt.Sprintf("%s • ยอด ฿%.2f เลยกำหนดชำระแล้ว กรุณาชำระโดยเร็ว", desc, amount),
		"/customer/payment?tab=billings",
		"danger",
	)
}

// splitPerHead คืนยอดที่แต่ละคนต้องจ่ายเมื่อหารต้นทุน total ให้ heads คน โดยปัดขึ้นเป็นจำนวนเต็มบาท
//
// ปัด "ขึ้น" โดยตั้งใจ เพื่อให้ยอดที่เก็บรวม (perHead × heads) ไม่น้อยกว่าต้นทุนจริงเสมอ
// (ปัดลงจะเก็บไม่ครบ สถาบันต้องออกส่วนต่างเอง) ส่วนที่เกินจากการปัดถือเป็นของสถาบัน
func splitPerHead(total float64, heads int) float64 {
	if heads <= 0 {
		return 0
	}
	return math.Ceil(total / float64(heads))
}

type BillingService struct {
	db *gorm.DB
}

func NewBillingService(db *gorm.DB) *BillingService {
	return &BillingService{db: db}
}

// MarkOverdueBillings ปรับสถานะบิลให้ตรงกับวันครบกำหนดจริงแบบสองทาง:
//   - unfunded → overdue  เมื่อเลยวันครบกำหนดแล้ว
//   - overdue  → unfunded  เมื่อวันครบกำหนดถูกเลื่อนออกไปเป็นอนาคต (แอดมินแก้ due_date)
//
// ไม่แตะบิลที่ paid/waitcheck (สถานะการจ่ายเงิน) คืนจำนวนแถวที่อัปเดตทั้งหมด
// ใช้ทั้งใน background job และ lazy sweep ตอนอ่านรายการบิล
func (s *BillingService) MarkOverdueBillings() (int64, error) {
	cutoff := overdueCutoff(time.Now())

	// ดึงบิลที่กำลังจะกลายเป็นเกินกำหนดไว้ก่อนอัปเดต เพื่อส่งแจ้งเตือนหลังเปลี่ยนสถานะ
	// (batch UPDATE ไม่คืนแถวที่แก้ จึงต้อง select ก่อน) บิลที่เคยเลื่อนแล้วจะเป็น overdue
	// ไม่เข้าเงื่อนไข unfunded อีก จึงไม่ถูกหยิบมาแจ้งซ้ำ
	var newlyOverdue []models.Billing
	if err := s.db.
		Where("status = ? AND due_date < ?", models.StatusUnfunded, cutoff).
		Find(&newlyOverdue).Error; err != nil {
		return 0, err
	}

	toOverdue := s.db.Model(&models.Billing{}).
		Where("status = ? AND due_date < ?", models.StatusUnfunded, cutoff).
		Update("status", models.StatusOverdue)
	if toOverdue.Error != nil {
		return 0, toOverdue.Error
	}

	toUnfunded := s.db.Model(&models.Billing{}).
		Where("status = ? AND due_date >= ?", models.StatusOverdue, cutoff).
		Update("status", models.StatusUnfunded)
	if toUnfunded.Error != nil {
		return toOverdue.RowsAffected, toUnfunded.Error
	}

	// แจ้งลูกค้าว่าบิลเกินกำหนด (best-effort, กันซ้ำต่อบิลด้วย type+signature)
	for _, b := range newlyOverdue {
		notifyBillOverdue(s.db, b.CustomerID, b.ID, b.Amount, b.Description)
	}

	return toOverdue.RowsAffected + toUnfunded.RowsAffected, nil
}

// sweepOverdue เรียก MarkOverdueBillings แบบ best-effort ก่อนอ่านรายการบิล
// เพื่อให้สถานะที่ส่งออกไปตรงกับความจริงเสมอ แม้ background job ยังไม่ทันรอบ
func (s *BillingService) sweepOverdue() {
	if _, err := s.MarkOverdueBillings(); err != nil {
		log.Printf("[billing] อัปเดตสถานะบิลเกินกำหนดไม่สำเร็จ: %v", err)
	}
}

// CreateSingleBilling สร้างบิลเรียกเก็บเงินรายคน
func (s *BillingService) CreateSingleBilling(customerID uint, adminID uint, billingTypeID uint, description string, amount float64, dueDate time.Time) error {
	// ตรวจสอบว่า UserID (customerID) มีตัวตนอยู่จริง
	var user models.User
	if err := s.db.First(&user, customerID).Error; err != nil {
		return businessErr("ไม่พบข้อมูลผู้ใช้ของนักเรียน")
	}

	// ตรวจสอบว่า BillingTypeID มีอยู่จริง
	var bType models.BillingType
	if err := s.db.First(&bType, billingTypeID).Error; err != nil {
		return businessErr("ไม่พบข้อมูลประเภทการเรียกเก็บเงิน")
	}

	billing := models.Billing{
		Description:   description,
		Amount:        amount,
		DueDate:       dueDate,
		Status:        models.StatusUnfunded,
		BillingTypeID: billingTypeID,
		CustomerID:    customerID,
		AdminID:       &adminID,
	}

	if err := s.db.Create(&billing).Error; err != nil {
		return errors.New("ไม่สามารถสร้างบิลเรียกเก็บเงินได้")
	}

	notifyBillIssued(s.db, customerID, billing.ID, amount, description)
	return nil
}

// CreateBulkBillings สร้างบิลเรียกเก็บเงินพร้อมกันทีเดียวหลายคน (แบบยอดเงินคงที่)
func (s *BillingService) CreateBulkBillings(customerIDs []uint, adminID uint, billingTypeID uint, description string, amount float64, dueDate time.Time) error {
	if len(customerIDs) == 0 {
		return businessErr("กรุณาระบุรายชื่อนักเรียนอย่างน้อย 1 คน")
	}

	// ตรวจสอบว่า BillingTypeID มีอยู่จริง
	var bType models.BillingType
	if err := s.db.First(&bType, billingTypeID).Error; err != nil {
		return businessErr("ไม่พบข้อมูลประเภทการเรียกเก็บเงิน")
	}

	// เก็บบิลที่สร้างสำเร็จไว้แจ้งเตือนหลัง commit (ถ้า tx ล้มจะไม่ถูกใช้)
	type issued struct {
		userID    uint
		billingID uint
	}
	var created []issued

	err := s.db.Transaction(func(tx *gorm.DB) error {
		for _, customerID := range customerIDs {
			// ตรวจสอบว่า UserID มีตัวตนจริง
			var user models.User
			if err := tx.First(&user, customerID).Error; err != nil {
				return businessErr("พบรหัสนักเรียนที่ไม่ถูกต้องในระบบ")
			}

			billing := models.Billing{
				Description:   description,
				Amount:        amount,
				DueDate:       dueDate,
				Status:        models.StatusUnfunded,
				BillingTypeID: billingTypeID,
				CustomerID:    customerID,
				AdminID:       &adminID,
			}

			if err := tx.Create(&billing).Error; err != nil {
				return errors.New("ไม่สามารถสร้างบิลกลุ่มได้")
			}
			created = append(created, issued{userID: customerID, billingID: billing.ID})
		}
		return nil
	})
	if err != nil {
		return err
	}

	for _, c := range created {
		notifyBillIssued(s.db, c.userID, c.billingID, amount, description)
	}
	return nil
}

// CreateSplitBillingFromAttendance สร้างบิลแบบหารค่าใช้จ่ายจากเช็คอินของนักเรียน
func (s *BillingService) CreateSplitBillingFromAttendance(courseID uint, dateStr string, hourlyRate float64, hours float64, adminID uint, billingTypeID uint, description string, dueDate time.Time) error {
	parsedDate, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		return businessErr("รูปแบบวันที่ไม่ถูกต้อง (ตัวอย่าง: YYYY-MM-DD)")
	}
	nextDay := parsedDate.AddDate(0, 0, 1)

	// ตรวจสอบว่า BillingTypeID มีอยู่จริง
	var bType models.BillingType
	if err := s.db.First(&bType, billingTypeID).Error; err != nil {
		return businessErr("ไม่พบข้อมูลประเภทการเรียกเก็บเงิน")
	}

	var openSessions int64
	if err := s.db.Model(&models.AttendanceSession{}).
		Joins("JOIN packages ON packages.id = attendance_sessions.package_id AND packages.deleted_at IS NULL").
		Where("packages.course_id = ? AND attendance_sessions.session_date >= ? AND attendance_sessions.session_date < ? AND attendance_sessions.status = ?",
			courseID, parsedDate, nextDay, models.AttendanceSessionOpen).
		Count(&openSessions).Error; err != nil {
		return errors.New("ไม่สามารถตรวจสอบสถานะรอบเช็คชื่อของวันที่ระบุได้")
	}
	if openSessions > 0 {
		return businessErr("ยังมีรอบเช็คชื่อของวันที่เลือกที่ยังไม่ได้ปิด — ต้องปิดรอบก่อนออกบิล ไม่งั้นคนที่ยืนยันว่าจะมาแล้วไม่มาจะหลุดจากยอดหาร ทำให้คนที่มาเรียนจ่ายแพงเกิน")
	}

	// ดึงประวัติการเข้าเรียน (StudentAttendance) ของ Course นี้ในวันที่ระบุ
	var attendances []models.StudentAttendance
	err = s.db.Preload("Enrollment").
		Preload("Enrollment.Customer").
		Joins("JOIN enrollments ON enrollments.id = student_attendances.enrollment_id").
		Joins("JOIN packages ON packages.id = enrollments.package_id").
		Joins("LEFT JOIN attendance_sessions ON attendance_sessions.id = student_attendances.attendance_session_id AND attendance_sessions.deleted_at IS NULL").
		Where("packages.course_id = ?", courseID).
		Where(s.db.
			Where("attendance_sessions.session_date >= ? AND attendance_sessions.session_date < ?", parsedDate, nextDay).
			Or("student_attendances.attendance_session_id IS NULL AND student_attendances.check_in_time >= ? AND student_attendances.check_in_time < ?", parsedDate, nextDay)).
		Where("(student_attendances.status = ? OR (student_attendances.status = ? AND student_attendances.is_off_schedule = false))",
			models.AttendanceStatusPresent, models.AttendanceStatusAbsent).
		Find(&attendances).Error

	if err != nil {
		return errors.New("เกิดข้อผิดพลาดในการดึงข้อมูลประวัติการเข้าเรียน")
	}

	// คัดลอกและกรองให้เหลือเฉพาะ User ID ของนักเรียนที่ไม่ซ้ำกัน
	uniqueUserIDs := make(map[uint]bool)
	for _, att := range attendances {
		var uID uint
		if att.UserID != nil {
			uID = *att.UserID
		} else if att.Enrollment != nil && att.Enrollment.Customer != nil {
			uID = att.Enrollment.Customer.UserID
		}

		if uID != 0 {
			uniqueUserIDs[uID] = true
		}
	}

	if len(uniqueUserIDs) == 0 {
		return businessErr("ไม่พบรายชื่อที่ต้องหารค่าสนามของวิชาและวันที่ระบุ (ไม่มีใครยืนยันมาเรียนหรือเช็คชื่อไว้)")
	}

	// คำนวณยอดเงินรวมและยอดหารเฉลี่ย ปัดขึ้นเป็นจำนวนเต็มบาท (ทุกคนจ่ายเท่ากัน)
	// เช่น 1000 ÷ 3 = 333.33 → เก็บคนละ 334 · ส่วนต่างจากการปัดเข้าสถาบัน
	// เหตุผล: กันเก็บไม่ครบต้นทุน (ปัดลง = สถาบันต้องออกเอง), ตัดปัญหาเศษสตางค์/float ทิ้ง,
	// และทุกคนจ่ายเท่ากันจึงไม่มีใครต้องรับเศษแพงกว่าเพื่อน
	totalAmount := hourlyRate * hours
	splitAmount := splitPerHead(totalAmount, len(uniqueUserIDs))

	// เก็บบิลที่สร้างสำเร็จไว้แจ้งเตือนหลัง commit
	type issued struct {
		userID    uint
		billingID uint
	}
	var created []issued

	// ใช้ Transaction ในการบันทึกบิลทุกคน
	err = s.db.Transaction(func(tx *gorm.DB) error {
		for customerID := range uniqueUserIDs {
			billing := models.Billing{
				Description:   description,
				Amount:        splitAmount,
				DueDate:       dueDate,
				Status:        models.StatusUnfunded,
				BillingTypeID: billingTypeID,
				CustomerID:    customerID,
				AdminID:       &adminID,
			}

			if err := tx.Create(&billing).Error; err != nil {
				return errors.New("ไม่สามารถบันทึกบิลหารเฉลี่ยของบางคนได้")
			}
			created = append(created, issued{userID: customerID, billingID: billing.ID})
		}
		return nil
	})
	if err != nil {
		return err
	}

	for _, c := range created {
		notifyBillIssued(s.db, c.userID, c.billingID, splitAmount, description)
	}
	return nil
}

// GetAllBillings ดึงรายการบิลทั้งหมดในระบบ (สำหรับ Admin)
func (s *BillingService) GetAllBillings() ([]models.Billing, error) {
	s.sweepOverdue()
	var billings []models.Billing
	err := s.db.Preload("BillingType").
		Preload("Customer").
		Preload("Customer.Customer").
		Preload("Admin").
		Preload("UpdatedBy").
		Preload("PaymentItem").
		Preload("PaymentItem.Invoice").
		Preload("PaymentItem.Invoice.ConfirmedBy").
		Order("id DESC").
		Find(&billings).Error
	return billings, err
}

// GetBillingsByCustomerID ดึงรายการบิลทั้งหมดของลูกค้ารายเจาะจง (สำหรับ Customer)
func (s *BillingService) GetBillingsByCustomerID(customerID uint) ([]models.Billing, error) {
	s.sweepOverdue()
	var billings []models.Billing
	err := s.db.Preload("BillingType").
		Preload("Customer").
		Preload("Customer.Customer").
		Preload("Admin").
		Where("customer_id = ?", customerID).
		Order("id DESC").
		Find(&billings).Error
	return billings, err
}

// GetBillingByID ดึงข้อมูลบิลตาม ID
func (s *BillingService) GetBillingByID(id uint) (*models.Billing, error) {
	var billing models.Billing
	err := s.db.Preload("BillingType").
		Preload("Customer").
		Preload("Customer.Customer").
		Preload("Admin").
		First(&billing, id).Error
	if err != nil {
		return nil, errors.New("ไม่พบข้อมูลบิล")
	}
	return &billing, nil
}

// hasActivePendingInvoice บอกว่าบิลนี้มีใบแจ้งหนี้ที่ยัง "รอดำเนินการ" (pending) ผูกอยู่หรือไม่
//
// ยอดเงินถูก snapshot ไว้ในใบตั้งแต่ตอนสร้าง (invoice.TotalAmount) การแก้/ลบบิลระหว่างที่ยังมีใบ
// ค้างอยู่จะทำให้ยอดในบิลกับยอดที่ลูกค้าต้องจ่ายไม่ตรงกัน หรือใบชี้ไปบิลที่ถูกลบ (dangling)
// จึงต้องกันไว้จนกว่าใบจะถูกยกเลิก/ปฏิเสธ/หมดอายุ (ดู CreateInvoice ที่ใช้เกณฑ์ pending เดียวกัน)
func (s *BillingService) hasActivePendingInvoice(billingID uint) (bool, error) {
	var count int64
	err := s.db.Model(&models.PaymentItem{}).
		Joins("JOIN invoices ON invoices.id = payment_items.invoice_id").
		Where("payment_items.billing_id = ? AND invoices.status = ?", billingID, models.InvoicePending).
		Count(&count).Error
	return count > 0, err
}

// UpdateBilling แก้ไขบิลโดยสามารถอัปเดตคำอธิบาย ยอดเงิน Due Date หรือสถานะ
// actorID = users.id ของแอดมินที่กดแก้ไข (บันทึกไว้เป็น UpdatedBy เพื่อรู้ว่าใครแก้ล่าสุด)
func (s *BillingService) UpdateBilling(id uint, input models.Billing, actorID uint) (*models.Billing, error) {
	var billing models.Billing
	if err := s.db.First(&billing, id).Error; err != nil {
		return nil, ErrBillingNotFound
	}

	// บิลที่ชำระเงินแล้ว หรือรอแอดมินตรวจเช็ค ไม่ควรยอมให้แก้ไขข้อมูลทางการเงิน
	if billing.Status == models.StatusPaid || billing.Status == models.StatusWaitCheck {
		return nil, businessErr("ไม่สามารถแก้ไขบิลที่ชำระเงินแล้วหรือกำลังรอการตรวจสอบได้")
	}

	// กันการแก้บิลที่ยังมีใบแจ้งหนี้รอดำเนินการค้างอยู่ (ยอดถูก freeze ในใบแล้ว แม้บิลจะยังเป็น unfunded)
	if active, err := s.hasActivePendingInvoice(id); err != nil {
		return nil, errors.New("ไม่สามารถตรวจสอบสถานะใบแจ้งหนี้ของบิลได้")
	} else if active {
		return nil, businessErr("บิลนี้มีใบแจ้งหนี้ที่รอดำเนินการอยู่ กรุณายกเลิกใบแจ้งหนี้ก่อนจึงจะแก้ไขบิลได้")
	}

	// อัปเดตเฉพาะฟิลด์ที่มีการส่งค่าเข้ามา
	updateData := make(map[string]interface{})
	if input.Description != "" {
		updateData["description"] = input.Description
	}
	if input.Amount != 0 {
		updateData["amount"] = input.Amount
	}
	if !input.DueDate.IsZero() {
		updateData["due_date"] = input.DueDate
	}
	if input.Status != "" {
		updateData["status"] = input.Status
	}
	if input.BillingTypeID != 0 {
		updateData["billingtype_id"] = input.BillingTypeID
	}

	// บันทึกผู้แก้ไขล่าสุดเฉพาะเมื่อมีการแก้ข้อมูลจริง (ไม่ใช่แค่เรียกมาเปล่า ๆ)
	if len(updateData) > 0 && actorID != 0 {
		updateData["updated_by_id"] = actorID
	}

	if len(updateData) > 0 {
		if err := s.db.Model(&billing).Updates(updateData).Error; err != nil {
			return nil, errors.New("ไม่สามารถบันทึกการแก้ไขบิลได้")
		}
	}

	// โหลดความสัมพันธ์กลับมาส่งผลลัพธ์
	var result models.Billing
	if err := s.db.Preload("BillingType").Preload("Customer").Preload("Customer.Customer").Preload("Admin").Preload("UpdatedBy").First(&result, id).Error; err != nil {
		return nil, err
	}
	return &result, nil
}

// DeleteBilling ลบบิลตาม ID (ใช้ Soft Delete ของ GORM)
func (s *BillingService) DeleteBilling(id uint) error {
	var billing models.Billing
	if err := s.db.First(&billing, id).Error; err != nil {
		return ErrBillingNotFound
	}

	// ป้องกันไม่ให้ลบบิลที่จ่ายแล้ว หรือมีสลิปรอตรวจสอบอยู่ (สถานะ waitcheck)
	// เดิมบล็อกแค่ paid ทำให้ลบบิลที่แนบสลิปรอตรวจได้ แล้วใบแจ้งหนี้จะชี้ไปบิลที่ถูกลบ
	if billing.Status == models.StatusPaid || billing.Status == models.StatusWaitCheck {
		return businessErr("ไม่สามารถลบบิลที่ชำระเงินแล้วหรือกำลังรอการตรวจสอบได้")
	}

	// กันการลบบิลที่ยังมีใบแจ้งหนี้รอดำเนินการค้างอยู่ (ใบจะกลายเป็น dangling ชี้ไปบิลที่ถูกลบ)
	if active, err := s.hasActivePendingInvoice(id); err != nil {
		return errors.New("ไม่สามารถตรวจสอบสถานะใบแจ้งหนี้ของบิลได้")
	} else if active {
		return businessErr("บิลนี้มีใบแจ้งหนี้ที่รอดำเนินการอยู่ กรุณายกเลิกใบแจ้งหนี้ก่อนจึงจะลบบิลได้")
	}

	if err := s.db.Delete(&billing).Error; err != nil {
		return errors.New("ไม่สามารถลบบิลได้")
	}
	return nil
}
