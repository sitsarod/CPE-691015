package middlewares

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"CPE-691015/internal/token"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// เทสชุดนี้คุมสองด่านที่ทุก request ต้องผ่าน
//
//	AuthMiddleware — คุณเป็นใคร (token ใช้ได้จริงไหม)
//	RequireRole    — คุณมีสิทธิ์ทำสิ่งนี้ไหม
//
// ถ้าสองตัวนี้พลาด ทุก endpoint หลังจากนั้นเปิดโล่งหมด

const authTestSecret = "test-secret-for-middleware"

// protectedRouter สร้าง router ที่มี endpoint เดียวซึ่งต้องผ่าน AuthMiddleware
//
// handler ปลายทางตอบ 200 พร้อม userID/role ที่ middleware ใส่ไว้ใน context
// เพื่อยืนยันว่าค่าถูกส่งต่อไปให้ handler จริง ไม่ใช่แค่ผ่านด่านมาได้
func protectedRouter(extra ...gin.HandlerFunc) *gin.Engine {
	r := gin.New()

	handlers := append([]gin.HandlerFunc{AuthMiddleware()}, extra...)
	handlers = append(handlers, func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"userID": c.GetFloat64("userID"),
			"role":   c.GetString("role"),
		})
	})

	r.GET("/protected", handlers...)
	return r
}

// callProtected ยิง request พร้อม Authorization header ที่กำหนด
//
// ชื่อยาวหน่อยเพราะ ratelimit_test.go มี call() ของตัวเองอยู่แล้ว
// ไฟล์เทสในแพ็กเกจเดียวกันใช้ namespace ร่วมกัน ชื่อจึงห้ามซ้ำ
func callProtected(r *gin.Engine, authHeader string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	if authHeader != "" {
		req.Header.Set("Authorization", authHeader)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

// ─────────────────────────────────────────────────────────────────────────────
// AuthMiddleware
// ─────────────────────────────────────────────────────────────────────────────

// token ที่ถูกต้องต้องผ่าน และส่ง userID/role ต่อให้ handler
func TestAuthMiddlewareAcceptsValidToken(t *testing.T) {
	t.Setenv("JWT_SECRET", authTestSecret)

	tok, err := token.GenerateAccessToken(99, "coach")
	if err != nil {
		t.Fatalf("ออก token ไม่สำเร็จ: %v", err)
	}

	w := callProtected(protectedRouter(), "Bearer "+tok)
	if w.Code != http.StatusOK {
		t.Fatalf("token ที่ถูกต้องควรผ่าน แต่ได้ %d — %s", w.Code, w.Body.String())
	}
	if !containsAll(w.Body.String(), "99", "coach") {
		t.Fatalf("handler ควรได้รับ userID กับ role แต่ได้: %s", w.Body.String())
	}
}

// request ที่ไม่มี token หรือรูปแบบ header ผิด ต้องถูกปฏิเสธด้วย 401
func TestAuthMiddlewareRejectsBadHeaders(t *testing.T) {
	t.Setenv("JWT_SECRET", authTestSecret)

	tok, _ := token.GenerateAccessToken(1, "admin")

	cases := []struct {
		name   string
		header string
	}{
		{"ไม่มี header เลย", ""},
		{"มีแต่คำว่า Bearer", "Bearer"},
		{"ไม่มีคำว่า Bearer นำหน้า", tok},
		{"ใช้ scheme อื่น", "Basic " + tok},
		{"token มั่ว", "Bearer abc.def.ghi"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := callProtected(protectedRouter(), tc.header).Code; got != http.StatusUnauthorized {
				t.Fatalf("ควรได้ 401 แต่ได้ %d", got)
			}
		})
	}
}

// ⚠️ เทสสำคัญ: เอา refresh token มาใช้แทน access token ต้องไม่ผ่าน
//
// refresh token อายุ 7 วัน ส่วน access token 15 นาที ถ้าสลับกันใช้ได้
// คนที่ขโมย refresh token ไปจะเข้าถึง API ได้ยาวเป็นสัปดาห์
func TestAuthMiddlewareRejectsRefreshTokenAsAccess(t *testing.T) {
	t.Setenv("JWT_SECRET", authTestSecret)

	refresh, err := token.GenerateRefreshToken(1)
	if err != nil {
		t.Fatalf("ออก token ไม่สำเร็จ: %v", err)
	}

	if got := callProtected(protectedRouter(), "Bearer "+refresh).Code; got != http.StatusUnauthorized {
		t.Fatalf("refresh token ต้องใช้แทน access token ไม่ได้ แต่ได้ %d", got)
	}
}

// token ที่หมดอายุแล้วต้องถูกปฏิเสธ
func TestAuthMiddlewareRejectsExpiredToken(t *testing.T) {
	t.Setenv("JWT_SECRET", authTestSecret)

	expired := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id": 1,
		"role":    "admin",
		"type":    token.TypeAccess,
		"exp":     time.Now().Add(-time.Minute).Unix(),
	})
	signed, _ := expired.SignedString([]byte(authTestSecret))

	if got := callProtected(protectedRouter(), "Bearer "+signed).Code; got != http.StatusUnauthorized {
		t.Fatalf("token หมดอายุต้องได้ 401 แต่ได้ %d", got)
	}
}

