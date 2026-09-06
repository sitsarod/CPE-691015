package services

import (
	"errors"
	"fmt"
	"log"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"CPE-691015/internal/models"
)

// Sentinel errors — ใช้แยกประเภทความผิดพลาดเพื่อให้ controller ตอบ HTTP status ได้ถูกต้อง
// (เดิม error ทุกชนิดถูกตอบกลับเป็น 500 หมด ทำให้แยก "ไม่มีสิทธิ์" กับ "ระบบพัง" ไม่ออก)
var (
	ErrInvoiceNotFound = errors.New("ไม่พบข้อมูลใบแจ้งหนี้")
	ErrForbidden       = errors.New("ไม่มีสิทธิ์ดำเนินการกับใบแจ้งหนี้นี้")
)

type PaymentService struct {
	db     *gorm.DB
	slipOk *SlipOkService
}

func NewPaymentService(db *gorm.DB, slipOk *SlipOkService) *PaymentService {
	return &PaymentService{db: db, slipOk: slipOk}
}

// CreateInvoice สร้างใบแจ้งหนี้จากรายการบิลที่เลือก
func (s *PaymentService) CreateInvoice(customerID uint, billingIDs []uint, method models.PaymentMethod) (*models.Invoice, error) {
	if len(billingIDs) == 0 {
		return nil, errors.New("กรุณาระบุรายการบิลอย่างน้อย 1 รายการ")
	}

	// ตัดบิล ID ที่ซ้ำออกก่อน กันยอดถูกคิดซ้ำและ PaymentItem ซ้ำ
	// (เดิมวน billingIDs ตรง ๆ ถ้า client ส่ง [5,5] มา ยอดจะเป็น 2 เท่าและได้ item ชี้บิลเดิมสองอัน)
	seen := make(map[uint]struct{}, len(billingIDs))
	uniqueBillingIDs := make([]uint, 0, len(billingIDs))
	for _, id := range billingIDs {
		if _, dup := seen[id]; dup {
			continue
		}
		seen[id] = struct{}{}
		uniqueBillingIDs = append(uniqueBillingIDs, id)
	}
	billingIDs = uniqueBillingIDs

	var invoice models.Invoice

	err := s.db.Transaction(func(tx *gorm.DB) error {
		var totalAmount float64
		var paymentItems []models.PaymentItem

		for _, billingID := range billingIDs {
			var billing models.Billing
			// ล็อกแถวบิล (FOR UPDATE) เพื่อให้คำขอสร้างใบแจ้งหนี้สำหรับบิลเดียวกันที่เข้ามาพร้อมกัน
			// ถูกจัดคิวทีละอัน ไม่งั้นสองคำขอจะอ่านสถานะเดิมพร้อมกันแล้วสร้างใบซ้อนได้ (race)
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&billing, billingID).Error; err != nil {
				return errors.New("ไม่พบข้อมูลบิล")
			}

			// ตรวจสอบสิทธิ์ว่าบิลนี้เป็นของลูกค้ารายนี้หรือไม่
			if billing.CustomerID != customerID {
				return errors.New("บิลนี้ไม่ใช่ของลูกค้าท่านนี้")
			}

			// ออกใบแจ้งหนี้ได้เฉพาะบิลที่ยังไม่ได้เริ่มชำระเท่านั้น
			// paid = จ่ายแล้ว, waitcheck = แนบสลิปรอตรวจอยู่ (ผ่านใบแจ้งหนี้อื่น) → ห้ามออกซ้อน
			switch billing.Status {
			case models.StatusPaid:
				return errors.New("บิลนี้ชำระเงินเรียบร้อยแล้ว")
			case models.StatusWaitCheck:
				return errors.New("บิลนี้มีสลิปรอตรวจสอบการชำระเงินอยู่แล้ว")
			}

			// กันบิลถูกออกใบแจ้งหนี้ซ้อนกับใบที่ยัง active (pending) อยู่
			// ปิดช่องกรณีสร้างใบแจ้งหนี้ใหม่ก่อนที่ใบเดิมจะถูกแนบสลิป (บิลยังเป็น unfunded อยู่)
			var activeInvoiceCount int64
			if err := tx.Model(&models.PaymentItem{}).
				Joins("JOIN invoices ON invoices.id = payment_items.invoice_id").
				Where("payment_items.billing_id = ? AND invoices.status = ?", billingID, models.InvoicePending).
				Count(&activeInvoiceCount).Error; err != nil {
				return err
			}
			if activeInvoiceCount > 0 {
				return errors.New("บิลนี้มีใบแจ้งหนี้ที่รอดำเนินการอยู่แล้ว กรุณาชำระหรือยกเลิกใบเดิมก่อน")
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

	// ตรวจสลิปอัตโนมัติผ่าน SlipOK ถ้าบัญชีธนาคารหลักที่ใช้งานอยู่เปิดใช้งานฟีเจอร์นี้ไว้
	// ตรวจผ่าน + เลขบัญชีปลายทางตรงกัน จะยืนยันการชำระเงินให้ทันที ถ้าตรวจไม่ผ่านหรือเกิดข้อผิดพลาด
	// จะปล่อยให้สถานะยังคงเป็น waitcheck เพื่อรอแอดมินตรวจสอบด้วยตนเองต่อไป
	if s.slipOk != nil && s.slipOk.Enabled() {
		s.autoVerifySlip(invoiceID, slipURL)
	}

	var result models.Invoice
	if err := s.db.Preload("PaymentItem").Preload("PaymentItem.Billing").First(&result, invoiceID).Error; err != nil {
		return nil, err
	}

	// แจ้งแอดมินให้ตรวจสลิป (ยกเว้นกรณี auto-verify ยืนยันไปแล้ว จึงไม่รบกวน)
	if result.Status != models.InvoiceSuccess {
		NotifyAdmins(s.db,
			"slip_uploaded",
			fmt.Sprintf("invoice-%d-%d", invoiceID, time.Now().Unix()),
			"มีสลิปรอตรวจสอบ",
			fmt.Sprintf("ลูกค้าแนบสลิปโอนเงิน ใบแจ้งหนี้ #%d ยอด ฿%.2f", invoiceID, result.TotalAmount),
			"/admin/payment?tab=slips&filter=pending",
			"warning",
		)
	}

	return &result, nil
}

// autoVerifySlip เรียก SlipOK เพื่อตรวจสอบสลิปกับบัญชีธนาคารหลักที่เปิด auto_verify_enabled ไว้
// หากตรวจผ่านและเลขบัญชีปลายทางตรงกันจะยืนยันการชำระเงินให้อัตโนมัติ ข้อผิดพลาดใด ๆ จะถูกปล่อยผ่านเงียบ ๆ
// เพื่อให้ใบแจ้งหนี้ยังคงสถานะรอตรวจสอบไว้ให้แอดมินตรวจด้วยตนเอง
func (s *PaymentService) autoVerifySlip(invoiceID uint, slipURL string) {
	var activeAccount models.BankAccount
	if err := s.db.Where("is_active = ? AND auto_verify_enabled = ?", true, true).First(&activeAccount).Error; err != nil {
		log.Printf("[SlipOK] invoice #%d: ไม่มีบัญชีธนาคารที่ is_active และ auto_verify_enabled เปิดพร้อมกัน ข้ามการตรวจอัตโนมัติ (%v)", invoiceID, err)
		return
	}

	var invoice models.Invoice
	if err := s.db.First(&invoice, invoiceID).Error; err != nil {
		log.Printf("[SlipOK] invoice #%d: ดึงข้อมูลใบแจ้งหนี้ไม่สำเร็จ: %v", invoiceID, err)
		return
	}

	data, err := s.slipOk.VerifySlip(slipURL, invoice.TotalAmount)
	if err != nil {
		log.Printf("[SlipOK] invoice #%d: เรียก SlipOK ไม่สำเร็จ/ถูกปฏิเสธ: %v", invoiceID, err)
		return
	}
	if !data.Success {
		log.Printf("[SlipOK] invoice #%d: SlipOK ตอบกลับ success=false, message=%q", invoiceID, data.Message)
		return
	}

	if !MatchesBankAccount(data, activeAccount.AccountNo) {
		log.Printf("[SlipOK] invoice #%d: ผู้รับปลายทางไม่ตรงกัน (account=%q, proxy=%q, บัญชีในระบบ=%q)",
			invoiceID, data.Receiver.Account.Value, data.Receiver.Proxy.Value, activeAccount.AccountNo)
		return
	}

	// กันสลิปซ้ำ: ถ้า transRef นี้เคยถูกใช้กับใบแจ้งหนี้อื่นไปแล้ว ห้ามยืนยันซ้ำ
	// (ไม่ฝากไว้กับ SlipOK อย่างเดียว เผื่อกรณี log ฝั่ง SlipOK พลาดหรือถูก reset)
	// ตัว partial unique index บน invoices.transaction_id เป็นแนวป้องกันสุดท้ายกันกรณี race
	if data.TransRef != "" {
		var dupCount int64
		if err := s.db.Model(&models.Invoice{}).
			Where("transaction_id = ? AND id <> ?", data.TransRef, invoiceID).
			Count(&dupCount).Error; err != nil {
			log.Printf("[SlipOK] invoice #%d: ตรวจสอบสลิปซ้ำไม่สำเร็จ: %v", invoiceID, err)
			return
		}
		if dupCount > 0 {
			log.Printf("[SlipOK] invoice #%d: สลิปนี้ (transRef=%s) ถูกใช้ยืนยันการชำระเงินกับใบแจ้งหนี้อื่นไปแล้ว ปฏิเสธการยืนยันอัตโนมัติ", invoiceID, data.TransRef)
			return
		}
	}

	// ถ้าบันทึก transaction_id ไม่สำเร็จ (เช่นโดน unique index จาก race กับอีก request) ต้องหยุด ไม่ยืนยันการชำระเงิน
	if err := s.db.Model(&models.Invoice{}).Where("id = ?", invoiceID).Update("transaction_id", data.TransRef).Error; err != nil {
		log.Printf("[SlipOK] invoice #%d: บันทึก transaction_id ไม่สำเร็จ (อาจเป็นสลิปซ้ำ): %v", invoiceID, err)
		return
	}
	if _, err := s.ConfirmPayment(invoiceID); err != nil {
		log.Printf("[SlipOK] invoice #%d: ตรวจสลิปผ่านแล้วแต่ ConfirmPayment ล้มเหลว: %v", invoiceID, err)
		return
	}
	log.Printf("[SlipOK] invoice #%d: ตรวจสลิปผ่านและยืนยันการชำระเงินอัตโนมัติสำเร็จ (transRef=%s)", invoiceID, data.TransRef)

	// แจ้งแอดมินทุกคนว่ามีการชำระเงินสำเร็จโดยระบบตรวจสลิปอัตโนมัติ
	// (ConfirmPayment ด้านบนแจ้งฝั่งลูกค้าไปแล้ว — อันนี้เพิ่มฝั่งแอดมินเฉพาะเคส auto-verify)
	NotifyAdmins(s.db,
		"payment_auto_verified",
		fmt.Sprintf("invoice-%d-autoverify", invoiceID),
		"มีการชำระเงินสำเร็จ (auto-verify)",
		fmt.Sprintf("ใบแจ้งหนี้ #%d ยอด ฿%.2f ได้รับการยืนยันอัตโนมัติโดยระบบตรวจสลิป", invoiceID, invoice.TotalAmount),
		"/admin/payment?tab=slips&filter=approved",
		"success",
	)
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

		billingIDs := make([]uint, 0, len(items))
		for _, item := range items {
			if err := tx.Model(&models.Billing{}).Where("id = ?", item.BillingID).Update("status", models.StatusPaid).Error; err != nil {
				return errors.New("ไม่สามารถอัปเดตสถานะบิลเป็นชำระเงินแล้วได้")
			}
			billingIDs = append(billingIDs, item.BillingID)
		}

		// ปลดล็อกคอร์สของลูกค้าใหม่ที่รอชำระเงินอยู่ ให้เริ่มเรียนได้ พร้อมเริ่มเดินนาฬิกา
		//
		// ลูกค้าใหม่จะถูกตั้งเป็น awaiting_payment ตอนแอดมินอนุมัติ (ดู ApproveEnrollment)
		// และจะได้ตารางเรียนก็ต่อเมื่อบิลที่ผูกไว้ถูกยืนยันการชำระเงินแล้วเท่านั้น
		//
		// ทำใน transaction เดียวกับการอัปเดตบิล เพื่อไม่ให้เกิดกรณีบิลจ่ายแล้ว
		// แต่ enrollment ยังค้างที่ awaiting_payment
		if len(billingIDs) > 0 {
			var awaiting []models.Enrollment
			if err := tx.Preload("Package").
				Where("billing_id IN ? AND status = ?", billingIDs, models.EnrollmentStatusAwaitingPayment).
				Find(&awaiting).Error; err != nil {
				return errors.New("ไม่สามารถดึงรายการคอร์สที่รอชำระเงินได้")
			}

			for i := range awaiting {
				if err := activateEnrollment(tx, &awaiting[i], awaiting[i].Package); err != nil {
					return err
				}
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

	// แจ้งลูกค้าว่าการชำระเงินได้รับการยืนยันแล้ว (result.CustomerID = users.id)
	CreateNotification(s.db, result.CustomerID,
		"payment_confirmed",
		fmt.Sprintf("invoice-%d-confirmed", invoiceID),
		"ชำระเงินสำเร็จ",
		fmt.Sprintf("การชำระเงินใบแจ้งหนี้ #%d ยอด ฿%.2f ได้รับการยืนยันแล้ว", invoiceID, result.TotalAmount),
		"/customer/payment?tab=invoices",
		"success",
	)

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

	// แจ้งลูกค้าว่าสลิปไม่ผ่าน ให้อัปโหลดใหม่
	CreateNotification(s.db, result.CustomerID,
		"payment_rejected",
		fmt.Sprintf("invoice-%d-rejected-%d", invoiceID, time.Now().Unix()),
		"สลิปไม่ผ่านการตรวจสอบ",
		fmt.Sprintf("สลิปใบแจ้งหนี้ #%d ไม่ผ่านการตรวจสอบ กรุณาตรวจสอบและอัปโหลดสลิปใหม่", invoiceID),
		"/customer/payment?tab=billings",
		"danger",
	)

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
