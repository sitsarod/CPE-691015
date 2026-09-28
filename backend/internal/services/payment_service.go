package services

import (
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"CPE-691015/internal/models"
)

// Sentinel errors — ใช้แยกประเภทความผิดพลาดเพื่อให้ controller ตอบ HTTP status ได้ถูกต้อง
// (เดิม error ทุกชนิดถูกตอบกลับเป็น 500 หมด ทำให้แยก "ไม่มีสิทธิ์" กับ "ระบบพัง" ไม่ออก)
var (
	ErrInvoiceNotFound = errors.New("ไม่พบข้อมูลใบแจ้งหนี้")
	ErrBillingNotFound = errors.New("ไม่พบข้อมูลบิล")
	ErrForbidden       = errors.New("ไม่มีสิทธิ์ดำเนินการกับใบแจ้งหนี้นี้")
)

// BusinessError คือความผิดพลาดจาก "กติกาทางธุรกิจ/สถานะไม่พร้อม" (เช่น บิลชำระแล้ว, มีใบค้างอยู่,
// วิธีชำระเงินไม่ถูกต้อง) ไม่ใช่ระบบพัง — controller จะ map เป็น HTTP 409 (Conflict)
// เพื่อให้หน้าบ้านแยกออกจาก 500 ที่แปลว่าเซิร์ฟเวอร์มีปัญหาจริง แล้วแสดงข้อความให้ผู้ใช้แก้ได้ถูก
type BusinessError struct{ Msg string }

func (e *BusinessError) Error() string { return e.Msg }

// businessErr ห่อข้อความกติกาทางธุรกิจให้เป็น *BusinessError (ใช้ errors.As จับที่ controller)
func businessErr(msg string) error { return &BusinessError{Msg: msg} }

type PaymentService struct {
	db     *gorm.DB
	slipOk *SlipOkService
	// cloudinaryCloudName = ชื่อ cloud ของสถาบัน (ตั้งเมื่อ deploy ใช้ Cloudinary เก็บสลิป)
	// ใช้อนุญาต slip_url ที่เป็นของ Cloudinary เราเองเพิ่มจากไฟล์ local /uploads
	cloudinaryCloudName string
}

func NewPaymentService(db *gorm.DB, slipOk *SlipOkService) *PaymentService {
	return &PaymentService{db: db, slipOk: slipOk}
}

// WithCloudinaryCloudName บอก service ว่า cloud ของสถาบันชื่ออะไร เพื่อรับ slip_url จาก Cloudinary
// (เรียกตอน wire router เมื่อ Cloudinary ถูกตั้งค่า) คืน service ตัวเดิมเพื่อ chain ต่อได้
func (s *PaymentService) WithCloudinaryCloudName(name string) *PaymentService {
	s.cloudinaryCloudName = name
	return s
}

// stalePendingInvoiceTTL คือระยะเวลาที่ยอมให้ใบแจ้งหนี้ค้างสถานะ pending โดย "ยังไม่แนบสลิป"
// ก่อนถือว่าลูกค้าละทิ้งใบนั้นแล้ว จึงปิดใบให้อัตโนมัติเพื่อปลดล็อกบิลให้ออกใบใหม่ได้
const stalePendingInvoiceTTL = 3 * 24 * time.Hour

// slipAmountEpsilon เผื่อความคลาดเคลื่อนทศนิยมตอนเทียบยอดเงินจากสลิป (หน่วยบาท)
const slipAmountEpsilon = 0.01

// validateSlipURL บังคับให้ slip_url ต้องเป็นไฟล์ที่อัปโหลดผ่านระบบเท่านั้น
//
// slip_url มาจาก client ได้โดยตรง ถ้าไม่ตรวจ ผู้ใช้จะส่ง URL ภายนอกที่ตัวเอง host เข้ามาได้:
//   - หลักฐานการเงินไม่ immutable (สลับ/ลบรูปทีหลังได้หลังแอดมินอนุมัติ = ทำลาย audit trail)
//   - หน้าแอดมิน render เป็น <img src> ทำให้เบราว์เซอร์แอดมินยิงไปเครื่องผู้โจมตี (leak IP/UA, ยัดรูปปลอม)
//
// รับได้สองแหล่งตามที่ระบบอัปจริง (ดู ExpenseController.UploadFileHandler):
//   1. ไฟล์ในเครื่อง — path มี "/uploads/"
//   2. Cloudinary ของสถาบัน — host เป็น res.cloudinary.com ใต้ cloud name ที่ตั้งค่าไว้เท่านั้น
//      (ผูกกับ cloud name เพื่อกันผู้โจมตีเอา Cloudinary account ของตัวเองมา host สลิปปลอม)
func (s *PaymentService) validateSlipURL(slipURL string) error {
	if strings.Contains(slipURL, "/uploads/") {
		return nil
	}
	// ใช้ตัวตรวจเข้มตัวเดียวกับตอน fetch สลิปมาตรวจ (parse host/scheme/path) กัน URL หลอก
	if isOwnCloudinaryURL(slipURL, s.cloudinaryCloudName) {
		return nil
	}
	return businessErr("ที่อยู่สลิปไม่ถูกต้อง ต้องเป็นไฟล์ที่อัปโหลดผ่านระบบเท่านั้น")
}

