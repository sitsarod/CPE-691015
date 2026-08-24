package middlewares

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"CPE-691015/internal/models"
	"CPE-691015/internal/token"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// เทสชุดนี้คุมสองด่านที่ทุก request ต้องผ่าน
//
//	AuthMiddleware — คุณเป็นใคร (token ใช้ได้จริงไหม)
//	RequireRole    — คุณมีสิทธิ์ทำสิ่งนี้ไหม
//
// ถ้าสองตัวนี้พลาด ทุก endpoint หลังจากนั้นเปิดโล่งหมด

const authTestSecret = "test-secret-for-middleware"

// authTestDB สร้าง sqlite ในหน่วยความจำพร้อมผู้ใช้ตัวอย่าง
//
// AuthMiddleware ต้องอ่าน token_version จากฐานทุก request จึงต้องมีฐานจริง
// ให้เทสใช้ ไม่สามารถส่ง nil เข้าไปได้
//
// versions คือ token_version ของผู้ใช้ id 1, 2, 3 ... ตามลำดับ
func authTestDB(t *testing.T, versions ...int) *gorm.DB {
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

	if err := db.AutoMigrate(&models.User{}); err != nil {
		t.Fatalf("AutoMigrate ไม่สำเร็จ: %v", err)
	}

	for i, v := range versions {
		user := models.User{
			Role:         models.CustomerRole,
			FirstName:    "ผู้ใช้",
			LastName:     "ทดสอบ",
			Email:        strings.Repeat("a", i+1) + "@example.com",
			Password:     "hash",
			TokenVersion: v,
		}
		user.ID = uint(i + 1)
		if err := db.Create(&user).Error; err != nil {
			t.Fatalf("สร้างผู้ใช้ทดสอบไม่สำเร็จ: %v", err)
		}
	}

	return db
}

// protectedRouter สร้าง router ที่มี endpoint เดียวซึ่งต้องผ่าน AuthMiddleware
//
// handler ปลายทางตอบ 200 พร้อม userID/role ที่ middleware ใส่ไว้ใน context
// เพื่อยืนยันว่าค่าถูกส่งต่อไปให้ handler จริง ไม่ใช่แค่ผ่านด่านมาได้
func protectedRouter(db *gorm.DB, extra ...gin.HandlerFunc) *gin.Engine {
	r := gin.New()

	handlers := append([]gin.HandlerFunc{AuthMiddleware(db)}, extra...)
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

	// ผู้ใช้ id 1 มี token_version = 0
	db := authTestDB(t, 0)

	tok, err := token.GenerateAccessToken(1, "coach", 0)
	if err != nil {
		t.Fatalf("ออก token ไม่สำเร็จ: %v", err)
	}

	w := callProtected(protectedRouter(db), "Bearer "+tok)
	if w.Code != http.StatusOK {
		t.Fatalf("token ที่ถูกต้องควรผ่าน แต่ได้ %d — %s", w.Code, w.Body.String())
	}
	if !containsAll(w.Body.String(), "1", "coach") {
		t.Fatalf("handler ควรได้รับ userID กับ role แต่ได้: %s", w.Body.String())
	}
}

