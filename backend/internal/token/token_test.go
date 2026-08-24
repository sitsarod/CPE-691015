package token

import (
	"errors"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// เทสชุดนี้คุมชั้นล่างสุดของการยืนยันตัวตน — ถ้าตรงนี้พลาด
// ทุกด่านที่อยู่เหนือขึ้นไป (middleware, CheckIDOR) ก็ไร้ความหมายทันที

const testSecret = "test-secret-do-not-use-in-production"

// withSecret ตั้ง JWT_SECRET ให้เทสหนึ่งตัว แล้วคืนค่าเดิมให้อัตโนมัติเมื่อจบ
func withSecret(t *testing.T) {
	t.Helper()
	t.Setenv("JWT_SECRET", testSecret)
}

// ─────────────────────────────────────────────────────────────────────────────
// JWT_SECRET
// ─────────────────────────────────────────────────────────────────────────────

// ไม่ตั้ง JWT_SECRET ต้อง error ไม่ใช่ถอยไปใช้ค่า default ที่เดาได้
//
// ถ้าเทสนี้พัง = ระบบอาจกลับไปมี secret แบบ hardcode ซึ่งแปลว่า
// ใครอ่านซอร์สโค้ดได้ก็ปลอม token เป็นแอดมินได้ทันที
func TestSecretRequiredFromEnv(t *testing.T) {
	t.Setenv("JWT_SECRET", "")

	if err := Validate(); !errors.Is(err, ErrMissingSecret) {
		t.Fatalf("ไม่ตั้ง JWT_SECRET ต้องได้ ErrMissingSecret แต่ได้: %v", err)
	}

	if _, err := GenerateAccessToken(1, "admin"); err == nil {
		t.Fatal("ไม่ควรออก token ได้เมื่อยังไม่มี secret")
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// ออก token แล้วอ่านกลับได้
// ─────────────────────────────────────────────────────────────────────────────

func TestAccessTokenRoundTrip(t *testing.T) {
	withSecret(t)

	tok, err := GenerateAccessToken(42, "coach")
	if err != nil {
		t.Fatalf("ออก token ไม่สำเร็จ: %v", err)
	}

	claims, err := Parse(tok)
	if err != nil {
		t.Fatalf("อ่าน token ไม่สำเร็จ: %v", err)
	}

	id, err := UserID(claims)
	if err != nil {
		t.Fatalf("ดึง user_id ไม่สำเร็จ: %v", err)
	}
	if id != 42 {
		t.Fatalf("user_id ควรเป็น 42 แต่ได้ %d", id)
	}
	if claims["role"] != "coach" {
		t.Fatalf("role ควรเป็น coach แต่ได้ %v", claims["role"])
	}
	if claims["type"] != TypeAccess {
		t.Fatalf("type ควรเป็น %s แต่ได้ %v", TypeAccess, claims["type"])
	}
}

// refresh token ต้องไม่มี role ติดไปด้วย
//
// เพราะตอน refresh ระบบจะไปดึง role ล่าสุดจากฐานข้อมูล ถ้าฝัง role ไว้ใน token
// คนที่ถูกลดสิทธิ์จากแอดมินเป็นผู้เรียนจะยังใช้สิทธิ์แอดมินได้จนกว่า token จะหมดอายุ
func TestRefreshTokenCarriesNoRole(t *testing.T) {
	withSecret(t)

	tok, err := GenerateRefreshToken(7)
	if err != nil {
		t.Fatalf("ออก token ไม่สำเร็จ: %v", err)
	}

	claims, err := Parse(tok)
	if err != nil {
		t.Fatalf("อ่าน token ไม่สำเร็จ: %v", err)
	}

	if _, hasRole := claims["role"]; hasRole {
		t.Fatal("refresh token ต้องไม่มี role ติดไปด้วย")
	}
	if claims["type"] != TypeRefresh {
		t.Fatalf("type ควรเป็น %s แต่ได้ %v", TypeRefresh, claims["type"])
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// token ที่ต้องถูกปฏิเสธ
// ─────────────────────────────────────────────────────────────────────────────

// token ที่เซ็นด้วย secret คนละตัวต้องใช้ไม่ได้
//
// นี่คือหัวใจของ JWT ถ้าเทสนี้พัง = ใครก็ออก token เองแล้วเข้าระบบได้
func TestRejectsTokenSignedWithOtherSecret(t *testing.T) {
	// ออก token ด้วย secret ปลอม
	forged := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id": 1,
		"role":    "admin",
		"type":    TypeAccess,
		"exp":     time.Now().Add(time.Hour).Unix(),
	})
	signed, err := forged.SignedString([]byte("secret-ของคนร้าย"))
	if err != nil {
		t.Fatalf("สร้าง token ปลอมไม่สำเร็จ: %v", err)
	}

	// แล้วเอามาอ่านด้วย secret จริง
	withSecret(t)
	if _, err := Parse(signed); err == nil {
		t.Fatal("token ที่เซ็นด้วย secret คนอื่นต้องถูกปฏิเสธ")
	}
}

// token ที่ประกาศ alg: none ต้องถูกปฏิเสธ
//
// เป็นช่องโหว่คลาสสิกของ JWT: คนร้ายแก้ส่วนหัวเป็น {"alg":"none"} แล้วตัดลายเซ็นทิ้ง
// ถ้าไลบรารีเชื่อค่านั้น จะกลายเป็นว่า token ที่ไม่มีลายเซ็นเลยก็ใช้ได้
func TestRejectsAlgNone(t *testing.T) {
	withSecret(t)

	unsigned := jwt.NewWithClaims(jwt.SigningMethodNone, jwt.MapClaims{
		"user_id": 1,
		"role":    "admin",
		"type":    TypeAccess,
		"exp":     time.Now().Add(time.Hour).Unix(),
	})
	signed, err := unsigned.SignedString(jwt.UnsafeAllowNoneSignatureType)
	if err != nil {
		t.Fatalf("สร้าง token alg:none ไม่สำเร็จ: %v", err)
	}

	if _, err := Parse(signed); err == nil {
		t.Fatal("token ที่ใช้ alg:none ต้องถูกปฏิเสธ")
	}
}

// token ที่หมดอายุแล้วต้องใช้ไม่ได้
func TestRejectsExpiredToken(t *testing.T) {
	withSecret(t)

	expired := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id": 1,
		"role":    "admin",
		"type":    TypeAccess,
		"exp":     time.Now().Add(-time.Hour).Unix(), // หมดอายุไปแล้วชั่วโมงนึง
	})
	signed, err := expired.SignedString([]byte(testSecret))
	if err != nil {
		t.Fatalf("สร้าง token ไม่สำเร็จ: %v", err)
	}

	if _, err := Parse(signed); err == nil {
		t.Fatal("token ที่หมดอายุต้องถูกปฏิเสธ")
	}
}

// ข้อความมั่ว ๆ ที่ไม่ใช่ token ต้องไม่ทำให้ panic
func TestRejectsGarbage(t *testing.T) {
	withSecret(t)

	for _, s := range []string{"", "abc", "a.b.c", "Bearer something"} {
		if _, err := Parse(s); err == nil {
			t.Fatalf("%q ไม่ใช่ token ที่ถูกต้อง ต้องถูกปฏิเสธ", s)
		}
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// UserID
// ─────────────────────────────────────────────────────────────────────────────

// claims ที่ไม่มี user_id หรือมีแต่ผิดชนิด ต้อง error ไม่ใช่คืน 0 เงียบ ๆ
//
// ถ้าคืน 0 เงียบ ๆ จะกลายเป็นว่า request นั้นถูกมองว่าเป็น "ผู้ใช้ id 0"
// ซึ่งอาจไปตรงกับเงื่อนไขบางอย่างโดยไม่ตั้งใจ
func TestUserIDRejectsBadClaims(t *testing.T) {
	cases := []struct {
		name   string
		claims jwt.MapClaims
	}{
		{"ไม่มี user_id", jwt.MapClaims{"role": "admin"}},
		{"user_id เป็นข้อความ", jwt.MapClaims{"user_id": "1"}},
		{"user_id เป็น nil", jwt.MapClaims{"user_id": nil}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := UserID(tc.claims); err == nil {
				t.Fatal("ควรได้ error แต่ผ่านไปได้")
			}
		})
	}
}

// อายุของ token ต้องตรงกับที่ประกาศไว้
//
// access token สั้นเพราะถูกส่งไปกับทุก request มีโอกาสหลุดสูงกว่า
// ส่วน refresh token ยาวได้เพราะถูกใช้นาน ๆ ครั้ง
func TestTokenTTLs(t *testing.T) {
	if AccessTokenTTL >= RefreshTokenTTL {
		t.Fatal("access token ต้องมีอายุสั้นกว่า refresh token")
	}
	if AccessTokenTTL > time.Hour {
		t.Fatalf("access token ไม่ควรอายุเกิน 1 ชั่วโมง แต่ตั้งไว้ %v", AccessTokenTTL)
	}
}
