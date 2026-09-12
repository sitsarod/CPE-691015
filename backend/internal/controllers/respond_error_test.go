package controllers

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"CPE-691015/internal/services"

	"github.com/gin-gonic/gin"
)

// respondServiceError ต้อง map error แต่ละชนิดเป็น HTTP status ให้ถูก
// เพื่อให้หน้าบ้านแยก "กติกาทางธุรกิจ/ไม่พบ/ไม่มีสิทธิ์" ออกจาก "เซิร์ฟเวอร์พัง (500)"
func TestRespondServiceError(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want int
	}{
		{"business rule → 409", &services.BusinessError{Msg: "บิลนี้ชำระแล้ว"}, http.StatusConflict},
		{"business rule (wrapped) → 409", errServiceWrap(&services.BusinessError{Msg: "x"}), http.StatusConflict},
		{"forbidden → 403", services.ErrForbidden, http.StatusForbidden},
		{"invoice not found → 404", services.ErrInvoiceNotFound, http.StatusNotFound},
		{"billing not found → 404", services.ErrBillingNotFound, http.StatusNotFound},
		{"generic → 500", errors.New("db พัง"), http.StatusInternalServerError},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			respondServiceError(c, tc.err)
			if w.Code != tc.want {
				t.Fatalf("คาดว่า %d แต่ได้ %d (body=%s)", tc.want, w.Code, w.Body.String())
			}
		})
	}
}

// errServiceWrap ห่อ error ด้วย fmt.Errorf(%w) เพื่อทดสอบว่า errors.As ยังจับ *BusinessError เจอ
func errServiceWrap(err error) error {
	return errors.Join(errors.New("ระหว่างทำรายการ"), err)
}
