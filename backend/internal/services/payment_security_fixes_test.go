package services

import (
	"errors"
	"fmt"
	"testing"

	"CPE-691015/internal/models"

	"gorm.io/gorm"
)

// slipSeedCounter ทำให้อีเมลลูกค้าที่ seed ไม่ซ้ำกัน (ตาราง users มี unique index บนอีเมล)
var slipSeedCounter int

// เทสชุดนี้คุมพฤติกรรมใหม่จากการปิดช่องโหว่ระบบการเงิน:
//   #1 UploadSlip ต้องปฏิเสธ slip_url ที่ไม่ใช่ไฟล์ในระบบ (กัน SSRF/audit ปลอม)
//   #2 ConfirmPayment ต้องกันการยืนยันซ้ำ (guard สถานะ ตอนนี้อยู่ใน tx พร้อม row lock)
//   #3 UploadSlip ต้องบล็อกใบ terminal (expired) แต่ยังให้ re-submit ใบ rejected ได้ + ล้างผล SlipOK เก่า

func newPaymentFixTestDB(t *testing.T) *gorm.DB {
	return newTestDB(t,
		&models.User{}, &models.Billing{}, &models.BillingType{},
		&models.Invoice{}, &models.PaymentItem{}, &models.Notification{},
		&models.Enrollment{}, &models.Package{},
	)
}

// seedInvoiceForSlip สร้าง ลูกค้า+บิล+ใบแจ้งหนี้ (สถานะตามระบุ) ผูกกันครบ คืน id ลูกค้า/บิล/ใบ
func seedInvoiceForSlip(t *testing.T, db *gorm.DB, bStatus models.BillingStatus, invStatus models.InvoiceStatus) (customerID, billingID, invoiceID uint) {
	t.Helper()

	slipSeedCounter++
	email := fmt.Sprintf("slipfix%d@example.test", slipSeedCounter)
	customer := models.User{FirstName: "ลูกค้า", LastName: "ทดสอบ", Email: email, Role: models.CustomerRole}
	if err := db.Create(&customer).Error; err != nil {
		t.Fatalf("สร้างลูกค้าไม่สำเร็จ: %v", err)
	}
	billing := models.Billing{Description: "ค่าคอร์ส", Amount: 500, Status: bStatus, CustomerID: customer.ID}
	if err := db.Create(&billing).Error; err != nil {
		t.Fatalf("สร้างบิลไม่สำเร็จ: %v", err)
	}
	inv := models.Invoice{TotalAmount: 500, Status: invStatus, CustomerID: customer.ID}
	if err := db.Create(&inv).Error; err != nil {
		t.Fatalf("สร้างใบแจ้งหนี้ไม่สำเร็จ: %v", err)
	}
	if err := db.Create(&models.PaymentItem{InvoiceID: inv.ID, BillingID: billing.ID}).Error; err != nil {
		t.Fatalf("ผูกใบกับบิลไม่สำเร็จ: %v", err)
	}
	return customer.ID, billing.ID, inv.ID
}

// ─────────────────────────── #1 ───────────────────────────