// request ที่ไม่มี token หรือรูปแบบ header ผิด ต้องถูกปฏิเสธด้วย 401
func TestAuthMiddlewareRejectsBadHeaders(t *testing.T) {
	t.Setenv("JWT_SECRET", authTestSecret)
	db := authTestDB(t, 0)

	tok, _ := token.GenerateAccessToken(1, "admin", 0)

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
			if got := callProtected(protectedRouter(db), tc.header).Code; got != http.StatusUnauthorized {
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
	db := authTestDB(t, 0)

	refresh, err := token.GenerateRefreshToken(1, 0)
	if err != nil {
		t.Fatalf("ออก token ไม่สำเร็จ: %v", err)
	}

	if got := callProtected(protectedRouter(db), "Bearer "+refresh).Code; got != http.StatusUnauthorized {
		t.Fatalf("refresh token ต้องใช้แทน access token ไม่ได้ แต่ได้ %d", got)
	}
}

// token ที่หมดอายุแล้วต้องถูกปฏิเสธ
func TestAuthMiddlewareRejectsExpiredToken(t *testing.T) {
	t.Setenv("JWT_SECRET", authTestSecret)
	db := authTestDB(t, 0)

	expired := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id": 1,
		"role":    "admin",
		"type":    token.TypeAccess,
		"exp":     time.Now().Add(-time.Minute).Unix(),
	})
	signed, _ := expired.SignedString([]byte(authTestSecret))

	if got := callProtected(protectedRouter(db), "Bearer "+signed).Code; got != http.StatusUnauthorized {
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
	db := authTestDB(t, 0)

	if got := callProtected(protectedRouter(db), "Bearer "+signed).Code; got != http.StatusUnauthorized {
		t.Fatalf("token ปลอมต้องได้ 401 แต่ได้ %d", got)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// เลขรุ่น token (token_version)
// ─────────────────────────────────────────────────────────────────────────────

// ⚠️ เทสสำคัญที่สุดของกลไกนี้
//
// token ที่ออกก่อนเจ้าของเปลี่ยนรหัสผ่าน ต้องใช้ไม่ได้ทันที
//
// ถ้าเทสนี้พัง แปลว่าการเปลี่ยนรหัสผ่านไม่ได้ไล่คนที่ขโมยบัญชีออกจากระบบจริง
// ซึ่งอันตรายกว่าไม่มีปุ่มเปลี่ยนรหัสเลย เพราะเจ้าของจะเข้าใจว่าปลอดภัยแล้ว
func TestAuthMiddlewareRejectsTokenFromBeforePasswordChange(t *testing.T) {
	t.Setenv("JWT_SECRET", authTestSecret)

	// ในฐาน ผู้ใช้คนนี้เปลี่ยนรหัสผ่านไปแล้ว 1 ครั้ง (เลขรุ่นเดินเป็น 1)
	db := authTestDB(t, 1)

	// แต่ token ใบนี้ออกตั้งแต่ตอนที่ยังเป็นรุ่น 0
	tok, err := token.GenerateAccessToken(1, "customer", 0)
	if err != nil {
		t.Fatalf("ออก token ไม่สำเร็จ: %v", err)
	}

	if got := callProtected(protectedRouter(db), "Bearer "+tok).Code; got != http.StatusUnauthorized {
		t.Fatalf("token ที่ออกก่อนเปลี่ยนรหัสผ่านต้องได้ 401 แต่ได้ %d", got)
	}
}

// token รุ่นตรงกันต้องผ่านตามปกติ
func TestAuthMiddlewareAcceptsMatchingTokenVersion(t *testing.T) {
	t.Setenv("JWT_SECRET", authTestSecret)
	db := authTestDB(t, 3)

	tok, _ := token.GenerateAccessToken(1, "customer", 3)

	if got := callProtected(protectedRouter(db), "Bearer "+tok).Code; got != http.StatusOK {
		t.Fatalf("เลขรุ่นตรงกันต้องผ่าน แต่ได้ %d", got)
	}
}

// ⚠️ token เก่าที่ไม่มี claim "tv" ต้องยังใช้ได้ ถ้าผู้ใช้ยังไม่เคยเปลี่ยนรหัสผ่าน
//
// เป็นการรองรับ token ที่ออกไปก่อนจะมีฟีเจอร์นี้ ถ้าไม่ทำแบบนี้
// ทุกคนที่ล็อกอินค้างอยู่จะถูกเตะออกพร้อมกันตอนอัปเดตโค้ด
func TestAuthMiddlewareTreatsMissingVersionAsZero(t *testing.T) {
	t.Setenv("JWT_SECRET", authTestSecret)
	db := authTestDB(t, 0)

	// สร้าง token แบบเดิมที่ไม่มี claim "tv"
	old := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id": 1,
		"role":    "customer",
		"type":    token.TypeAccess,
		"exp":     time.Now().Add(time.Hour).Unix(),
	})
	signed, _ := old.SignedString([]byte(authTestSecret))

	if got := callProtected(protectedRouter(db), "Bearer "+signed).Code; got != http.StatusOK {
		t.Fatalf("token เก่าที่ไม่มีเลขรุ่นควรยังใช้ได้ แต่ได้ %d", got)
	}
}

// ผู้ใช้ที่ถูกลบไปแล้วต้องเข้าไม่ได้ แม้ token จะยังไม่หมดอายุ
//
// เดิม middleware เชื่อ token อย่างเดียว บัญชีที่ถูกลบจึงยังเรียก API ได้
// ต่ออีกจนกว่า token จะหมดอายุ
func TestAuthMiddlewareRejectsDeletedUser(t *testing.T) {
	t.Setenv("JWT_SECRET", authTestSecret)

	// ฐานว่างเปล่า ไม่มีผู้ใช้คนไหนเลย
	db := authTestDB(t)

	tok, _ := token.GenerateAccessToken(1, "admin", 0)

	if got := callProtected(protectedRouter(db), "Bearer "+tok).Code; got != http.StatusUnauthorized {
		t.Fatalf("บัญชีที่ไม่มีอยู่แล้วต้องได้ 401 แต่ได้ %d", got)
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
	db := authTestDB(t, 0)

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
			tok, err := token.GenerateAccessToken(1, tc.userRole, 0)
			if err != nil {
				t.Fatalf("ออก token ไม่สำเร็จ: %v", err)
			}

			r := protectedRouter(db, RequireRole(tc.allow...))
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
