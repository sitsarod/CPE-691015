package services

import (
	"testing"

	"CPE-691015/internal/models"

	"gorm.io/gorm"
)

// เทสชุดนี้คุมกติกาของ UpdateBilling / DeleteBilling (#3)
//
// ─── บั๊กที่เคยเกิด ───
//
// เดิมบล็อกแค่บิลสถานะ paid/waitcheck แต่ตอนลูกค้าสร้างใบแจ้งหนี้แล้วยังไม่แนบสลิป
// บิลยังเป็น unfunded อยู่ → แอดมินแก้ยอด/ลบบิลได้ ทั้งที่ยอดถูก freeze ในใบไปแล้ว
// ทำให้ยอดในบิลกับยอดที่ลูกค้าต้องจ่ายไม่ตรงกัน หรือใบชี้ไปบิลที่ถูกลบ (dangling)
// และ DeleteBilling เดิมยังบล็อกแค่ paid ไม่บล็อก waitcheck (ลบบิลที่มีสลิปรอตรวจได้)

func newBillingGuardTestDB(t *testing.T) *gorm.DB {
	return newTestDB(t,
		&models.User{}, &models.Customer{}, &models.Billing{}, &models.BillingType{},
		&models.Invoice{}, &models.PaymentItem{},
	)
}

// seedBillingWithInvoice สร้างบิล 1 ใบ (สถานะตามระบุ) และผูกกับใบแจ้งหนี้ 1 ใบถ้า invoiceStatus != ""
func seedBillingWithInvoice(t *testing.T, db *gorm.DB, bStatus models.BillingStatus, invStatus models.InvoiceStatus) uint {
	t.Helper()
	billing := models.Billing{Description: "ค่าคอร์ส", Amount: 500, Status: bStatus}
	if err := db.Create(&billing).Error; err != nil {
		t.Fatalf("สร้างบิลไม่สำเร็จ: %v", err)
	}
	if invStatus != "" {
		inv := models.Invoice{TotalAmount: 500, Status: invStatus}
		if err := db.Create(&inv).Error; err != nil {
			t.Fatalf("สร้างใบแจ้งหนี้ไม่สำเร็จ: %v", err)
		}
		if err := db.Create(&models.PaymentItem{InvoiceID: inv.ID, BillingID: billing.ID}).Error; err != nil {
			t.Fatalf("ผูกใบกับบิลไม่สำเร็จ: %v", err)
		}
	}
	return billing.ID
}

func billingAmount(t *testing.T, db *gorm.DB, id uint) float64 {
	t.Helper()
	var b models.Billing
	if err := db.First(&b, id).Error; err != nil {
		t.Fatalf("อ่านบิลไม่สำเร็จ: %v", err)
	}
	return b.Amount
}

// แก้บิลที่มีใบแจ้งหนี้ pending ค้างอยู่ (ยังไม่แนบสลิป บิลยัง unfunded) ต้องถูกปฏิเสธ
func TestUpdateBilling_BlockedWhenPendingInvoiceExists(t *testing.T) {
	db := newBillingGuardTestDB(t)
	id := seedBillingWithInvoice(t, db, models.StatusUnfunded, models.InvoicePending)
	svc := NewBillingService(db)

	if _, err := svc.UpdateBilling(id, models.Billing{Amount: 999}, 42); err == nil {
		t.Fatal("คาดว่าแก้บิลที่มีใบ pending ค้างต้องได้ error แต่กลับสำเร็จ")
	}
	if got := billingAmount(t, db, id); got != 500 {
		t.Fatalf("ยอดบิลต้องไม่ถูกแก้ (คง 500) แต่เป็น %v", got)
	}
}

