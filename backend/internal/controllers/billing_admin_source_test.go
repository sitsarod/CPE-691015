package controllers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"CPE-691015/internal/models"
	"CPE-691015/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// เทสนี้คุมกติกา #7: คนออกบิล (admin_id) ต้องมาจาก JWT เท่านั้น ไม่ใช่จาก request body
//
// เดิม body ส่ง admin_id มาเท่าไหร่ก็บันทึกตามนั้น → ปลอมได้ว่าใครเป็นคนออกบิล
// แม้ route จะเป็น adminOnly ก็ตาม (แค่ต้องเป็นแอดมินคนใดคนหนึ่งก็ยิงเปลี่ยนชื่อคนออกได้)

func newBillingCtrlTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
		Logger:                                   logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatalf("เปิด sqlite ไม่สำเร็จ: %v", err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatalf("ดึง *sql.DB ไม่สำเร็จ: %v", err)
	}
	sqlDB.SetMaxOpenConns(1)
	if err := db.AutoMigrate(&models.User{}, &models.Billing{}, &models.BillingType{}, &models.Notification{}); err != nil {
		t.Fatalf("AutoMigrate ไม่สำเร็จ: %v", err)
	}
	return db
}

// แอดมินที่ล็อกอิน (JWT id=5) ออกบิลโดยแนบ admin_id=999 ปลอมมาใน body
// ระบบต้องบันทึกคนออกบิลเป็น 5 (จาก JWT) ไม่ใช่ 999
func TestCreateBilling_AdminIDComesFromJWTNotBody(t *testing.T) {
	db := newBillingCtrlTestDB(t)

	customer := models.User{Model: gorm.Model{ID: 7}, FirstName: "ลูกค้า", Email: "c7@example.test", Role: models.CustomerRole}
	if err := db.Create(&customer).Error; err != nil {
		t.Fatalf("สร้างลูกค้าไม่สำเร็จ: %v", err)
	}
	bType := models.BillingType{Model: gorm.Model{ID: 3}, BillingTypeName: "ค่าคอร์ส"}
	if err := db.Create(&bType).Error; err != nil {
		t.Fatalf("สร้างประเภทบิลไม่สำเร็จ: %v", err)
	}

	ctrl := NewBillingController(services.NewBillingService(db))

	body := map[string]any{
		"customer_ids":       []uint{7},
		"admin_id":           999, // ปลอม — ต้องถูกเมิน
		"billingtype_id":     3,
		"billingdescription": "ค่าคอร์สเทอม 1",
		"billingamount":      1000,
		"billingdue_date":    "2030-01-01T00:00:00Z",
	}
	raw, _ := json.Marshal(body)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/billings/", bytes.NewReader(raw))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("userID", float64(5)) // แอดมินที่ล็อกอินอยู่จริง
	c.Set("role", string(models.AdminRole))

	ctrl.CreateBilling(c)

	if w.Code != http.StatusCreated {
		t.Fatalf("คาดว่า 201 แต่ได้ %d (body=%s)", w.Code, w.Body.String())
	}

	var billing models.Billing
	if err := db.Where("customer_id = ?", 7).First(&billing).Error; err != nil {
		t.Fatalf("ไม่พบบิลที่สร้าง: %v", err)
	}
	if billing.AdminID == nil || *billing.AdminID != 5 {
		t.Fatalf("คนออกบิลต้องเป็น 5 (จาก JWT) แต่เป็น %v", billing.AdminID)
	}
}

// ไม่มีข้อมูลผู้ใช้ใน context (เช่น middleware ไม่ได้เซ็ต) ต้องตอบ 401 ไม่ใช่สร้างบิลด้วย admin id = 0
func TestCreateBilling_RejectsMissingAuthContext(t *testing.T) {
	db := newBillingCtrlTestDB(t)
	ctrl := NewBillingController(services.NewBillingService(db))

	body := map[string]any{
		"customer_ids":       []uint{7},
		"billingtype_id":     3,
		"billingdescription": "x",
		"billingamount":      1000,
		"billingdue_date":    "2030-01-01T00:00:00Z",
	}
	raw, _ := json.Marshal(body)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/billings/", bytes.NewReader(raw))
	c.Request.Header.Set("Content-Type", "application/json")
	// จงใจไม่เซ็ต userID/role

	ctrl.CreateBilling(c)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("คาดว่า 401 แต่ได้ %d (body=%s)", w.Code, w.Body.String())
	}
	var count int64
	db.Model(&models.Billing{}).Count(&count)
	if count != 0 {
		t.Fatalf("ไม่ควรมีบิลถูกสร้างเมื่อไม่มี auth แต่มี %d ใบ", count)
	}
}