// ExpireStalePendingInvoices ปิดใบแจ้งหนี้ที่ค้าง pending และยังไม่แนบสลิปเกินกำหนด (best-effort)
//
// เดิมถ้าลูกค้าสร้างใบแจ้งหนี้แล้วเปลี่ยนใจ/หายไปโดยไม่ยกเลิก บิลในใบนั้นจะถูกล็อกไม่ให้ออกใบใหม่
// ตลอดไป (CreateInvoice บล็อกบิลที่มีใบ pending ค้างอยู่) — ตัวนี้เป็นทางออกอัตโนมัติของ dead-end นั้น
//
// ปิดเฉพาะใบที่ "ยังไม่แนบสลิป" เท่านั้น — ใบที่แนบสลิปแล้ว (บิลเป็น waitcheck) ต้องรอแอดมินตรวจ ห้ามปิดเอง
// บิลของใบที่ยังไม่แนบสลิปยังเป็น unfunded/overdue อยู่แล้ว จึงไม่ต้องแตะสถานะบิล
func (s *PaymentService) ExpireStalePendingInvoices() (int64, error) {
	cutoff := time.Now().Add(-stalePendingInvoiceTTL)
	res := s.db.Model(&models.Invoice{}).
		Where("status = ? AND (slip_image_url = '' OR slip_image_url IS NULL) AND created_at < ?",
			models.InvoicePending, cutoff).
		Update("status", models.InvoiceExpired)
	return res.RowsAffected, res.Error
}

// sweepStalePendingInvoices เรียก ExpireStalePendingInvoices แบบ best-effort ก่อนออกใบใหม่/อ่านรายการใบ
// เพื่อให้สถานะตรงกับความจริงเสมอ แม้ไม่มี background job (ระบบใช้ lazy sweep แบบเดียวกับบิลเกินกำหนด)
func (s *PaymentService) sweepStalePendingInvoices() {
	if _, err := s.ExpireStalePendingInvoices(); err != nil {
		log.Printf("[payment] ปิดใบแจ้งหนี้ค้างที่หมดอายุไม่สำเร็จ: %v", err)
	}
}

