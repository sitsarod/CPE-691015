package controllers

import (
	"net/http/httptest"
	"os"
	"testing"

	"CPE-691015/internal/models"

	"github.com/gin-gonic/gin"
)

// เทสชุดนี้คุมด่านกัน IDOR — คือด่านที่ตอบคำถามว่า
// "ข้อมูลชิ้นนี้เป็นของคุณจริงไหม"
//
// ⚠️ ช่องโหว่ IDOR เป็นชนิดที่เงียบที่สุด ระบบทำงานปกติทุกอย่าง ไม่มี error
// ไม่มี log ผิดปกติ แค่คนอื่นเปิดดู (หรือแก้) ข้อมูลของเราได้โดยเปลี่ยนเลข id ใน URL
// จึงต้องมีเทสคุมไว้ เพราะการทดสอบด้วยมือแทบไม่มีทางเจอ

// ปิดโหมด debug ของ gin ตอนรันเทส ไม่งั้น log รกจนอ่านผลไม่ออก
func TestMain(m *testing.M) {
	gin.SetMode(gin.TestMode)
	os.Exit(m.Run())
}

// ctxWithAuth สร้าง gin context จำลองที่มีข้อมูลผู้ใช้อยู่แล้ว
// เหมือนกับที่ AuthMiddleware ใส่ไว้หลังตรวจ token ผ่าน
//
// userID ใส่เป็น float64 โดยตั้งใจ เพราะค่าที่ถอดจาก JWT เป็น float64 เสมอ
// (ดู GetAuthContext) ถ้าใส่เป็น uint เทสจะผ่านแต่ของจริงพัง
func ctxWithAuth(userID float64, role string) *gin.Context {
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Set("userID", userID)
	c.Set("role", role)
	return c
}

// ─────────────────────────────────────────────────────────────────────────────
// GetAuthContext
// ─────────────────────────────────────────────────────────────────────────────

func TestGetAuthContext(t *testing.T) {
	userID, role, ok := GetAuthContext(ctxWithAuth(42, "coach"))

	if !ok {
		t.Fatal("ควรอ่านข้อมูลผู้ใช้ได้")
	}
	if userID != 42 || role != "coach" {
		t.Fatalf("ควรได้ (42, coach) แต่ได้ (%d, %s)", userID, role)
	}
}

// context ที่ไม่มีข้อมูลผู้ใช้ หรือมีแต่ผิดชนิด ต้องคืน ok = false
//
// ทุกจุดที่เรียก GetAuthContext จะตอบ 401 เมื่อ ok = false
// ถ้าตรงนี้คืน true พร้อม userID = 0 จะกลายเป็น request นิรนามที่ระบบคิดว่าเป็น "ผู้ใช้ id 0"
func TestGetAuthContextFailsClosed(t *testing.T) {
	cases := []struct {
		name  string
		setup func(*gin.Context)
	}{
		{"ไม่มีอะไรเลย", func(c *gin.Context) {}},
		{"มีแต่ userID", func(c *gin.Context) { c.Set("userID", float64(1)) }},
		{"มีแต่ role", func(c *gin.Context) { c.Set("role", "admin") }},
		{"userID ผิดชนิด", func(c *gin.Context) {
			c.Set("userID", "1") // ข้อความ ไม่ใช่ float64
			c.Set("role", "admin")
		}},
		{"role ผิดชนิด", func(c *gin.Context) {
			c.Set("userID", float64(1))
			c.Set("role", 123)
		}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			tc.setup(c)

			if _, _, ok := GetAuthContext(c); ok {
				t.Fatal("ควรคืน ok = false แต่ได้ true")
			}
		})
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// CheckIDOR
// ─────────────────────────────────────────────────────────────────────────────

// เจ้าของข้อมูลเข้าถึงของตัวเองได้ คนอื่นเข้าไม่ได้ แอดมินเข้าได้ทุกคน
func TestCheckIDOR(t *testing.T) {
	cases := []struct {
		name     string
		userID   float64
		role     string
		targetID uint
		want     bool
	}{
		{"เจ้าของเข้าถึงของตัวเอง", 5, "customer", 5, true},
		{"ผู้เรียนเข้าถึงของคนอื่น", 5, "customer", 6, false},
		{"โค้ชเข้าถึงของคนอื่น", 5, "coach", 6, false},
		{"แอดมินเข้าถึงของคนอื่น", 5, "admin", 6, true},
		{"แอดมินเข้าถึงของตัวเอง", 5, "admin", 5, true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := CheckIDOR(ctxWithAuth(tc.userID, tc.role), tc.targetID)
			if got != tc.want {
				t.Fatalf("ควรได้ %v แต่ได้ %v", tc.want, got)
			}
		})
	}
}

