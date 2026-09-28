package services

import (
	"testing"

	"CPE-691015/internal/models"
)

// GetAllInvoices ต้องคืน "ใบแจ้งหนี้" พร้อมบิลครบชุดเดิมและยอด snapshot ของใบ (invoice.TotalAmount)
// แม้บางบิลจะถูกออกใบใหม่ไปแล้ว — คือหัวใจของการทำหน้าตรวจสลิปแอดมินให้เป็น invoice-centric
// และต้องตัดใบ cancelled/expired ทิ้ง
func TestGetAllInvoices_ReturnsFullInvoiceSnapshotAndExcludesClosed(t *testing.T) {
	db := newTestDB(t,
		&models.User{}, &models.Customer{}, &models.Billing{}, &models.BillingType{},
		&models.Invoice{}, &models.PaymentItem{}, &models.Notification{},
	)

	customer := models.User{FirstName: "ลูกค้า", LastName: "ทดสอบ", Email: "allinv@example.test", Role: models.CustomerRole}
	if err := db.Create(&customer).Error; err != nil {
		t.Fatalf("สร้างลูกค้าไม่สำเร็จ: %v", err)
	}

	// 3 บิลของใบ #19 (100 + 13 + 13 = 126)
	b1 := models.Billing{Description: "ค่าสนาม", Amount: 100, Status: models.StatusUnfunded, CustomerID: customer.ID}
	b2 := models.Billing{Description: "ค่าอุปกรณ์", Amount: 13, Status: models.StatusUnfunded, CustomerID: customer.ID}
	b3 := models.Billing{Description: "ค่าอื่นๆ", Amount: 13, Status: models.StatusUnfunded, CustomerID: customer.ID}
	for _, b := range []*models.Billing{&b1, &b2, &b3} {
		if err := db.Create(b).Error; err != nil {
			t.Fatalf("สร้างบิลไม่สำเร็จ: %v", err)
		}
	}

	// ใบ #19: rejected รวม 3 บิล ยอด snapshot 126
	inv19 := models.Invoice{TotalAmount: 126, Status: models.InvoiceRejected, CustomerID: customer.ID, SlipImageUrl: "/uploads/s19.jpg"}
	if err := db.Create(&inv19).Error; err != nil {
		t.Fatalf("สร้างใบ #19 ไม่สำเร็จ: %v", err)
	}
	for _, bid := range []uint{b1.ID, b2.ID, b3.ID} {
		if err := db.Create(&models.PaymentItem{InvoiceID: inv19.ID, BillingID: bid}).Error; err != nil {
			t.Fatalf("ผูกบิลกับใบ #19 ไม่สำเร็จ: %v", err)
		}
	}

	// re-invoice bill แรก (100) เป็นใบ #20 (pending + แนบสลิป)
	inv20 := models.Invoice{TotalAmount: 100, Status: models.InvoicePending, CustomerID: customer.ID, SlipImageUrl: "/uploads/s20.jpg"}
	if err := db.Create(&inv20).Error; err != nil {
		t.Fatalf("สร้างใบ #20 ไม่สำเร็จ: %v", err)
	}
	if err := db.Create(&models.PaymentItem{InvoiceID: inv20.ID, BillingID: b1.ID}).Error; err != nil {
		t.Fatalf("ผูกบิลกับใบ #20 ไม่สำเร็จ: %v", err)
	}

	// ใบที่ต้องถูกตัดออก
	cancelled := models.Invoice{TotalAmount: 50, Status: models.InvoiceCancelled, CustomerID: customer.ID}
	expired := models.Invoice{TotalAmount: 50, Status: models.InvoiceExpired, CustomerID: customer.ID}
	if err := db.Create(&cancelled).Error; err != nil {
		t.Fatalf("สร้างใบ cancelled ไม่สำเร็จ: %v", err)
	}
	if err := db.Create(&expired).Error; err != nil {
		t.Fatalf("สร้างใบ expired ไม่สำเร็จ: %v", err)
	}

	svc := NewPaymentService(db, nil)
	invoices, err := svc.GetAllInvoices()
	if err != nil {
		t.Fatalf("GetAllInvoices error: %v", err)
	}

	byID := map[uint]models.Invoice{}
	for _, inv := range invoices {
		byID[inv.ID] = inv
	}

	// ใบ #19 ต้องมีบิลครบ 3 และยอด snapshot 126 (ไม่หดเหลือ 26 แม้ bill แรกถูกออกใบใหม่)
	got19, ok := byID[inv19.ID]
	if !ok {
		t.Fatal("GetAllInvoices ต้องคืนใบ #19 ที่ถูกปฏิเสธ")
	}
	if len(got19.PaymentItem) != 3 {
		t.Fatalf("ใบ #19 ต้องมีบิลครบ 3 แต่ได้ %d", len(got19.PaymentItem))
	}
	if got19.TotalAmount != 126 {
		t.Fatalf("ใบ #19 ต้องมียอด snapshot 126 แต่ได้ %.2f", got19.TotalAmount)
	}

	// ใบ #20 ต้องอยู่
	if _, ok := byID[inv20.ID]; !ok {
		t.Fatal("GetAllInvoices ต้องคืนใบ #20")
	}

	// cancelled/expired ต้องถูกตัดออก
	if _, ok := byID[cancelled.ID]; ok {
		t.Fatal("ใบ cancelled ต้องไม่ถูกคืน")
	}
	if _, ok := byID[expired.ID]; ok {
		t.Fatal("ใบ expired ต้องไม่ถูกคืน")
	}
}