// แก้บิลปกติ (ไม่มีใบ active) ต้องยังทำงานได้ — รวมถึงกรณีใบเก่าถูกยกเลิกไปแล้ว
func TestUpdateBilling_AllowedWhenNoActiveInvoice(t *testing.T) {
	db := newBillingGuardTestDB(t)
	svc := NewBillingService(db)

	// ไม่มีใบแจ้งหนี้เลย
	id1 := seedBillingWithInvoice(t, db, models.StatusUnfunded, "")
	if _, err := svc.UpdateBilling(id1, models.Billing{Amount: 999}, 42); err != nil {
		t.Fatalf("แก้บิลที่ไม่มีใบควรสำเร็จ แต่ได้ error: %v", err)
	}
	if got := billingAmount(t, db, id1); got != 999 {
		t.Fatalf("ยอดบิลควรถูกแก้เป็น 999 แต่เป็น %v", got)
	}
	// ต้องบันทึกผู้แก้ไขล่าสุด (UpdatedByID) = actorID ที่ส่งเข้ามา
	var b1 models.Billing
	if err := db.First(&b1, id1).Error; err != nil {
		t.Fatalf("อ่านบิลไม่สำเร็จ: %v", err)
	}
	if b1.UpdatedByID == nil || *b1.UpdatedByID != 42 {
		t.Fatalf("ควรบันทึกผู้แก้ไขล่าสุด = 42 แต่ได้ %v", b1.UpdatedByID)
	}

	// มีแต่ใบที่ถูกยกเลิกไปแล้ว (ไม่ active)
	id2 := seedBillingWithInvoice(t, db, models.StatusUnfunded, models.InvoiceCancelled)
	if _, err := svc.UpdateBilling(id2, models.Billing{Amount: 777}, 42); err != nil {
		t.Fatalf("แก้บิลที่ใบถูกยกเลิกไปแล้วควรสำเร็จ แต่ได้ error: %v", err)
	}
	if got := billingAmount(t, db, id2); got != 777 {
		t.Fatalf("ยอดบิลควรถูกแก้เป็น 777 แต่เป็น %v", got)
	}
}

// ลบบิลที่มีสลิปรอตรวจ (waitcheck) ต้องถูกปฏิเสธ
func TestDeleteBilling_BlockedForWaitcheck(t *testing.T) {
	db := newBillingGuardTestDB(t)
	id := seedBillingWithInvoice(t, db, models.StatusWaitCheck, models.InvoicePending)
	svc := NewBillingService(db)

	if err := svc.DeleteBilling(id); err == nil {
		t.Fatal("คาดว่าลบบิล waitcheck ต้องได้ error แต่กลับสำเร็จ")
	}
	var b models.Billing
	if err := db.First(&b, id).Error; err != nil {
		t.Fatalf("บิลไม่ควรถูกลบ แต่หาไม่เจอ: %v", err)
	}
}

// ลบบิลที่มีใบแจ้งหนี้ pending ค้างอยู่ (บิลยัง unfunded) ต้องถูกปฏิเสธ
func TestDeleteBilling_BlockedWhenPendingInvoiceExists(t *testing.T) {
	db := newBillingGuardTestDB(t)
	id := seedBillingWithInvoice(t, db, models.StatusUnfunded, models.InvoicePending)
	svc := NewBillingService(db)

	if err := svc.DeleteBilling(id); err == nil {
		t.Fatal("คาดว่าลบบิลที่มีใบ pending ค้างต้องได้ error แต่กลับสำเร็จ")
	}
	var b models.Billing
	if err := db.First(&b, id).Error; err != nil {
		t.Fatalf("บิลไม่ควรถูกลบ แต่หาไม่เจอ: %v", err)
	}
}

// ลบบิลปกติ (ไม่มีใบ active) ต้องยังทำงานได้
func TestDeleteBilling_AllowedWhenNoActiveInvoice(t *testing.T) {
	db := newBillingGuardTestDB(t)
	id := seedBillingWithInvoice(t, db, models.StatusUnfunded, "")
	svc := NewBillingService(db)

	if err := svc.DeleteBilling(id); err != nil {
		t.Fatalf("ลบบิลที่ไม่มีใบควรสำเร็จ แต่ได้ error: %v", err)
	}
	var b models.Billing
	if err := db.First(&b, id).Error; err == nil {
		t.Fatal("บิลควรถูกลบไปแล้ว แต่ยังหาเจอ")
	}
}
