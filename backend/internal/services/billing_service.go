package services

import (
	"errors"
	"fmt"
	"time"

	"CPE-691015/internal/models"
	"gorm.io/gorm"
)

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

type BillingService struct {
	db *gorm.DB
}

func NewBillingService(db *gorm.DB) *BillingService {
	return &BillingService{db: db}
}

// CreateSingleBilling สร้างบิลเรียกเก็บเงินรายคน
func (s *BillingService) CreateSingleBilling(customerID uint, adminID uint, billingTypeID uint, description string, amount float64, dueDate time.Time) error {
	// ตรวจสอบว่า UserID (customerID) มีตัวตนอยู่จริง
	var user models.User
	if err := s.db.First(&user, customerID).Error; err != nil {
		return errors.New("ไม่พบข้อมูลผู้ใช้ของนักเรียน")
	}

	// ตรวจสอบว่า BillingTypeID มีอยู่จริง
	var bType models.BillingType
	if err := s.db.First(&bType, billingTypeID).Error; err != nil {
		return errors.New("ไม่พบข้อมูลประเภทการเรียกเก็บเงิน")
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
		return errors.New("กรุณาระบุรายชื่อนักเรียนอย่างน้อย 1 คน")
	}

	// ตรวจสอบว่า BillingTypeID มีอยู่จริง
	var bType models.BillingType
	if err := s.db.First(&bType, billingTypeID).Error; err != nil {
		return errors.New("ไม่พบข้อมูลประเภทการเรียกเก็บเงิน")
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
				return errors.New("พบรหัสนักเรียนที่ไม่ถูกต้องในระบบ")
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
		return errors.New("รูปแบบวันที่ไม่ถูกต้อง (ตัวอย่าง: YYYY-MM-DD)")
	}
	nextDay := parsedDate.AddDate(0, 0, 1)

	// ตรวจสอบว่า BillingTypeID มีอยู่จริง
	var bType models.BillingType
	if err := s.db.First(&bType, billingTypeID).Error; err != nil {
		return errors.New("ไม่พบข้อมูลประเภทการเรียกเก็บเงิน")
	}

	// ดึงประวัติการเข้าเรียน (StudentAttendance) ของ Course นี้ในวันที่ระบุ
	var attendances []models.StudentAttendance
	err = s.db.Preload("Enrollment").
		Preload("Enrollment.Customer").
		Joins("JOIN enrollments ON enrollments.id = student_attendances.enrollment_id").
		Joins("JOIN packages ON packages.id = enrollments.package_id").
		Where("packages.course_id = ?", courseID).
		Where("student_attendances.check_in_time >= ? AND student_attendances.check_in_time < ?", parsedDate, nextDay).
		Where("student_attendances.status = ?", models.AttendanceStatusPresent).
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
		return errors.New("ไม่พบนักเรียนเช็คอินเข้าเรียนในวิชาและวันที่ระบุ")
	}

	// คำนวณยอดเงินรวมและยอดหารเฉลี่ย
	totalAmount := hourlyRate * hours
	splitAmount := totalAmount / float64(len(uniqueUserIDs))

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
	var billings []models.Billing
	err := s.db.Preload("BillingType").
		Preload("Customer").
		Preload("Customer.Customer").
		Preload("Admin").
		Preload("PaymentItem").
		Preload("PaymentItem.Invoice").
		Order("id DESC").
		Find(&billings).Error
	return billings, err
}

// GetBillingsByCustomerID ดึงรายการบิลทั้งหมดของลูกค้ารายเจาะจง (สำหรับ Customer)
func (s *BillingService) GetBillingsByCustomerID(customerID uint) ([]models.Billing, error) {
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

// UpdateBilling แก้ไขบิลโดยสามารถอัปเดตคำอธิบาย ยอดเงิน Due Date หรือสถานะ
func (s *BillingService) UpdateBilling(id uint, input models.Billing) (*models.Billing, error) {
	var billing models.Billing
	if err := s.db.First(&billing, id).Error; err != nil {
		return nil, errors.New("ไม่พบข้อมูลบิลที่ต้องการแก้ไข")
	}

	// บิลที่ชำระเงินแล้ว หรือรอแอดมินตรวจเช็ค ไม่ควรยอมให้แก้ไขข้อมูลทางการเงิน
	if billing.Status == models.StatusPaid || billing.Status == models.StatusWaitCheck {
		return nil, errors.New("ไม่สามารถแก้ไขบิลที่ชำระเงินแล้วหรือกำลังรอการตรวจสอบได้")
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

	if len(updateData) > 0 {
		if err := s.db.Model(&billing).Updates(updateData).Error; err != nil {
			return nil, errors.New("ไม่สามารถบันทึกการแก้ไขบิลได้")
		}
	}

	// โหลดความสัมพันธ์กลับมาส่งผลลัพธ์
	var result models.Billing
	if err := s.db.Preload("BillingType").Preload("Customer").Preload("Customer.Customer").Preload("Admin").First(&result, id).Error; err != nil {
		return nil, err
	}
	return &result, nil
}

// DeleteBilling ลบบิลตาม ID (ใช้ Soft Delete ของ GORM)
func (s *BillingService) DeleteBilling(id uint) error {
	var billing models.Billing
	if err := s.db.First(&billing, id).Error; err != nil {
		return errors.New("ไม่พบข้อมูลบิลที่ต้องการลบ")
	}

	// ป้องกันไม่ให้ลบบิลที่จ่ายแล้ว
	if billing.Status == models.StatusPaid {
		return errors.New("ไม่สามารถลบบิลที่ชำระเงินเรียบร้อยแล้วได้")
	}

	if err := s.db.Delete(&billing).Error; err != nil {
		return errors.New("ไม่สามารถลบบิลได้")
	}
	return nil
}

