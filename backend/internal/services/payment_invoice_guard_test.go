package services

import (
	"errors"
	"testing"
	"time"

	"CPE-691015/internal/models"

	"gorm.io/gorm"
)

// CreateInvoice ต้องปฏิเสธวิธีชำระเงินที่ไม่รองรับ และคืน *BusinessError (controller map เป็น 409)
func TestCreateInvoice_RejectsInvalidPaymentMethod(t *testing.T) {
	db := newInvoiceGuardTestDB(t)
	customer := models.User{FirstName: "ลูกค้า", LastName: "ทดสอบ", Email: "method@example.test", Role: models.CustomerRole}
	if err := db.Create(&customer).Error; err != nil {
		t.Fatalf("สร้างลูกค้าไม่สำเร็จ: %v", err)
	}
	billing := models.Billing{Description: "ค่าคอร์ส", Amount: 100, Status: models.StatusUnfunded, CustomerID: customer.ID}
	if err := db.Create(&billing).Error; err != nil {
		t.Fatalf("สร้างบิลไม่สำเร็จ: %v", err)
	}

	svc := NewPaymentService(db, nil)

	_, err := svc.CreateInvoice(customer.ID, []uint{billing.ID}, models.PaymentMethod("bitcoin"))
	if err == nil {
		t.Fatal("คาดว่าวิธีชำระเงินที่ไม่รองรับต้องได้ error แต่กลับสำเร็จ")
	}
	var be *BusinessError
	if !errors.As(err, &be) {
		t.Fatalf("ควรเป็น *BusinessError แต่ได้ %T (%v)", err, err)
	}

	// วิธีที่รองรับต้องผ่าน
	inv, err := svc.CreateInvoice(customer.ID, []uint{billing.ID}, models.MethodQR)
	if err != nil {
		t.Fatalf("วิธีชำระเงินที่รองรับควรสำเร็จ แต่ได้ error: %v", err)
	}
	if inv.Status != models.InvoicePending {
		t.Fatalf("ใบแจ้งหนี้ที่สร้างควรเป็น pending แต่เป็น %q", inv.Status)
	}
}

// เทสชุดนี้คุมกติกาของ CancelInvoice / RejectPayment
//
// ─── บั๊กที่เคยเกิด (#2) ───
//
// ทั้งสองฟังก์ชันเดิมเช็คแค่ status != success แล้วรีเซ็ตบิลกลับเป็น unfunded แบบไม่มีเงื่อนไข
// ทำให้ถ้ากด "ยกเลิก/ปฏิเสธ" ใบแจ้งหนี้เก่าที่ปิดไปแล้ว (cancelled/rejected) ซ้ำอีกครั้ง
// มันจะไปล้างบิลที่ถูกชำระผ่านใบอื่นจนเป็น paid ให้กลับมา unfunded = เปิดช่องให้จ่ายซ้ำ
//
// ─── กติกาปัจจุบัน ───
//
//	ยกเลิก/ปฏิเสธได้เฉพาะใบที่ยัง pending เท่านั้น และคืนสถานะบิลเฉพาะที่ยัง waitcheck

func newInvoiceGuardTestDB(t *testing.T) *gorm.DB {
	return newTestDB(t,
		&models.User{}, &models.Billing{}, &models.BillingType{},
		&models.Invoice{}, &models.PaymentItem{}, &models.Notification{},
	)
}