// CreateInvoice สร้างใบแจ้งหนี้จากรายการบิลที่เลือก
func (s *PaymentService) CreateInvoice(customerID uint, billingIDs []uint, method models.PaymentMethod) (*models.Invoice, error) {
	if len(billingIDs) == 0 {
		return nil, businessErr("กรุณาระบุรายการบิลอย่างน้อย 1 รายการ")
	}

	// รับเฉพาะวิธีชำระเงินที่ระบบรองรับเท่านั้น (เดิมรับ string อะไรก็ได้แล้วเก็บลง DB ตรง ๆ)
	switch method {
	case models.MethodQR, models.MethodBankTransfer, models.MethodCard, models.MethodCash:
	default:
		return nil, businessErr("วิธีการชำระเงินไม่ถูกต้อง")
	}

	// ปิดใบแจ้งหนี้เก่าที่ค้าง pending และหมดอายุก่อน เพื่อปลดล็อกบิลที่ลูกค้าเคยสร้างใบแล้วทิ้งไว้
	// (ไม่งั้นจะเจอ "บิลนี้มีใบแจ้งหนี้ที่รอดำเนินการอยู่แล้ว" ทั้งที่ใบเก่าถูกทิ้งไปนานแล้ว)
	s.sweepStalePendingInvoices()

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
				return ErrBillingNotFound
			}

			// ตรวจสอบสิทธิ์ว่าบิลนี้เป็นของลูกค้ารายนี้หรือไม่
			if billing.CustomerID != customerID {
				return ErrForbidden
			}

			// ออกใบแจ้งหนี้ได้เฉพาะบิลที่ยังไม่ได้เริ่มชำระเท่านั้น
			// paid = จ่ายแล้ว, waitcheck = แนบสลิปรอตรวจอยู่ (ผ่านใบแจ้งหนี้อื่น) → ห้ามออกซ้อน
			switch billing.Status {
			case models.StatusPaid:
				return businessErr("บิลนี้ชำระเงินเรียบร้อยแล้ว")
			case models.StatusWaitCheck:
				return businessErr("บิลนี้มีสลิปรอตรวจสอบการชำระเงินอยู่แล้ว")
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
				return businessErr("บิลนี้มีใบแจ้งหนี้ที่รอดำเนินการอยู่แล้ว กรุณาชำระหรือยกเลิกใบเดิมก่อน")
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
	// slip_url มาจาก client โดยตรง ต้องบังคับให้เป็นไฟล์ในระบบก่อนเก็บ (กัน SSRF/audit ปลอม)
	if err := s.validateSlipURL(slipURL); err != nil {
		return nil, err
	}

	var invoice models.Invoice
	if err := s.db.First(&invoice, invoiceID).Error; err != nil {
		return nil, ErrInvoiceNotFound
	}

	// Invoice.CustomerID อ้างถึง User.ID (ดู models.Invoice: Customer *User) จึงเทียบกับ userID จาก JWT ได้ตรง
	if role != string(models.AdminRole) && invoice.CustomerID != userID {
		return nil, ErrForbidden
	}

	// อนุญาตแนบสลิปเฉพาะใบที่ยัง "มีชีวิต" อยู่ (pending = ยังไม่ตัดสิน, rejected = ให้ส่งสลิปใหม่ตามดีไซน์)
	// ปิดกั้นสถานะ terminal ทุกตัว ไม่ให้ชุบชีวิตใบที่จบไปแล้วกลับมา pending:
	//   - success   = จ่ายสำเร็จแล้ว
	//   - cancelled = ลูกค้ายกเลิกเอง
	//   - expired   = ระบบปิดอัตโนมัติเพราะทิ้งค้างไว้เกินกำหนด (บิลกลับไปพร้อมออกใบใหม่แล้ว)
	if invoice.Status == models.InvoiceSuccess {
		return nil, businessErr("ใบแจ้งหนี้นี้ชำระเงินสำเร็จไปแล้ว")
	}
	if invoice.Status == models.InvoiceCancelled {
		return nil, businessErr("ใบแจ้งหนี้นี้ถูกยกเลิกไปแล้ว ไม่สามารถแนบสลิปได้")
	}
	if invoice.Status == models.InvoiceExpired {
		return nil, businessErr("ใบแจ้งหนี้นี้หมดอายุแล้ว กรุณาสร้างใบแจ้งหนี้ใหม่เพื่อชำระเงิน")
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
		return nil, businessErr("บิลในใบแจ้งหนี้นี้ได้รับการชำระเงินผ่านใบแจ้งหนี้อื่นไปแล้ว")
	}

	// เลือกบัญชีปลายทางที่ใช้งานอยู่ "ครั้งเดียว" แล้วใช้ทั้งการ snapshot และการตรวจสลิปอัตโนมัติ
	// จากบัญชีเดียวกันนี้ — กันกรณีบันทึกว่าเงินเข้าบัญชีหนึ่ง แต่ไปตรวจ (match) กับอีกบัญชี
	// หากวันใดมีบัญชี is_active พร้อมกันหลายใบ (ปกติระบบบังคับให้ active ได้ทีละใบ)
	//
	// snapshot เก็บไว้กับใบแจ้งหนี้เพื่อให้แอดมินเห็นว่าเงินเข้าบัญชีไหน แม้ภายหลังบัญชีจะถูกแก้/ปิดก็ตาม
	var receivingAccount *models.BankAccount
	var activeAccount models.BankAccount
	if err := s.db.Where("is_active = ?", true).Order("id ASC").First(&activeAccount).Error; err == nil {
		receivingAccount = &activeAccount
		invoice.ReceivingBankName = activeAccount.BankName
		invoice.ReceivingAccountNo = activeAccount.AccountNo
	}

	err := s.db.Transaction(func(tx *gorm.DB) error {
		invoice.SlipImageUrl = slipURL
		invoice.Status = models.InvoicePending

		// แนบสลิปใหม่ = เริ่มการตรวจรอบใหม่ ล้างผลตรวจอัตโนมัติเดิมทิ้ง
		// กันกรณีส่งสลิปใหม่ทับใบที่เคยถูกปฏิเสธ แล้วแอดมินเห็น verdict เก่าค้างอยู่จนตัดสินผิด
		invoice.SlipOkChecked = false
		invoice.SlipOkPassed = false
		invoice.SlipOkMessage = ""

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

	// ตรวจสลิปอัตโนมัติผ่าน SlipOK เฉพาะเมื่อบัญชีปลายทางที่ลูกค้าโอนเข้า (ตัวที่ snapshot ไว้ข้างบน)
	// เปิดฟีเจอร์นี้ไว้ ตรวจผ่าน + เลขบัญชีปลายทางตรงกัน จะยืนยันการชำระเงินให้ทันที ถ้าตรวจไม่ผ่าน
	// หรือเกิดข้อผิดพลาด จะปล่อยให้สถานะยังคงเป็น waitcheck เพื่อรอแอดมินตรวจสอบด้วยตนเองต่อไป
	if receivingAccount != nil && receivingAccount.AutoVerifyEnabled && s.slipOk != nil && s.slipOk.Enabled() {
		s.autoVerifySlip(invoiceID, slipURL, receivingAccount)
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

// autoVerifySlip เรียก SlipOK เพื่อตรวจสอบสลิปกับบัญชีปลายทาง account (บัญชีเดียวกับที่ snapshot ไว้
// ตอนแนบสลิป และเปิด auto_verify_enabled แล้ว — ผู้เรียกเป็นคนคัดกรองมาให้) หากตรวจผ่านและเลขบัญชี
// ปลายทางตรงกันจะยืนยันการชำระเงินให้อัตโนมัติ ข้อผิดพลาดใด ๆ จะถูกปล่อยผ่านเงียบ ๆ เพื่อให้ใบแจ้งหนี้
// ยังคงสถานะรอตรวจสอบไว้ให้แอดมินตรวจด้วยตนเอง
//
// รับ account เข้ามาแทนการ query เองซ้ำ เพื่อให้ "บัญชีที่บันทึกว่าเงินเข้า" กับ "บัญชีที่เอาไปตรวจ match"
// เป็นใบเดียวกันเสมอ (เดิม snapshot กับ auto-verify query คนละเงื่อนไข อาจได้คนละบัญชีถ้ามีหลาย active)
func (s *PaymentService) autoVerifySlip(invoiceID uint, slipURL string, account *models.BankAccount) {
	if account == nil {
		return
	}
	activeAccount := *account

	var invoice models.Invoice
	if err := s.db.First(&invoice, invoiceID).Error; err != nil {
		log.Printf("[SlipOK] invoice #%d: ดึงข้อมูลใบแจ้งหนี้ไม่สำเร็จ: %v", invoiceID, err)
		return
	}

	data, err := s.slipOk.VerifySlip(slipURL, invoice.TotalAmount)
	if err != nil {
		// ตรวจแล้วแต่ไม่ผ่าน/ยิงไม่ได้ — บันทึกเหตุผลไว้ให้แอดมินเห็น
		s.recordSlipOk(invoiceID, false, err.Error())
		log.Printf("[SlipOK] invoice #%d: เรียก SlipOK ไม่สำเร็จ/ถูกปฏิเสธ: %v", invoiceID, err)
		return
	}
	if !data.Success {
		s.recordSlipOk(invoiceID, false, data.Message)
		log.Printf("[SlipOK] invoice #%d: SlipOK ตอบกลับ success=false, message=%q", invoiceID, data.Message)
		return
	}

	// ตรวจยอดเงินซ้ำเองอีกชั้น — แม้ส่ง expectedAmount ให้ SlipOK ตรวจแล้ว แต่กันกรณี SlipOK คืน
	// success โดยยอดบนสลิปน้อยกว่ายอดบิล (เช่น API เปลี่ยน semantics ของพารามิเตอร์ amount ในอนาคต)
	// จ่ายเท่ากับหรือมากกว่ายอดบิลถือว่าผ่าน · จ่ายขาดห้ามยืนยันอัตโนมัติ ปล่อยให้แอดมินตรวจเอง
	if data.Amount+slipAmountEpsilon < invoice.TotalAmount {
		s.recordSlipOk(invoiceID, false, fmt.Sprintf("ยอดโอนบนสลิป (%.2f บาท) น้อยกว่ายอดที่ต้องชำระ (%.2f บาท)", data.Amount, invoice.TotalAmount))
		log.Printf("[SlipOK] invoice #%d: ยอดโอนน้อยกว่ายอดบิล (slip=%.2f, invoice=%.2f) ข้ามการยืนยันอัตโนมัติ", invoiceID, data.Amount, invoice.TotalAmount)
		return
	}

	if !MatchesBankAccount(data, activeAccount.AccountNo, activeAccount.PromptPayID) {
		s.recordSlipOk(invoiceID, false, "ยอดโอนถูกต้อง แต่บัญชีปลายทางบนสลิปไม่ตรงกับบัญชีรับเงินของสถาบัน")
		log.Printf("[SlipOK] invoice #%d: ผู้รับปลายทางไม่ตรงกัน (account=%q, proxy=%q, บัญชีในระบบ=%q, พร้อมเพย์=%q)",
			invoiceID, data.Receiver.Account.Value, data.Receiver.Proxy.Value, activeAccount.AccountNo, activeAccount.PromptPayID)
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
			s.recordSlipOk(invoiceID, false, "ตรวจสอบสลิปซ้ำไม่สำเร็จ")
			log.Printf("[SlipOK] invoice #%d: ตรวจสอบสลิปซ้ำไม่สำเร็จ: %v", invoiceID, err)
			return
		}
		if dupCount > 0 {
			s.recordSlipOk(invoiceID, false, "สลิปนี้ถูกใช้ยืนยันการชำระเงินกับใบแจ้งหนี้อื่นไปแล้ว")
			log.Printf("[SlipOK] invoice #%d: สลิปนี้ (transRef=%s) ถูกใช้ยืนยันการชำระเงินกับใบแจ้งหนี้อื่นไปแล้ว ปฏิเสธการยืนยันอัตโนมัติ", invoiceID, data.TransRef)
			return
		}
	}

	// ถ้าบันทึก transaction_id ไม่สำเร็จ (เช่นโดน unique index จาก race กับอีก request) ต้องหยุด ไม่ยืนยันการชำระเงิน
	if err := s.db.Model(&models.Invoice{}).Where("id = ?", invoiceID).Update("transaction_id", data.TransRef).Error; err != nil {
		s.recordSlipOk(invoiceID, false, "บันทึกเลขอ้างอิงสลิปไม่สำเร็จ (อาจเป็นสลิปซ้ำ)")
		log.Printf("[SlipOK] invoice #%d: บันทึก transaction_id ไม่สำเร็จ (อาจเป็นสลิปซ้ำ): %v", invoiceID, err)
		return
	}

	// ตรวจผ่านครบทุกเงื่อนไข — บันทึกผล "ผ่าน" ก่อนยืนยัน (ConfirmPayment โหลดใบเดิมต่อ จึงเก็บผลไว้)
	s.recordSlipOk(invoiceID, true, "ยอดและเวลาโอนตรงกับบิล ระบบยืนยันการชำระเงินอัตโนมัติแล้ว")

	// ยืนยันอัตโนมัติโดยระบบ — ไม่มีแอดมินเป็นผู้กด จึงส่ง confirmedBy = nil
	if _, err := s.ConfirmPayment(invoiceID, nil); err != nil {
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

// recordSlipOk บันทึกผลตรวจสลิปอัตโนมัติ (SlipOK) ลงใบแจ้งหนี้ เพื่อให้แอดมินเห็นตอนตรวจด้วยตนเอง
// checked จะเป็น true เสมอเมื่อฟังก์ชันนี้ถูกเรียก (แปลว่า SlipOK ได้ตรวจใบนี้แล้ว)
func (s *PaymentService) recordSlipOk(invoiceID uint, passed bool, message string) {
	if err := s.db.Model(&models.Invoice{}).Where("id = ?", invoiceID).Updates(map[string]interface{}{
		"slip_ok_checked": true,
		"slip_ok_passed":  passed,
		"slip_ok_message": message,
	}).Error; err != nil {
		log.Printf("[SlipOK] invoice #%d: บันทึกผลตรวจสลิปไม่สำเร็จ: %v", invoiceID, err)
	}
}

// ConfirmPayment ยืนยันการชำระเงินโดยผู้ดูแลระบบ (Admin)
// confirmedByID = users.id ของแอดมินที่กดอนุมัติ (nil = ระบบยืนยันอัตโนมัติผ่าน SlipOK)
func (s *PaymentService) ConfirmPayment(invoiceID uint, confirmedByID *uint) (*models.Invoice, error) {
	return s.confirmPayment(invoiceID, confirmedByID, nil)
}

// ConfirmCashPayment ยืนยันว่าลูกค้าชำระด้วย "เงินสด" แล้วปิดบิลให้ (Admin)
//
// ต่างจาก ConfirmPayment ตรงที่บังคับเขียนวิธีชำระเงินเป็น cash ทับของเดิม —
// จำเป็นเพราะแอดมินกดปุ่มนี้ได้แม้บนใบแจ้งหนี้ที่ลูกค้าสร้างไว้ด้วยวิธีอื่น (เช่น PromptPay QR)
// แล้วแนบสลิปรอตรวจอยู่ ถ้าไม่ทับ ใบจะยังโชว์ว่าจ่ายด้วย QR ทั้งที่แอดมินยืนยันว่ารับเป็นเงินสด
func (s *PaymentService) ConfirmCashPayment(invoiceID uint, confirmedByID *uint) (*models.Invoice, error) {
	cash := models.MethodCash
	return s.confirmPayment(invoiceID, confirmedByID, &cash)
}

// confirmPayment คือ core ของการยืนยันการชำระเงิน ใช้ร่วมกันระหว่างยืนยันปกติกับยืนยันเงินสด
// overrideMethod != nil = เขียนทับวิธีชำระเงินของใบก่อนปิด (ใช้ตอนยืนยันเงินสด) · nil = คงวิธีเดิมไว้
func (s *PaymentService) confirmPayment(invoiceID uint, confirmedByID *uint, overrideMethod *models.PaymentMethod) (*models.Invoice, error) {
	var invoice models.Invoice

	err := s.db.Transaction(func(tx *gorm.DB) error {
		// ล็อกแถวใบแจ้งหนี้ก่อนอ่านสถานะ กันการยืนยันซ้อนกับ reject/cancel หรือ auto-verify
		// ที่เข้ามาพร้อมกัน (เดิมอ่านสถานะนอก tx เป็น check-then-act จึงเกิด race ได้:
		// สองคำขออ่าน pending พร้อมกันแล้วเดินต่อทั้งคู่ จนบิล/enrollment ถูกอัปเดตซ้อน)
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&invoice, invoiceID).Error; err != nil {
			return ErrInvoiceNotFound
		}

		// ยืนยันได้เฉพาะใบที่ยัง "รอดำเนินการ" (pending) เท่านั้น เช่นเดียวกับ Reject/Cancel
		// ถ้าใบถูกยกเลิก/ปฏิเสธ/หมดอายุไปแล้ว ห้ามชุบชีวิตกลับมาเป็น success ไม่งั้นจะมาร์ค
		// บิลเป็น paid ซ้ำและ trigger activateEnrollment ใหม่ = นับรายได้ซ้ำ/เปิดสิทธิ์ซ้ำ
		if invoice.Status == models.InvoiceSuccess {
			return businessErr("ใบแจ้งหนี้นี้ชำระเงินสำเร็จไปแล้ว")
		}
		if invoice.Status != models.InvoicePending {
			return businessErr("ใบแจ้งหนี้นี้ถูกปิดไปแล้ว ไม่สามารถยืนยันการชำระเงินได้")
		}

		invoice.Status = models.InvoiceSuccess
		invoice.ConfirmedByID = confirmedByID
		// เขียนทับวิธีชำระเงินเมื่อยืนยันเงินสด เพื่อไม่ให้ใบยังโชว์วิธีเดิม (เช่น QR) ที่ลูกค้าเลือกไว้ตอนสร้างใบ
		if overrideMethod != nil {
			invoice.Method = *overrideMethod
		}
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
	// ปิดใบที่ค้าง pending หมดอายุก่อน เพื่อให้สถานะที่ส่งออกไปตรงจริง แม้ไม่มี background job
	s.sweepStalePendingInvoices()

	var invoices []models.Invoice
	err := s.db.Preload("PaymentItem").
		Preload("PaymentItem.Billing").
		Where("customer_id = ?", customerID).
		Find(&invoices).Error
	return invoices, err
}

// GetAllInvoices ดึงใบแจ้งหนี้ทั้งหมด (สำหรับหน้าตรวจสลิปของ Admin) แบบ invoice-centric
//
// ต่างจาก GetAllBillings ตรงที่คืน "ใบแจ้งหนี้" พร้อมบิลครบชุดเดิมและยอด snapshot ของใบ
// (invoice.TotalAmount) จึงไม่หดตามการออกใบใหม่บางบิล — แก้ปัญหาการ์ดใบที่ถูกปฏิเสธโชว์ยอด/จำนวนบิลไม่ครบ
//
// ตัด cancelled/expired ทิ้ง (ตรงกับฝั่งลูกค้าที่ซ่อนใบยกเลิก และ expired = ใบที่ทิ้งค้างไม่แนบสลิป)
func (s *PaymentService) GetAllInvoices() ([]models.Invoice, error) {
	// ปิดใบ pending ที่ทิ้งค้างไม่แนบสลิปให้เป็น expired ก่อน เพื่อให้ชุดที่กรองออกตรงจริง (lazy sweep)
	s.sweepStalePendingInvoices()

	var invoices []models.Invoice
	err := s.db.
		Preload("Customer").
		Preload("Customer.Customer"). // ต้องมีเพื่อให้ ToUserMinDTO เติม nickname ได้
		Preload("ConfirmedBy").
		Preload("PaymentItem").
		Preload("PaymentItem.Billing").
		Preload("PaymentItem.Billing.BillingType").
		Preload("PaymentItem.Billing.Admin").
		Preload("PaymentItem.Billing.UpdatedBy").
		Where("status NOT IN ?", []models.InvoiceStatus{models.InvoiceCancelled, models.InvoiceExpired}).
		Order("id DESC").
		Find(&invoices).Error
	return invoices, err
}

// RejectPayment ปฏิเสธการชำระเงินโดยผู้ดูแลระบบ (Admin)
//
// reason = เหตุผลที่ปฏิเสธ บังคับกรอกจากฝั่ง controller — เก็บลงใบแจ้งหนี้และส่งไปแจ้งลูกค้า
// เพื่อให้ลูกค้ารู้ว่าสลิปมีปัญหาอะไรก่อนส่งใหม่ (ปฏิเสธแบบเงียบ ๆ = ลูกค้าส่งสลิปเดิมซ้ำ)
func (s *PaymentService) RejectPayment(invoiceID uint, reason string) (*models.Invoice, error) {
	var invoice models.Invoice

	err := s.db.Transaction(func(tx *gorm.DB) error {
		// ล็อกแถวใบแจ้งหนี้ก่อนอ่านสถานะ กันแอดมินสองคน (หรือ auto-verify) เข้ามาพร้อมกัน
		// แล้วต่างคนต่างอ่านสถานะเดิม จนปฏิเสธซ้อนกับการยืนยัน/ยกเลิก
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&invoice, invoiceID).Error; err != nil {
			return ErrInvoiceNotFound
		}

		// ปฏิเสธได้เฉพาะใบที่ยัง "รอดำเนินการ" (pending) เท่านั้น
		// ถ้าใบถูกยืนยัน/ยกเลิก/ปฏิเสธไปแล้ว ห้ามทำซ้ำ ไม่งั้นจะไปรีเซ็ตสถานะบิล
		// ที่อาจถูกชำระผ่านใบอื่นไปแล้วให้กลับมาค้างชำระ = เปิดช่องให้จ่ายซ้ำ
		if invoice.Status == models.InvoiceSuccess {
			return businessErr("ไม่สามารถปฏิเสธใบแจ้งหนี้ที่ชำระเงินสำเร็จแล้วได้")
		}
		if invoice.Status != models.InvoicePending {
			return businessErr("ใบแจ้งหนี้นี้ถูกปิดไปแล้ว ไม่สามารถปฏิเสธซ้ำได้")
		}

		now := time.Now()
		invoice.Status = models.InvoiceRejected
		invoice.RejectReason = reason
		invoice.RejectedAt = &now
		if err := tx.Save(&invoice).Error; err != nil {
			return errors.New("ไม่สามารถบันทึกสถานะปฏิเสธการชำระเงินได้")
		}

		// ดึง PaymentItem ทั้งหมดเพื่อคืนสถานะ Billing เป็น unfunded (ยังไม่ชำระ)
		// คืนเฉพาะบิลที่กำลัง "รอตรวจสอบ" (waitcheck) ของใบนี้เท่านั้น (guard สถานะ)
		// กันเผลอไปทับบิลที่ถูกชำระผ่านใบอื่นจนเป็น paid ไปแล้วให้กลับมาค้างชำระ
		var items []models.PaymentItem
		if err := tx.Where("invoice_id = ?", invoiceID).Find(&items).Error; err != nil {
			return err
		}

		for _, item := range items {
			if err := tx.Model(&models.Billing{}).
				Where("id = ? AND status = ?", item.BillingID, models.StatusWaitCheck).
				Update("status", models.StatusUnfunded).Error; err != nil {
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

	// แจ้งลูกค้าว่าสลิปไม่ผ่าน ให้อัปโหลดใหม่ — แนบเหตุผลไปด้วยเพื่อให้แก้ได้ตรงจุด
	notifBody := fmt.Sprintf("สลิปใบแจ้งหนี้ #%d ไม่ผ่านการตรวจสอบ", invoiceID)
	if reason != "" {
		notifBody += fmt.Sprintf(" เหตุผล: %s", reason)
	}
	notifBody += " กรุณาตรวจสอบและอัปโหลดสลิปใหม่"
	CreateNotification(s.db, result.CustomerID,
		"payment_rejected",
		fmt.Sprintf("invoice-%d-rejected-%d", invoiceID, time.Now().Unix()),
		"สลิปไม่ผ่านการตรวจสอบ",
		notifBody,
		"/customer/payment?tab=billings",
		"danger",
	)

	return &result, nil
}

// CancelInvoice ยกเลิกใบแจ้งหนี้โดยลูกค้า (เจ้าของ) หรือแอดมิน
//
// userID/role มาจาก JWT — ลูกค้ายกเลิกได้เฉพาะใบแจ้งหนี้ของตัวเอง ส่วนแอดมินยกเลิกได้ทุกใบ
// (กัน IDOR: :id เป็นเลขเรียงที่เดาต่อได้ จึงต้องเทียบความเป็นเจ้าของที่ชั้น service เสมอ)
func (s *PaymentService) CancelInvoice(invoiceID uint, userID uint, role string) (*models.Invoice, error) {
	var invoice models.Invoice

	err := s.db.Transaction(func(tx *gorm.DB) error {
		// ล็อกแถวใบแจ้งหนี้ก่อนอ่านสถานะ กันการยกเลิกซ้อนกับการยืนยัน/ปฏิเสธที่เข้ามาพร้อมกัน
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&invoice, invoiceID).Error; err != nil {
			return ErrInvoiceNotFound
		}

		// Invoice.CustomerID อ้างถึง User.ID จึงเทียบกับ userID จาก JWT ได้ตรง
		if role != string(models.AdminRole) && invoice.CustomerID != userID {
			return ErrForbidden
		}

		// ยกเลิกได้เฉพาะใบที่ยัง "รอดำเนินการ" (pending) เท่านั้น
		// ถ้าใบถูกยืนยัน/ยกเลิก/ปฏิเสธไปแล้ว ห้ามยกเลิกซ้ำ ไม่งั้นจะไปรีเซ็ตสถานะบิล
		// ที่อาจถูกชำระผ่านใบอื่นไปแล้วให้กลับมาค้างชำระ = เปิดช่องให้จ่ายซ้ำ
		if invoice.Status == models.InvoiceSuccess {
			return businessErr("ไม่สามารถยกเลิกใบแจ้งหนี้ที่ชำระเงินสำเร็จแล้วได้")
		}
		if invoice.Status != models.InvoicePending {
			return businessErr("ใบแจ้งหนี้นี้ถูกปิดไปแล้ว ไม่สามารถยกเลิกซ้ำได้")
		}

		invoice.Status = models.InvoiceCancelled
		if err := tx.Save(&invoice).Error; err != nil {
			return errors.New("ไม่สามารถบันทึกสถานะยกเลิกใบแจ้งหนี้ได้")
		}

		// ดึง PaymentItem ทั้งหมดเพื่อคืนสถานะ Billing เป็น unfunded (ยังไม่ชำระ)
		// คืนเฉพาะบิลที่กำลัง "รอตรวจสอบ" (waitcheck) ของใบนี้เท่านั้น (guard สถานะ)
		// กันเผลอไปทับบิลที่ถูกชำระผ่านใบอื่นจนเป็น paid ไปแล้วให้กลับมาค้างชำระ
		var items []models.PaymentItem
		if err := tx.Where("invoice_id = ?", invoiceID).Find(&items).Error; err != nil {
			return err
		}

		for _, item := range items {
			if err := tx.Model(&models.Billing{}).
				Where("id = ? AND status = ?", item.BillingID, models.StatusWaitCheck).
				Update("status", models.StatusUnfunded).Error; err != nil {
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
