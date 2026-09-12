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
	"gorm.io/gorm"
)

// เทสชุดนี้คุมกติกา #4: ยอดเงินของบิลต้องเป็นบวกเสมอ (binding gt=0)
//
// เดิมใช้แค่ binding:"required" ทำให้ยอดติดลบ/ศูนย์ผ่านเข้ามาได้ แล้วไปลดยอดรวมของ invoice
// หรือสร้างบิลยอดติดลบในระบบ ตอนนี้บล็อกตั้งแต่ชั้น binding (ตอบ 400 ไม่แตะ DB)

func init() { gin.SetMode(gin.TestMode) }

// postJSON สร้าง gin context พร้อม body JSON + auth เป็นแอดมิน สำหรับยิงเข้า handler
func postJSON(method, target string, body map[string]any, params gin.Params) (*httptest.ResponseRecorder, *gin.Context) {
	raw, _ := json.Marshal(body)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(method, target, bytes.NewReader(raw))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("userID", float64(5))
	c.Set("role", string(models.AdminRole))
	c.Params = params
	return w, c
}

// CreateBilling ต้องปฏิเสธยอดติดลบและยอดศูนย์ ด้วย 400 และไม่สร้างบิลใด ๆ
func TestCreateBilling_RejectsNonPositiveAmount(t *testing.T) {
	for _, amount := range []any{-100, 0} {
		db := newBillingCtrlTestDB(t)
		ctrl := NewBillingController(services.NewBillingService(db))

		w, c := postJSON(http.MethodPost, "/api/billings/", map[string]any{
			"customer_ids":       []uint{7},
			"billingtype_id":     3,
			"billingdescription": "ค่าคอร์ส",
			"billingamount":      amount,
			"billingdue_date":    "2030-01-01T00:00:00Z",
		}, nil)

		ctrl.CreateBilling(c)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("ยอด %v ควรได้ 400 แต่ได้ %d (body=%s)", amount, w.Code, w.Body.String())
		}
		var count int64
		db.Model(&models.Billing{}).Count(&count)
		if count != 0 {
			t.Fatalf("ยอด %v ไม่ควรสร้างบิล แต่มี %d ใบ", amount, count)
		}
	}
}

// CreateBilling ยอดบวกปกติต้องยังผ่าน (พิสูจน์ว่าไม่ได้บล็อกเกินเหตุ)
func TestCreateBilling_AcceptsPositiveAmount(t *testing.T) {
	db := newBillingCtrlTestDB(t)

	customer := models.User{Model: gorm.Model{ID: 7}, FirstName: "ลูกค้า", Email: "pos@example.test", Role: models.CustomerRole}
	if err := db.Create(&customer).Error; err != nil {
		t.Fatalf("สร้างลูกค้าไม่สำเร็จ: %v", err)
	}
	bType := models.BillingType{Model: gorm.Model{ID: 3}, BillingTypeName: "ค่าคอร์ส"}
	if err := db.Create(&bType).Error; err != nil {
		t.Fatalf("สร้างประเภทบิลไม่สำเร็จ: %v", err)
	}

	ctrl := NewBillingController(services.NewBillingService(db))
	w, c := postJSON(http.MethodPost, "/api/billings/", map[string]any{
		"customer_ids":       []uint{7},
		"billingtype_id":     3,
		"billingdescription": "ค่าคอร์ส",
		"billingamount":      1000,
		"billingdue_date":    "2030-01-01T00:00:00Z",
	}, nil)

	ctrl.CreateBilling(c)

	if w.Code != http.StatusCreated {
		t.Fatalf("ยอดบวกควรได้ 201 แต่ได้ %d (body=%s)", w.Code, w.Body.String())
	}
}

// CreateSplitBilling ต้องปฏิเสธอัตรา/จำนวนที่ไม่เป็นบวก ด้วย 400
func TestCreateSplitBilling_RejectsNonPositiveRateOrHours(t *testing.T) {
	cases := []map[string]any{
		{"hourly_rate": -50, "hours": 2},
		{"hourly_rate": 100, "hours": 0},
	}
	for _, override := range cases {
		db := newBillingCtrlTestDB(t)
		ctrl := NewBillingController(services.NewBillingService(db))

		body := map[string]any{
			"course_id":          1,
			"date":               "2030-01-01",
			"hourly_rate":        100,
			"hours":              2,
			"billingtype_id":     3,
			"billingdescription": "ค่าสนาม",
			"billingdue_date":    "2030-01-08T00:00:00Z",
		}
		for k, v := range override {
			body[k] = v
		}

		w, c := postJSON(http.MethodPost, "/api/billings/split", body, nil)
		ctrl.CreateSplitBilling(c)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("override %v ควรได้ 400 แต่ได้ %d (body=%s)", override, w.Code, w.Body.String())
		}
	}
}

// UpdateBilling ต้องปฏิเสธการแก้ยอดเป็นค่าไม่เป็นบวก ด้วย 400
func TestUpdateBilling_RejectsNonPositiveAmount(t *testing.T) {
	for _, amount := range []any{-5, 0} {
		db := newBillingCtrlTestDB(t)
		ctrl := NewBillingController(services.NewBillingService(db))

		w, c := postJSON(http.MethodPatch, "/api/billings/1", map[string]any{
			"billingamount": amount,
		}, gin.Params{{Key: "id", Value: "1"}})

		ctrl.UpdateBilling(c)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("แก้ยอดเป็น %v ควรได้ 400 แต่ได้ %d (body=%s)", amount, w.Code, w.Body.String())
		}
	}
}