// seedPaidBillingWithStaleInvoice จำลองสถานะหลังจ่ายเงินสำเร็จผ่านใบใหม่:
//   - บิล X = paid
//   - ใบ A (เก่า) = cancelled ผูกกับบิล X
//   - ใบ B (ใหม่) = success ผูกกับบิล X
//
// คืน id ของบิล X และใบ A ที่ปิดไปแล้ว
func seedPaidBillingWithStaleInvoice(t *testing.T, db *gorm.DB) (billingID, staleInvoiceID uint) {
	t.Helper()

	customer := models.User{FirstName: "ลูกค้า", LastName: "ทดสอบ", Email: "payer@example.test"}
	if err := db.Create(&customer).Error; err != nil {
		t.Fatalf("สร้างลูกค้าไม่สำเร็จ: %v", err)
	}

	billing := models.Billing{
		Description: "ค่าคอร์ส",
		Amount:      1000,
		Status:      models.StatusPaid,
		CustomerID:  customer.ID,
	}
	if err := db.Create(&billing).Error; err != nil {
		t.Fatalf("สร้างบิลไม่สำเร็จ: %v", err)
	}

	stale := models.Invoice{TotalAmount: 1000, Status: models.InvoiceCancelled, CustomerID: customer.ID}
	if err := db.Create(&stale).Error; err != nil {
		t.Fatalf("สร้างใบแจ้งหนี้เก่าไม่สำเร็จ: %v", err)
	}
	success := models.Invoice{TotalAmount: 1000, Status: models.InvoiceSuccess, CustomerID: customer.ID}
	if err := db.Create(&success).Error; err != nil {
		t.Fatalf("สร้างใบแจ้งหนี้ใหม่ไม่สำเร็จ: %v", err)
	}

	if err := db.Create(&models.PaymentItem{InvoiceID: stale.ID, BillingID: billing.ID}).Error; err != nil {
		t.Fatalf("ผูกใบเก่ากับบิลไม่สำเร็จ: %v", err)
	}
	if err := db.Create(&models.PaymentItem{InvoiceID: success.ID, BillingID: billing.ID}).Error; err != nil {
		t.Fatalf("ผูกใบใหม่กับบิลไม่สำเร็จ: %v", err)
	}

	return billing.ID, stale.ID
}

// seedPendingInvoice สร้างใบแจ้งหนี้ pending พร้อมกำหนด created_at ย้อนหลังตามต้องการ
func seedPendingInvoice(t *testing.T, db *gorm.DB, slipURL string, ageDays int) uint {
	t.Helper()
	inv := models.Invoice{TotalAmount: 100, Status: models.InvoicePending, SlipImageUrl: slipURL}
	if err := db.Create(&inv).Error; err != nil {
		t.Fatalf("สร้างใบแจ้งหนี้ไม่สำเร็จ: %v", err)
	}
	createdAt := time.Now().AddDate(0, 0, -ageDays)
	if err := db.Model(&models.Invoice{}).Where("id = ?", inv.ID).UpdateColumn("created_at", createdAt).Error; err != nil {
		t.Fatalf("ปรับ created_at ไม่สำเร็จ: %v", err)
	}
	return inv.ID
}

func invoiceStatus(t *testing.T, db *gorm.DB, id uint) models.InvoiceStatus {
	t.Helper()
	var inv models.Invoice
	if err := db.First(&inv, id).Error; err != nil {
		t.Fatalf("อ่านใบแจ้งหนี้ไม่สำเร็จ: %v", err)
	}
	return inv.Status
}

// ปิดใบแจ้งหนี้ที่ค้าง pending + ไม่แนบสลิป เกิน 3 วันให้เป็น expired
// แต่ต้องไม่แตะใบที่แนบสลิปแล้ว (รอแอดมินตรวจ) หรือใบที่เพิ่งสร้าง
func TestExpireStalePendingInvoices_OnlyClosesAbandonedNoSlipInvoices(t *testing.T) {
	db := newInvoiceGuardTestDB(t)

	staleNoSlip := seedPendingInvoice(t, db, "", 4)             // ค้าง 4 วัน ไม่มีสลิป → ต้องหมดอายุ
	staleWithSlip := seedPendingInvoice(t, db, "/uploads/x", 4) // ค้าง 4 วัน แต่แนบสลิปแล้ว → ห้ามแตะ
	recentNoSlip := seedPendingInvoice(t, db, "", 1)            // เพิ่ง 1 วัน → ยังไม่หมดอายุ

	svc := NewPaymentService(db, nil)
	n, err := svc.ExpireStalePendingInvoices()
	if err != nil {
		t.Fatalf("ExpireStalePendingInvoices error: %v", err)
	}
	if n != 1 {
		t.Fatalf("คาดว่าปิดใบหมดอายุ 1 ใบ แต่ปิดไป %d ใบ", n)
	}

	if got := invoiceStatus(t, db, staleNoSlip); got != models.InvoiceExpired {
		t.Fatalf("ใบค้าง 4 วันไม่มีสลิป ควรเป็น expired แต่เป็น %q", got)
	}
	if got := invoiceStatus(t, db, staleWithSlip); got != models.InvoicePending {
		t.Fatalf("ใบที่แนบสลิปแล้ว ห้ามปิด ควรยังเป็น pending แต่เป็น %q", got)
	}
	if got := invoiceStatus(t, db, recentNoSlip); got != models.InvoicePending {
		t.Fatalf("ใบเพิ่งสร้าง ควรยังเป็น pending แต่เป็น %q", got)
	}
}