// ⚠️ เทสสำคัญ: ไม่ได้ล็อกอินต้องเข้าไม่ได้ แม้ id จะตรงกัน
//
// ถ้า GetAuthContext คืน userID = 0 พร้อม ok = true (ซึ่งไม่ควรเกิด)
// แล้วมีข้อมูลที่ targetID = 0 อยู่ในระบบ คนที่ไม่ได้ล็อกอินจะเข้าถึงได้ทันที
// เทสนี้ยืนยันว่า CheckIDOR ปฏิเสธตั้งแต่ขั้นอ่าน context ไม่ได้
func TestCheckIDORFailsClosedWithoutAuth(t *testing.T) {
	c, _ := gin.CreateTestContext(httptest.NewRecorder())

	if CheckIDOR(c, 0) {
		t.Fatal("ไม่ได้ล็อกอินต้องเข้าถึงไม่ได้ แม้ targetID จะเป็น 0")
	}
	if CheckIDOR(c, 1) {
		t.Fatal("ไม่ได้ล็อกอินต้องเข้าถึงไม่ได้")
	}
}

// role ที่สะกดผิดหรือปลอมมาต้องไม่ได้สิทธิ์แอดมิน
//
// การเทียบ role ใช้การเทียบข้อความตรง ๆ ถ้าวันหนึ่งมีคนเปลี่ยนไปเทียบแบบ
// ไม่สนตัวพิมพ์ หรือใช้ strings.Contains ช่องโหว่จะเปิดทันที
func TestCheckIDORRejectsLookalikeAdminRole(t *testing.T) {
	fakeRoles := []string{"Admin", "ADMIN", "admin ", " admin", "administrator", "superadmin", ""}

	for _, role := range fakeRoles {
		t.Run("role="+role, func(t *testing.T) {
			if CheckIDOR(ctxWithAuth(5, role), 6) {
				t.Fatalf("role %q ไม่ควรได้สิทธิ์แอดมิน", role)
			}
		})
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// IsAdmin / IsCoach
// ─────────────────────────────────────────────────────────────────────────────

func TestIsAdminAndIsCoach(t *testing.T) {
	admin := ctxWithAuth(1, string(models.AdminRole))
	coach := ctxWithAuth(2, string(models.CoachRole))
	customer := ctxWithAuth(3, string(models.CustomerRole))

	if !IsAdmin(admin) {
		t.Error("แอดมินต้องผ่าน IsAdmin")
	}
	if IsAdmin(coach) || IsAdmin(customer) {
		t.Error("โค้ชและผู้เรียนต้องไม่ผ่าน IsAdmin")
	}

	if !IsCoach(coach) {
		t.Error("โค้ชต้องผ่าน IsCoach")
	}
	if IsCoach(admin) || IsCoach(customer) {
		t.Error("แอดมินและผู้เรียนต้องไม่ผ่าน IsCoach")
	}
}

// ไม่ได้ล็อกอินต้องไม่ผ่านทั้งสองตัว
func TestIsAdminIsCoachFailClosed(t *testing.T) {
	c, _ := gin.CreateTestContext(httptest.NewRecorder())

	if IsAdmin(c) {
		t.Error("ไม่ได้ล็อกอินต้องไม่ผ่าน IsAdmin")
	}
	if IsCoach(c) {
		t.Error("ไม่ได้ล็อกอินต้องไม่ผ่าน IsCoach")
	}
}
