package services

import (
	"encoding/json"
	"net/http"
	"testing"

	"CPE-691015/internal/models"
)

// #4: auto-verify ต้องเทียบยอดเงินเองอีกชั้น — ถ้ายอดบนสลิปน้อยกว่ายอดบิล
// ต้องไม่ยืนยันการชำระเงินอัตโนมัติ แม้ SlipOK จะตอบ success (ปล่อยให้แอดมินตรวจเอง)
func TestAutoVerifySlip_RejectsUnderpayment(t *testing.T) {
	db := newTestDB(t, &models.BankAccount{}, &models.Invoice{})

	// บัญชีปลายทาง (ตัวที่ผู้เรียกคัดกรอง+snapshot มาให้ autoVerifySlip)
	account := &models.BankAccount{
		BankName: "ธ.ทดสอบ", AccountNo: "1234567891234", AccountName: "สถาบัน",
		IsActive: true, AutoVerifyEnabled: true,
	}

	inv := models.Invoice{TotalAmount: 500, Status: models.InvoicePending}
	if err := db.Create(&inv).Error; err != nil {
		t.Fatalf("สร้างใบแจ้งหนี้ไม่สำเร็จ: %v", err)
	}

	slipURL := "http://localhost:8000/uploads/" + writeTempUpload(t, "underpay.jpg", []byte("img"))

	// SlipOK ตอบ success แต่ยอดบนสลิป (300) น้อยกว่ายอดบิล (500) — ผู้รับปลายทางตรง
	slipOk := newTestSlipOkService(t, func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"success": true,
			"data": map[string]any{
				"success":  true,
				"amount":   300.0,
				"transRef": "REF-UNDERPAY",
				"receiver": map[string]any{"account": map[string]any{"value": "xxx-x-x1234-x"}},
			},
		})
	})

	svc := NewPaymentService(db, slipOk)
	svc.autoVerifySlip(inv.ID, slipURL, account)

	var after models.Invoice
	if err := db.First(&after, inv.ID).Error; err != nil {
		t.Fatalf("อ่านใบแจ้งหนี้ไม่สำเร็จ: %v", err)
	}
	if after.Status == models.InvoiceSuccess {
		t.Fatal("จ่ายขาดต้องไม่ถูกยืนยันอัตโนมัติ แต่กลับเป็น success")
	}
	if after.SlipOkPassed {
		t.Fatal("SlipOkPassed ต้องเป็น false เมื่อจ่ายขาด")
	}
	if after.SlipOkChecked != true {
		t.Fatal("SlipOkChecked ควรเป็น true (ระบบตรวจแล้วแต่ไม่ผ่าน)")
	}
}

// #5: auto-verify ต้องผูกกับ "บัญชีที่ลูกค้าโอนเข้า" (บัญชี active ที่ snapshot ไว้) เท่านั้น
// ถ้าบัญชี active ปิด auto_verify ต้องไม่เรียก SlipOK เลย และต้อง snapshot บัญชีนั้นให้ถูกต้อง
func TestUploadSlip_SkipsAutoVerifyWhenActiveAccountHasItDisabled(t *testing.T) {
	db := newTestDB(t,
		&models.User{}, &models.BankAccount{}, &models.Invoice{},
		&models.PaymentItem{}, &models.Billing{}, &models.Notification{},
	)

	customer := models.User{FirstName: "ลูกค้า", LastName: "ทดสอบ", Email: "upload@example.test", Role: models.CustomerRole}
	if err := db.Create(&customer).Error; err != nil {
		t.Fatalf("สร้างลูกค้าไม่สำเร็จ: %v", err)
	}
	// บัญชี active แต่ปิด auto-verify
	if err := db.Create(&models.BankAccount{
		BankName: "ธ.ทดสอบ", AccountNo: "1234567891234", AccountName: "สถาบัน",
		IsActive: true, AutoVerifyEnabled: false,
	}).Error; err != nil {
		t.Fatalf("สร้างบัญชีไม่สำเร็จ: %v", err)
	}
	billing := models.Billing{Description: "ค่าคอร์ส", Amount: 500, Status: models.StatusUnfunded, CustomerID: customer.ID}
	if err := db.Create(&billing).Error; err != nil {
		t.Fatalf("สร้างบิลไม่สำเร็จ: %v", err)
	}
	inv := models.Invoice{TotalAmount: 500, Status: models.InvoicePending, CustomerID: customer.ID}
	if err := db.Create(&inv).Error; err != nil {
		t.Fatalf("สร้างใบแจ้งหนี้ไม่สำเร็จ: %v", err)
	}
	if err := db.Create(&models.PaymentItem{InvoiceID: inv.ID, BillingID: billing.ID}).Error; err != nil {
		t.Fatalf("ผูกใบกับบิลไม่สำเร็จ: %v", err)
	}

	slipURL := "http://localhost:8000/uploads/" + writeTempUpload(t, "upload.jpg", []byte("img"))

	called := false
	slipOk := newTestSlipOkService(t, func(w http.ResponseWriter, r *http.Request) {
		called = true
		_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{"success": true, "amount": 500.0}})
	})

	svc := NewPaymentService(db, slipOk)
	res, err := svc.UploadSlip(inv.ID, slipURL, customer.ID, string(models.CustomerRole))
	if err != nil {
		t.Fatalf("UploadSlip error: %v", err)
	}

	if called {
		t.Fatal("ไม่ควรเรียก SlipOK เลยเมื่อบัญชี active ปิด auto-verify")
	}
	if res.Status == models.InvoiceSuccess {
		t.Fatal("ไม่ควรยืนยันการชำระเงินอัตโนมัติ")
	}
	if res.ReceivingAccountNo != "1234567891234" {
		t.Fatalf("ต้อง snapshot บัญชีปลายทางที่ active ให้ถูก แต่ได้ %q", res.ReceivingAccountNo)
	}
	var b models.Billing
	if err := db.First(&b, billing.ID).Error; err != nil {
		t.Fatalf("อ่านบิลไม่สำเร็จ: %v", err)
	}
	if b.Status != models.StatusWaitCheck {
		t.Fatalf("บิลควรเป็น waitcheck หลังแนบสลิป แต่เป็น %q", b.Status)
	}
}