func billingStatus(t *testing.T, db *gorm.DB, id uint) models.BillingStatus {
	t.Helper()
	var b models.Billing
	if err := db.First(&b, id).Error; err != nil {
		t.Fatalf("อ่านบิลไม่สำเร็จ: %v", err)
	}
	return b.Status
}

// การยกเลิกใบที่ปิดไปแล้วซ้ำ ต้องถูกปฏิเสธ และห้ามแตะบิลที่จ่ายแล้ว
func TestCancelInvoice_RejectsAlreadyClosedAndKeepsBillingPaid(t *testing.T) {
	db := newInvoiceGuardTestDB(t)
	billingID, staleInvoiceID := seedPaidBillingWithStaleInvoice(t, db)
	svc := NewPaymentService(db, nil)

	if _, err := svc.CancelInvoice(staleInvoiceID, 0, string(models.AdminRole)); err == nil {
		t.Fatal("คาดว่ายกเลิกใบที่ถูกยกเลิกไปแล้วต้องได้ error แต่กลับสำเร็จ")
	}

	if got := billingStatus(t, db, billingID); got != models.StatusPaid {
		t.Fatalf("บิลที่จ่ายแล้วต้องคงเป็น paid แต่กลายเป็น %q", got)
	}
}

// การปฏิเสธใบที่ปิดไปแล้วซ้ำ ต้องถูกปฏิเสธ และห้ามแตะบิลที่จ่ายแล้ว
func TestRejectPayment_RejectsAlreadyClosedAndKeepsBillingPaid(t *testing.T) {
	db := newInvoiceGuardTestDB(t)
	billingID, staleInvoiceID := seedPaidBillingWithStaleInvoice(t, db)
	svc := NewPaymentService(db, nil)

	if _, err := svc.RejectPayment(staleInvoiceID); err == nil {
		t.Fatal("คาดว่าปฏิเสธใบที่ปิดไปแล้วต้องได้ error แต่กลับสำเร็จ")
	}

	if got := billingStatus(t, db, billingID); got != models.StatusPaid {
		t.Fatalf("บิลที่จ่ายแล้วต้องคงเป็น paid แต่กลายเป็น %q", got)
	}
}