// slip_url ที่ไม่ได้ชี้ไปไฟล์ในระบบ (/uploads/) ต้องถูกปฏิเสธ ไม่บันทึกอะไรเลย
func TestUploadSlip_RejectsExternalSlipURL(t *testing.T) {
	db := newPaymentFixTestDB(t)
	customerID, billingID, invoiceID := seedInvoiceForSlip(t, db, models.StatusUnfunded, models.InvoicePending)
	svc := NewPaymentService(db, nil)

	for _, badURL := range []string{
		"https://attacker.com/evil.png", // URL ภายนอกล้วน
		"http://169.254.169.254/latest",  // ปลายทางภายใน (SSRF)
		"slip.jpg",                       // ไม่มี /uploads/
	} {
		_, err := svc.UploadSlip(invoiceID, badURL, customerID, string(models.CustomerRole))
		if err == nil {
			t.Fatalf("slip_url %q ควรถูกปฏิเสธ แต่กลับสำเร็จ", badURL)
		}
		var be *BusinessError
		if !errors.As(err, &be) {
			t.Fatalf("slip_url %q ควรได้ *BusinessError แต่ได้ %T (%v)", badURL, err, err)
		}
	}

	// ใบและบิลต้องไม่ถูกแตะ
	if got := invoiceStatus(t, db, invoiceID); got != models.InvoicePending {
		t.Fatalf("ใบแจ้งหนี้ต้องคงเป็น pending แต่เป็น %q", got)
	}
	if got := billingStatus(t, db, billingID); got != models.StatusUnfunded {
		t.Fatalf("บิลต้องคงเป็น unfunded แต่เป็น %q", got)
	}
	var inv models.Invoice
	if err := db.First(&inv, invoiceID).Error; err != nil {
		t.Fatalf("อ่านใบแจ้งหนี้ไม่สำเร็จ: %v", err)
	}
	if inv.SlipImageUrl != "" {
		t.Fatalf("ต้องไม่บันทึก slip_url แต่ได้ %q", inv.SlipImageUrl)
	}
}

// slip_url ที่เป็นไฟล์ในระบบ (มี /uploads/) ต้องผ่าน — พิสูจน์ว่าไม่ได้บล็อกเกินเหตุ
func TestUploadSlip_AcceptsInternalUploadURL(t *testing.T) {
	db := newPaymentFixTestDB(t)
	customerID, billingID, invoiceID := seedInvoiceForSlip(t, db, models.StatusUnfunded, models.InvoicePending)
	svc := NewPaymentService(db, nil)

	res, err := svc.UploadSlip(invoiceID, "http://localhost:8000/uploads/slip.jpg", customerID, string(models.CustomerRole))
	if err != nil {
		t.Fatalf("slip_url ในระบบควรผ่าน แต่ได้ error: %v", err)
	}
	if res.SlipImageUrl != "http://localhost:8000/uploads/slip.jpg" {
		t.Fatalf("ควรบันทึก slip_url ที่ส่งมา แต่ได้ %q", res.SlipImageUrl)
	}
	if got := billingStatus(t, db, billingID); got != models.StatusWaitCheck {
		t.Fatalf("บิลควรเป็น waitcheck หลังแนบสลิป แต่เป็น %q", got)
	}
}

// slip_url ที่เป็น Cloudinary ของสถาบัน (cloud name ตรงกับที่ตั้งค่า) ต้องผ่าน
// แต่ Cloudinary ของ cloud อื่น (ผู้โจมตี host เอง) ต้องถูกปฏิเสธ
func TestUploadSlip_AcceptsOwnCloudinaryRejectsForeignCloud(t *testing.T) {
	db := newPaymentFixTestDB(t)
	svc := NewPaymentService(db, nil).WithCloudinaryCloudName("koyama-cloud")

	// ── cloud ของสถาบัน → ผ่าน ──
	customerID, billingID, invoiceID := seedInvoiceForSlip(t, db, models.StatusUnfunded, models.InvoicePending)
	ownURL := "https://res.cloudinary.com/koyama-cloud/image/upload/v1/koyama/slip/abc.jpg"
	if _, err := svc.UploadSlip(invoiceID, ownURL, customerID, string(models.CustomerRole)); err != nil {
		t.Fatalf("slip Cloudinary ของสถาบันควรผ่าน แต่ได้ error: %v", err)
	}
	if got := billingStatus(t, db, billingID); got != models.StatusWaitCheck {
		t.Fatalf("บิลควรเป็น waitcheck แต่เป็น %q", got)
	}

	// ── cloud ของผู้โจมตี → ถูกปฏิเสธ ──
	customerID2, billingID2, invoiceID2 := seedInvoiceForSlip(t, db, models.StatusUnfunded, models.InvoicePending)
	foreignURL := "https://res.cloudinary.com/attacker-cloud/image/upload/v1/fake/slip.jpg"
	if _, err := svc.UploadSlip(invoiceID2, foreignURL, customerID2, string(models.CustomerRole)); err == nil {
		t.Fatal("slip Cloudinary ของ cloud อื่น ควรถูกปฏิเสธ แต่กลับสำเร็จ")
	}
	if got := billingStatus(t, db, billingID2); got != models.StatusUnfunded {
		t.Fatalf("บิลต้องคงเป็น unfunded แต่เป็น %q", got)
	}
}

