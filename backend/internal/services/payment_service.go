package services

import (
	"errors"
	"gorm.io/gorm"
	"CPE-691015/internal/models"
)

// Sentinel errors — ใช้แยกประเภทความผิดพลาดเพื่อให้ controller ตอบ HTTP status ได้ถูกต้อง
// (เดิม error ทุกชนิดถูกตอบกลับเป็น 500 หมด ทำให้แยก "ไม่มีสิทธิ์" กับ "ระบบพัง" ไม่ออก)
var (
	ErrInvoiceNotFound = errors.New("ไม่พบข้อมูลใบแจ้งหนี้")
	ErrForbidden       = errors.New("ไม่มีสิทธิ์ดำเนินการกับใบแจ้งหนี้นี้")
)

type PaymentService struct {
	db *gorm.DB
}

func NewPaymentService(db *gorm.DB) *PaymentService {
	return &PaymentService{db: db}
}

// CreateInvoice สร้างใบแจ้งหนี้จากรายการบิลที่เลือก
func (s *PaymentService) CreateInvoice(customerID uint, billingIDs []uint, method models.PaymentMethod) (*models.Invoice, error) {
	if len(billingIDs) == 0 {
		return nil, errors.New("กรุณาระบุรายการบิลอย่างน้อย 1 รายการ")
	}

	var invoice models.Invoice

	err := s.db.Transaction(func(tx *gorm.DB) error {
		var totalAmount float64
		var paymentItems []models.PaymentItem

		for _, billingID := range billingIDs {
			var billing models.Billing
			if err := tx.First(&billing, billingID).Error; err != nil {
				return errors.New("ไม่พบข้อมูลบิล")
			}

			// ตรวจสอบสิทธิ์ว่าบิลนี้เป็นของลูกค้ารายนี้หรือไม่
			if billing.CustomerID != customerID {
				return errors.New("บิลนี้ไม่ใช่ของลูกค้าท่านนี้")
			}

			// ตรวจสอบสถานะว่าบิลถูกจ่ายไปแล้วหรือไม่
			if billing.Status == models.StatusPaid {
				return errors.New("บิลนี้ชำระเงินเรียบร้อยแล้ว")
			}

			totalAmount += billing.Amount
			paymentItems = append(paymentItems, models.PaymentItem{
				BillingID: billingID,
			})
		}

		invoice = models.Invoice{
			TotalAmount: totalAmount,
			Status:      models.InvoicePending,
			CustomerID:  customerID,
			Method:      method,
			PaymentItem: paymentItems,
		}

		if err := tx.Create(&invoice).Error; err != nil {
			return errors.New("ไม่สามารถสร้างใบแจ้งหนี้ได้")
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	// ดึงข้อมูลพร้อม Preload เพื่อส่งกลับไปให้หน้าบ้านแสดงผล
	var result models.Invoice
	if err := s.db.Preload("PaymentItem").Preload("PaymentItem.Billing").First(&result, invoice.ID).Error; err != nil {
		return nil, err
	}

	return &result, nil
}

// UploadSlip อัปโหลดสลิปเพื่อแจ้งโอนเงิน
func (s *PaymentService) UploadSlip(invoiceID uint, slipURL string, userID uint, role string) (*models.Invoice, error) {
	var invoice models.Invoice
	if err := s.db.First(&invoice, invoiceID).Error; err != nil {
		return nil, ErrInvoiceNotFound
	}

	// Invoice.CustomerID อ้างถึง User.ID (ดู models.Invoice: Customer *User) จึงเทียบกับ userID จาก JWT ได้ตรง
	if role != string(models.AdminRole) && invoice.CustomerID != userID {
		return nil, ErrForbidden
	}

	if invoice.Status == models.InvoiceSuccess {
		return nil, errors.New("ใบแจ้งหนี้นี้ชำระเงินสำเร็จไปแล้ว")
	}
	if invoice.Status == models.InvoiceCancelled {
		return nil, errors.New("ใบแจ้งหนี้นี้ถูกยกเลิกไปแล้ว ไม่สามารถแนบสลิปได้")
	}

	// กันไม่ให้แนบสลิปกับใบแจ้งหนี้เก่าที่บิลถูกชำระผ่านใบแจ้งหนี้อื่นไปแล้ว
	var paidElsewhereCount int64
	if err := s.db.Model(&models.PaymentItem{}).
		Joins("JOIN billings ON billings.id = payment_items.billing_id").
		Where("payment_items.invoice_id = ? AND billings.status = ?", invoiceID, models.StatusPaid).
		Count(&paidElsewhereCount).Error; err != nil {
		return nil, err
	}
	if paidElsewhereCount > 0 {
		return nil, errors.New("บิลในใบแจ้งหนี้นี้ได้รับการชำระเงินผ่านใบแจ้งหนี้อื่นไปแล้ว")
	}

	err := s.db.Transaction(func(tx *gorm.DB) error {
		invoice.SlipImageUrl = slipURL
		invoice.Status = models.InvoicePending
		
		if err := tx.Save(&invoice).Error; err != nil {
			return errors.New("ไม่สามารถบันทึกข้อมูลสลิปได้")
		}

		// ดึง PaymentItem ทั้งหมดมาอัปเดต Billing เป็น waitcheck (รอตรวจสอบ)
		var items []models.PaymentItem
		if err := tx.Where("invoice_id = ?", invoiceID).Find(&items).Error; err != nil {
			return err
		}

		for _, item := range items {
			if err := tx.Model(&models.Billing{}).Where("id = ?", item.BillingID).Update("status", models.StatusWaitCheck).Error; err != nil {
				return errors.New("ไม่สามารถอัปเดตสถานะบิลได้")
			}
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	var result models.Invoice
	if err := s.db.Preload("PaymentItem").Preload("PaymentItem.Billing").First(&result, invoiceID).Error; err != nil {
		return nil, err
	}

	return &result, nil
}

// ConfirmPayment ยืนยันการชำระเงินโดยผู้ดูแลระบบ (Admin)
func (s *PaymentService) ConfirmPayment(invoiceID uint) (*models.Invoice, error) {
	var invoice models.Invoice
	if err := s.db.First(&invoice, invoiceID).Error; err != nil {
		return nil, errors.New("ไม่พบข้อมูลใบแจ้งหนี้")
	}

	if invoice.Status == models.InvoiceSuccess {
		return nil, errors.New("ใบแจ้งหนี้นี้ชำระเงินสำเร็จไปแล้ว")
	}

	err := s.db.Transaction(func(tx *gorm.DB) error {
		invoice.Status = models.InvoiceSuccess
		if err := tx.Save(&invoice).Error; err != nil {
			return errors.New("ไม่สามารถยืนยันยอดเงินได้")
		}

		// ดึง PaymentItem ทั้งหมดเพื่ออัปเดต Billing เป็น paid (ชำระแล้ว)
		var items []models.PaymentItem
		if err := tx.Where("invoice_id = ?", invoiceID).Find(&items).Error; err != nil {
			return err
		}

		for _, item := range items {
			if err := tx.Model(&models.Billing{}).Where("id = ?", item.BillingID).Update("status", models.StatusPaid).Error; err != nil {
				return errors.New("ไม่สามารถอัปเดตสถานะบิลเป็นชำระเงินแล้วได้")
			}
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	var result models.Invoice
	if err := s.db.Preload("PaymentItem").Preload("PaymentItem.Billing").First(&result, invoiceID).Error; err != nil {
		return nil, err
	}

	return &result, nil
}

// GetCustomerInvoices ดึงประวัติใบแจ้งหนี้ของนักเรียน/ลูกค้า
func (s *PaymentService) GetCustomerInvoices(customerID uint) ([]models.Invoice, error) {
	var invoices []models.Invoice
	err := s.db.Preload("PaymentItem").
		Preload("PaymentItem.Billing").
		Where("customer_id = ?", customerID).
		Find(&invoices).Error
	return invoices, err
}

// RejectPayment ปฏิเสธการชำระเงินโดยผู้ดูแลระบบ (Admin)
func (s *PaymentService) RejectPayment(invoiceID uint) (*models.Invoice, error) {
	var invoice models.Invoice
	if err := s.db.First(&invoice, invoiceID).Error; err != nil {
		return nil, errors.New("ไม่พบข้อมูลใบแจ้งหนี้")
	}

	if invoice.Status == models.InvoiceSuccess {
		return nil, errors.New("ไม่สามารถปฏิเสธใบแจ้งหนี้ที่ชำระเงินสำเร็จแล้วได้")
	}

	err := s.db.Transaction(func(tx *gorm.DB) error {
		invoice.Status = models.InvoiceRejected
		if err := tx.Save(&invoice).Error; err != nil {
			return errors.New("ไม่สามารถบันทึกสถานะปฏิเสธการชำระเงินได้")
		}

		// ดึง PaymentItem ทั้งหมดเพื่อคืนสถานะ Billing เป็น unfunded (ยังไม่ชำระ)
		var items []models.PaymentItem
		if err := tx.Where("invoice_id = ?", invoiceID).Find(&items).Error; err != nil {
			return err
		}

		for _, item := range items {
			if err := tx.Model(&models.Billing{}).Where("id = ?", item.BillingID).Update("status", models.StatusUnfunded).Error; err != nil {
				return errors.New("ไม่สามารถอัปเดตสถานะบิลกลับเป็นยังไม่ชำระได้")
			}
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	var result models.Invoice
	if err := s.db.Preload("PaymentItem").Preload("PaymentItem.Billing").First(&result, invoiceID).Error; err != nil {
		return nil, err
	}

	return &result, nil
}

// CancelInvoice ยกเลิกใบแจ้งหนี้โดยลูกค้าหรือระบบ
func (s *PaymentService) CancelInvoice(invoiceID uint) (*models.Invoice, error) {
	var invoice models.Invoice
	if err := s.db.First(&invoice, invoiceID).Error; err != nil {
		return nil, errors.New("ไม่พบข้อมูลใบแจ้งหนี้")
	}

	if invoice.Status == models.InvoiceSuccess {
		return nil, errors.New("ไม่สามารถยกเลิกใบแจ้งหนี้ที่ชำระเงินสำเร็จแล้วได้")
	}

	err := s.db.Transaction(func(tx *gorm.DB) error {
		invoice.Status = models.InvoiceCancelled
		if err := tx.Save(&invoice).Error; err != nil {
			return errors.New("ไม่สามารถบันทึกสถานะยกเลิกใบแจ้งหนี้ได้")
		}

		// ดึง PaymentItem ทั้งหมดเพื่อคืนสถานะ Billing เป็น unfunded (ยังไม่ชำระ)
		var items []models.PaymentItem
		if err := tx.Where("invoice_id = ?", invoiceID).Find(&items).Error; err != nil {
			return err
		}

		for _, item := range items {
			if err := tx.Model(&models.Billing{}).Where("id = ?", item.BillingID).Update("status", models.StatusUnfunded).Error; err != nil {
				return errors.New("ไม่สามารถอัปเดตสถานะบิลกลับเป็นยังไม่ชำระได้")
			}
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	var result models.Invoice
	if err := s.db.Preload("PaymentItem").Preload("PaymentItem.Billing").First(&result, invoiceID).Error; err != nil {
		return nil, err
	}

	return &result, nil
}