// เจ้าของยกเลิกใบ pending ของตัวเองได้ แต่คนอื่น (ไม่ใช่ admin) ยกเลิกไม่ได้ (กัน IDOR)
func TestCancelInvoice_OwnershipEnforcedForCustomers(t *testing.T) {
	db := newInvoiceGuardTestDB(t)

	owner := models.User{FirstName: "เจ้าของ", LastName: "บิล", Email: "owner@example.test", Role: models.CustomerRole}
	if err := db.Create(&owner).Error; err != nil {
		t.Fatalf("สร้างเจ้าของไม่สำเร็จ: %v", err)
	}
	stranger := models.User{FirstName: "คนอื่น", LastName: "ทดสอบ", Email: "stranger@example.test", Role: models.CustomerRole}
	if err := db.Create(&stranger).Error; err != nil {
		t.Fatalf("สร้างผู้ใช้อื่นไม่สำเร็จ: %v", err)
	}
	billing := models.Billing{Description: "ค่าคอร์ส", Amount: 500, Status: models.StatusUnfunded, CustomerID: owner.ID}
	if err := db.Create(&billing).Error; err != nil {
		t.Fatalf("สร้างบิลไม่สำเร็จ: %v", err)
	}
	invoice := models.Invoice{TotalAmount: 500, Status: models.InvoicePending, CustomerID: owner.ID}
	if err := db.Create(&invoice).Error; err != nil {
		t.Fatalf("สร้างใบแจ้งหนี้ไม่สำเร็จ: %v", err)
	}
	if err := db.Create(&models.PaymentItem{InvoiceID: invoice.ID, BillingID: billing.ID}).Error; err != nil {
		t.Fatalf("ผูกใบกับบิลไม่สำเร็จ: %v", err)
	}

	svc := NewPaymentService(db, nil)

	// คนอื่นยกเลิก → ต้องโดนปฏิเสธ และใบยังคง pending
	if _, err := svc.CancelInvoice(invoice.ID, stranger.ID, string(models.CustomerRole)); err != ErrForbidden {
		t.Fatalf("คาดว่าผู้ใช้อื่นยกเลิกต้องได้ ErrForbidden แต่ได้: %v", err)
	}
	var afterStranger models.Invoice
	if err := db.First(&afterStranger, invoice.ID).Error; err != nil {
		t.Fatalf("อ่านใบแจ้งหนี้ไม่สำเร็จ: %v", err)
	}
	if afterStranger.Status != models.InvoicePending {
		t.Fatalf("ใบแจ้งหนี้ควรยังเป็น pending หลังถูกปฏิเสธ แต่เป็น %q", afterStranger.Status)
	}

	// เจ้าของยกเลิกเอง → สำเร็จ ใบกลายเป็น cancelled
	if _, err := svc.CancelInvoice(invoice.ID, owner.ID, string(models.CustomerRole)); err != nil {
		t.Fatalf("เจ้าของยกเลิกใบตัวเองควรสำเร็จ แต่ได้ error: %v", err)
	}
	var afterOwner models.Invoice
	if err := db.First(&afterOwner, invoice.ID).Error; err != nil {
		t.Fatalf("อ่านใบแจ้งหนี้ไม่สำเร็จ: %v", err)
	}
	if afterOwner.Status != models.InvoiceCancelled {
		t.Fatalf("ใบแจ้งหนี้ควรเป็น cancelled หลังเจ้าของยกเลิก แต่เป็น %q", afterOwner.Status)
	}
}

// เคสปกติต้องยังทำงานได้: ปฏิเสธใบที่ยัง pending (บิล waitcheck) → บิลกลับเป็น unfunded
func TestRejectPayment_PendingInvoiceResetsBillingToUnfunded(t *testing.T) {
	db := newInvoiceGuardTestDB(t)

	customer := models.User{FirstName: "ลูกค้า", LastName: "ทดสอบ", Email: "pending@example.test", Role: models.CustomerRole}
	if err := db.Create(&customer).Error; err != nil {
		t.Fatalf("สร้างลูกค้าไม่สำเร็จ: %v", err)
	}
	billing := models.Billing{Description: "ค่าคอร์ส", Amount: 500, Status: models.StatusWaitCheck, CustomerID: customer.ID}
	if err := db.Create(&billing).Error; err != nil {
		t.Fatalf("สร้างบิลไม่สำเร็จ: %v", err)
	}
	invoice := models.Invoice{TotalAmount: 500, Status: models.InvoicePending, CustomerID: customer.ID, SlipImageUrl: "/uploads/slip.jpg"}
	if err := db.Create(&invoice).Error; err != nil {
		t.Fatalf("สร้างใบแจ้งหนี้ไม่สำเร็จ: %v", err)
	}
	if err := db.Create(&models.PaymentItem{InvoiceID: invoice.ID, BillingID: billing.ID}).Error; err != nil {
		t.Fatalf("ผูกใบกับบิลไม่สำเร็จ: %v", err)
	}

	svc := NewPaymentService(db, nil)
	if _, err := svc.RejectPayment(invoice.ID); err != nil {
		t.Fatalf("ปฏิเสธใบที่ยัง pending ควรสำเร็จ แต่ได้ error: %v", err)
	}

	if got := billingStatus(t, db, billing.ID); got != models.StatusUnfunded {
		t.Fatalf("บิลควรกลับเป็น unfunded หลังถูกปฏิเสธ แต่เป็น %q", got)
	}
	var updated models.Invoice
	if err := db.First(&updated, invoice.ID).Error; err != nil {
		t.Fatalf("อ่านใบแจ้งหนี้ไม่สำเร็จ: %v", err)
	}
	if updated.Status != models.InvoiceRejected {
		t.Fatalf("ใบแจ้งหนี้ควรเป็น rejected แต่เป็น %q", updated.Status)
	}
}