// ─────────────────────────── #2 ───────────────────────────

// เคสปกติ: ยืนยันใบที่ยัง pending → ใบเป็น success และบิลกลายเป็น paid
func TestConfirmPayment_ConfirmsPendingAndMarksBillingPaid(t *testing.T) {
	db := newPaymentFixTestDB(t)
	_, billingID, invoiceID := seedInvoiceForSlip(t, db, models.StatusWaitCheck, models.InvoicePending)
	svc := NewPaymentService(db, nil)

	adminID := uint(9)
	res, err := svc.ConfirmPayment(invoiceID, &adminID)
	if err != nil {
		t.Fatalf("ยืนยันใบ pending ควรสำเร็จ แต่ได้ error: %v", err)
	}
	if res.Status != models.InvoiceSuccess {
		t.Fatalf("ใบควรเป็น success แต่เป็น %q", res.Status)
	}
	if got := billingStatus(t, db, billingID); got != models.StatusPaid {
		t.Fatalf("บิลควรเป็น paid แต่เป็น %q", got)
	}
}

// #2 guard: ยืนยันใบที่ success ไปแล้วซ้ำ ต้องถูกปฏิเสธด้วย *BusinessError (เช็คสถานะอยู่ใน tx + row lock)
func TestConfirmPayment_RejectsAlreadyConfirmed(t *testing.T) {
	db := newPaymentFixTestDB(t)
	_, billingID, invoiceID := seedInvoiceForSlip(t, db, models.StatusPaid, models.InvoiceSuccess)
	svc := NewPaymentService(db, nil)

	adminID := uint(9)
	_, err := svc.ConfirmPayment(invoiceID, &adminID)
	if err == nil {
		t.Fatal("ยืนยันใบที่ชำระสำเร็จไปแล้วซ้ำ ควรได้ error แต่กลับสำเร็จ")
	}
	var be *BusinessError
	if !errors.As(err, &be) {
		t.Fatalf("ควรได้ *BusinessError แต่ได้ %T (%v)", err, err)
	}
	// บิลต้องคงเป็น paid (ไม่ถูกแตะ)
	if got := billingStatus(t, db, billingID); got != models.StatusPaid {
		t.Fatalf("บิลควรคงเป็น paid แต่เป็น %q", got)
	}
}

// ─────────────────────────── #3 ───────────────────────────

// ใบที่หมดอายุ (expired) เป็นสถานะ terminal ต้องแนบสลิปซ้ำไม่ได้ (กันชุบชีวิตกลับ pending)
func TestUploadSlip_BlocksExpiredInvoice(t *testing.T) {
	db := newPaymentFixTestDB(t)
	customerID, billingID, invoiceID := seedInvoiceForSlip(t, db, models.StatusUnfunded, models.InvoiceExpired)
	svc := NewPaymentService(db, nil)

	_, err := svc.UploadSlip(invoiceID, "http://localhost:8000/uploads/slip.jpg", customerID, string(models.CustomerRole))
	if err == nil {
		t.Fatal("แนบสลิปใบที่หมดอายุ ควรได้ error แต่กลับสำเร็จ")
	}
	var be *BusinessError
	if !errors.As(err, &be) {
		t.Fatalf("ควรได้ *BusinessError แต่ได้ %T (%v)", err, err)
	}
	if got := invoiceStatus(t, db, invoiceID); got != models.InvoiceExpired {
		t.Fatalf("ใบต้องคงเป็น expired แต่เป็น %q", got)
	}
	if got := billingStatus(t, db, billingID); got != models.StatusUnfunded {
		t.Fatalf("บิลต้องคงเป็น unfunded แต่เป็น %q", got)
	}
}

