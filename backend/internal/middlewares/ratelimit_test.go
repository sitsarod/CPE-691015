package middlewares

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

// เทสชุดนี้ไม่ต้องใช้ฐานข้อมูล รันได้เลยด้วย
//
//	go test ./internal/middlewares/
func TestMain(m *testing.M) {
	gin.SetMode(gin.TestMode)
	m.Run()
}

// newTestRouter สร้าง router ที่มี endpoint เดียวผูก rate limit ตามค่าที่ส่งเข้ามา
func newTestRouter(limit int, window time.Duration) *gin.Engine {
	r := gin.New()
	r.POST("/login", RateLimit(limit, window), func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})
	return r
}

// call ยิง request หนึ่งครั้งจาก IP ที่กำหนด แล้วคืน status code
func call(r *gin.Engine, ip string) int {
	req := httptest.NewRequest(http.MethodPost, "/login", nil)
	// gin อ่าน IP จาก RemoteAddr เมื่อไม่เชื่อ proxy (ดู SetTrustedProxies ใน cmd/serve)
	req.RemoteAddr = ip + ":12345"

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w.Code
}

// ยิงไม่เกินเพดานต้องผ่านหมด
func TestRateLimitAllowsUpToLimit(t *testing.T) {
	r := newTestRouter(3, time.Minute)

	for i := 1; i <= 3; i++ {
		if code := call(r, "1.1.1.1"); code != http.StatusOK {
			t.Fatalf("ครั้งที่ %d ควรผ่าน แต่ได้ status %d", i, code)
		}
	}
}

// ยิงเกินเพดานต้องโดนบล็อกด้วย 429
//
// 429 สำคัญมาก ห้ามเป็น 401 เพราะ SessionGuard ฝั่งหน้าเว็บ
// เด้งผู้ใช้ออกจากระบบทุกครั้งที่เจอ 401
func TestRateLimitBlocksOverLimit(t *testing.T) {
	r := newTestRouter(3, time.Minute)

	for i := 0; i < 3; i++ {
		call(r, "2.2.2.2")
	}

	code := call(r, "2.2.2.2")
	if code != http.StatusTooManyRequests {
		t.Fatalf("ครั้งที่เกินเพดานควรได้ 429 แต่ได้ %d", code)
	}
}

// ตอบ 429 ต้องแนบ Retry-After บอกว่าให้รอกี่วินาที
func TestRateLimitSetsRetryAfter(t *testing.T) {
	r := newTestRouter(1, time.Minute)
	call(r, "3.3.3.3")

	req := httptest.NewRequest(http.MethodPost, "/login", nil)
	req.RemoteAddr = "3.3.3.3:12345"
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if got := w.Header().Get("Retry-After"); got == "" {
		t.Fatal("ตอบ 429 แล้วต้องมี header Retry-After เสมอ")
	}
}

// คนละ IP ต้องมีโควตาของตัวเอง
//
// ถ้าเทสนี้พัง แปลว่าคนร้ายคนเดียวยิงจนเต็มโควตาแล้วทำให้คนอื่นทั้งระบบ
// ล็อกอินไม่ได้ ซึ่งกลายเป็นช่องทาง DoS เสียเอง
func TestRateLimitIsPerIP(t *testing.T) {
	r := newTestRouter(2, time.Minute)

	call(r, "4.4.4.4")
	call(r, "4.4.4.4")

	if code := call(r, "4.4.4.4"); code != http.StatusTooManyRequests {
		t.Fatalf("IP แรกควรโดนบล็อกแล้ว แต่ได้ %d", code)
	}

	if code := call(r, "5.5.5.5"); code != http.StatusOK {
		t.Fatalf("IP ที่สองไม่ควรโดนผลจาก IP แรก แต่ได้ %d", code)
	}
}

// พ้นหน้าต่างเวลาแล้วต้องยิงได้ใหม่ ไม่ใช่บล็อกถาวร
func TestRateLimitResetsAfterWindow(t *testing.T) {
	r := newTestRouter(1, 50*time.Millisecond)

	call(r, "6.6.6.6")
	if code := call(r, "6.6.6.6"); code != http.StatusTooManyRequests {
		t.Fatalf("ยังอยู่ในหน้าต่างเวลา ควรโดนบล็อก แต่ได้ %d", code)
	}

	time.Sleep(60 * time.Millisecond)

	if code := call(r, "6.6.6.6"); code != http.StatusOK {
		t.Fatalf("พ้นหน้าต่างเวลาแล้วควรยิงได้ใหม่ แต่ได้ %d", code)
	}
}

// ตั้งค่าใน env ผิด (0, ติดลบ, ไม่ใช่ตัวเลข) ต้องถอยไปใช้ค่า default
// ไม่ใช่กลายเป็นเพดาน 0 ที่บล็อกทุกคน หรือปิดการป้องกันไปเลย
func TestEnvIntFallsBackOnBadValues(t *testing.T) {
	cases := []struct {
		name string
		raw  string
	}{
		{"ไม่ได้ตั้งค่า", ""},
		{"ศูนย์", "0"},
		{"ติดลบ", "-5"},
		{"ไม่ใช่ตัวเลข", "abc"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("RATE_LIMIT_TEST_KEY", tc.raw)

			if got := envInt("RATE_LIMIT_TEST_KEY", 42); got != 42 {
				t.Fatalf("ควรถอยไปใช้ค่า default 42 แต่ได้ %d", got)
			}
		})
	}
}

// ตั้งค่าถูกต้องต้องใช้ค่าจาก env จริง
func TestEnvIntUsesValidValue(t *testing.T) {
	t.Setenv("RATE_LIMIT_TEST_KEY", "7")

	if got := envInt("RATE_LIMIT_TEST_KEY", 42); got != 7 {
		t.Fatalf("ควรได้ 7 จาก env แต่ได้ %d", got)
	}
}