// token ที่เซ็นด้วย secret อื่นต้องถูกปฏิเสธ
func TestAuthMiddlewareRejectsForgedToken(t *testing.T) {
	forged := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id": 1,
		"role":    "admin",
		"type":    token.TypeAccess,
		"exp":     time.Now().Add(time.Hour).Unix(),
	})
	signed, _ := forged.SignedString([]byte("secret-ของคนร้าย"))

	t.Setenv("JWT_SECRET", authTestSecret)

	if got := callProtected(protectedRouter(), "Bearer "+signed).Code; got != http.StatusUnauthorized {
		t.Fatalf("token ปลอมต้องได้ 401 แต่ได้ %d", got)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// RequireRole
// ─────────────────────────────────────────────────────────────────────────────

// บทบาทที่อยู่ในรายการต้องผ่าน บทบาทอื่นต้องได้ 403
//
// 403 ไม่ใช่ 401 เพราะยืนยันตัวตนผ่านแล้ว แค่ไม่มีสิทธิ์ทำสิ่งนี้
// (และ 401 จะทำให้ SessionGuard ฝั่งหน้าเว็บเด้งผู้ใช้ออกโดยไม่จำเป็น)
func TestRequireRole(t *testing.T) {
	t.Setenv("JWT_SECRET", authTestSecret)

	cases := []struct {
		name     string
		userRole string
		allow    []string
		want     int
	}{
		{"แอดมินเข้าหน้าแอดมิน", "admin", []string{"admin"}, http.StatusOK},
		{"ผู้เรียนเข้าหน้าแอดมิน", "customer", []string{"admin"}, http.StatusForbidden},
		{"โค้ชเข้าหน้าแอดมิน", "coach", []string{"admin"}, http.StatusForbidden},
		{"โค้ชเข้าหน้าที่เปิดให้โค้ชกับแอดมิน", "coach", []string{"admin", "coach"}, http.StatusOK},
		{"ผู้เรียนเข้าหน้าที่เปิดให้โค้ชกับแอดมิน", "customer", []string{"admin", "coach"}, http.StatusForbidden},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			tok, err := token.GenerateAccessToken(1, tc.userRole)
			if err != nil {
				t.Fatalf("ออก token ไม่สำเร็จ: %v", err)
			}

			r := protectedRouter(RequireRole(tc.allow...))
			if got := callProtected(r, "Bearer "+tok).Code; got != tc.want {
				t.Fatalf("ควรได้ %d แต่ได้ %d", tc.want, got)
			}
		})
	}
}

// RequireRole ที่ถูกเรียกโดยไม่มี AuthMiddleware นำหน้า ต้องปฏิเสธ ไม่ใช่ปล่อยผ่าน
//
// กันกรณีที่มีคนเผลอผูก RequireRole ไว้กับ route สาธารณะ
// ถ้าปล่อยผ่านเมื่อไม่มี role ใน context จะกลายเป็นเปิดโล่งโดยไม่มีใครรู้
func TestRequireRoleFailsClosedWithoutAuth(t *testing.T) {
	r := gin.New()
	r.GET("/protected", RequireRole("admin"), func(c *gin.Context) {
		c.Status(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("ไม่มีข้อมูล role ต้องปฏิเสธ (403) แต่ได้ %d", w.Code)
	}
}

// containsAll เช็คว่าข้อความมีชิ้นส่วนที่ต้องการครบทุกตัว
func containsAll(s string, parts ...string) bool {
	for _, p := range parts {
		if !strings.Contains(s, p) {
			return false
		}
	}
	return true
}