// ใบที่ถูกยกเลิก (cancelled) ก็เป็น terminal ต้องแนบสลิปซ้ำไม่ได้
func TestUploadSlip_BlocksCancelledInvoice(t *testing.T) {
	db := newPaymentFixTestDB(t)
	customerID, _, invoiceID := seedInvoiceForSlip(t, db, models.StatusUnfunded, models.InvoiceCancelled)
	svc := NewPaymentService(db, nil)

	if _, err := svc.UploadSlip(invoiceID, "http://localhost:8000/uploads/slip.jpg", customerID, string(models.CustomerRole)); err == nil {
		t.Fatal("แนบสลิปใบที่ถูกยกเลิก ควรได้ error แต่กลับสำเร็จ")
	}
	if got := invoiceStatus(t, db, invoiceID); got != models.InvoiceCancelled {
		t.Fatalf("ใบต้องคงเป็น cancelled แต่เป็น %q", got)
	}
}

// ใบที่ถูกปฏิเสธ (rejected) ต้องส่งสลิปใหม่ได้ (ตามดีไซน์) และผลตรวจ SlipOK เก่าต้องถูกล้างทิ้ง
func TestUploadSlip_AllowsRejectedResubmitAndClearsStaleSlipOk(t *testing.T) {
	db := newPaymentFixTestDB(t)
	customerID, billingID, invoiceID := seedInvoiceForSlip(t, db, models.StatusUnfunded, models.InvoiceRejected)

	// จำลองผลตรวจ SlipOK ค้างจากการแนบสลิปรอบก่อนที่ถูกปฏิเสธ
	if err := db.Model(&models.Invoice{}).Where("id = ?", invoiceID).Updates(map[string]interface{}{
		"slip_ok_checked": true,
		"slip_ok_passed":  false,
		"slip_ok_message": "รอบก่อนไม่ผ่าน",
		"slip_image_url":  "http://localhost:8000/uploads/old.jpg",
	}).Error; err != nil {
		t.Fatalf("ตั้งค่าผลตรวจเก่าไม่สำเร็จ: %v", err)
	}

	svc := NewPaymentService(db, nil)
	res, err := svc.UploadSlip(invoiceID, "http://localhost:8000/uploads/new.jpg", customerID, string(models.CustomerRole))
	if err != nil {
		t.Fatalf("ส่งสลิปใหม่เข้าใบ rejected ควรสำเร็จ แต่ได้ error: %v", err)
	}

	if res.Status != models.InvoicePending {
		t.Fatalf("ใบควรกลับเป็น pending หลังแนบสลิปใหม่ แต่เป็น %q", res.Status)
	}
	if res.SlipImageUrl != "http://localhost:8000/uploads/new.jpg" {
		t.Fatalf("ควรบันทึกสลิปใหม่ แต่ได้ %q", res.SlipImageUrl)
	}

	var inv models.Invoice
	if err := db.First(&inv, invoiceID).Error; err != nil {
		t.Fatalf("อ่านใบแจ้งหนี้ไม่สำเร็จ: %v", err)
	}
	if inv.SlipOkChecked || inv.SlipOkPassed || inv.SlipOkMessage != "" {
		t.Fatalf("ผลตรวจ SlipOK เก่าต้องถูกล้าง แต่ได้ checked=%v passed=%v msg=%q",
			inv.SlipOkChecked, inv.SlipOkPassed, inv.SlipOkMessage)
	}
	if got := billingStatus(t, db, billingID); got != models.StatusWaitCheck {
		t.Fatalf("บิลควรเป็น waitcheck หลังแนบสลิปใหม่ แต่เป็น %q", got)
	}
}
