// Package token รวมศูนย์การจัดการ JWT ทั้งหมด (อ่าน secret, สร้าง/ตรวจสอบ token)
// ให้ทั้ง service และ middleware เรียกใช้จากที่เดียว จะได้ไม่มีค่า secret hardcode
// กระจายอยู่หลายที่และไม่มีพฤติกรรมตรวจ token ที่ไม่ตรงกัน
package token

import (
	"errors"
	"fmt"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	// AccessTokenTTL อายุของ access token — สั้น เพราะถูกส่งทุก request
	AccessTokenTTL = 15 * time.Minute
	// RefreshTokenTTL อายุของ refresh token — ยาว ใช้ขอ access token ใหม่โดยไม่ต้อง login ซ้ำ
	RefreshTokenTTL = 7 * 24 * time.Hour

	// ResetTokenTTL อายุของ token สำหรับรีเซ็ตรหัสผ่าน (ใช้ครั้งเดียวช่วงสั้น ๆ หลังยืนยัน OTP)
	ResetTokenTTL = 15 * time.Minute

	// ประเภทของ token ใช้กันไม่ให้เอา refresh token ไปใช้แทน access token (และกลับกัน)
	TypeAccess  = "access"
	TypeRefresh = "refresh"
)

// ErrMissingSecret ถูกคืนเมื่อไม่ได้ตั้งค่า JWT_SECRET ใน environment
var ErrMissingSecret = errors.New("JWT_SECRET is not set in environment")

// secret อ่านค่า JWT_SECRET จาก env — ไม่มี fallback แบบ hardcode อีกต่อไป
// ถ้าไม่ได้ตั้งค่าจะคืน error ให้ผู้เรียกจัดการ (แทนที่จะ panic หรือใช้ค่า default ที่เดาได้)
func secret() ([]byte, error) {
	s := os.Getenv("JWT_SECRET")
	if s == "" {
		return nil, ErrMissingSecret
	}
	return []byte(s), nil
}

// Validate ใช้เรียกตอน startup เพื่อ fail fast ถ้ายังไม่ได้ตั้ง JWT_SECRET
// (ป้องกันไม่ให้เซิร์ฟเวอร์สตาร์ทขึ้นมาแล้วทุก request พังตอน runtime)
func Validate() error {
	_, err := secret()
	return err
}

// GenerateAccessToken สร้าง access token ที่บรรจุ user_id, role และเลขรุ่น token
func GenerateAccessToken(userID uint, role string, tokenVersion int) (string, error) {
	return generate(jwt.MapClaims{
		"user_id": userID,
		"role":    role,
		"type":    TypeAccess,
		"tv":      tokenVersion,
		"exp":     time.Now().Add(AccessTokenTTL).Unix(),
	})
}

// GenerateRefreshToken สร้าง refresh token ที่บรรจุ user_id และเลขรุ่น token
// (ไม่ใส่ role เพราะจะไปดึง role ล่าสุดจาก DB ตอน refresh เผื่อสิทธิ์ถูกเปลี่ยน)
func GenerateRefreshToken(userID uint, tokenVersion int) (string, error) {
	return generate(jwt.MapClaims{
		"user_id": userID,
		"type":    TypeRefresh,
		"tv":      tokenVersion,
		"exp":     time.Now().Add(RefreshTokenTTL).Unix(),
	})
}

// GenerateResetToken สร้าง token ชั่วคราวสำหรับรีเซ็ตรหัสผ่านหลังยืนยัน OTP สำเร็จ
func GenerateResetToken(email string) (string, error) {
	return generate(jwt.MapClaims{
		"email":  email,
		"action": "reset_password",
		"exp":    time.Now().Add(ResetTokenTTL).Unix(),
	})
}

func generate(claims jwt.MapClaims) (string, error) {
	key, err := secret()
	if err != nil {
		return "", err
	}
	t := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return t.SignedString(key)
}

// Parse ตรวจสอบลายเซ็นและวันหมดอายุของ token แล้วคืน claims
// (jwt.Parse เช็ค exp ให้อัตโนมัติ token ที่หมดอายุจะคืน error)
func Parse(tokenString string) (jwt.MapClaims, error) {
	key, err := secret()
	if err != nil {
		return nil, err
	}

	t, err := jwt.Parse(tokenString, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return key, nil
	})
	if err != nil {
		return nil, err
	}
	if !t.Valid {
		return nil, errors.New("invalid token")
	}

	claims, ok := t.Claims.(jwt.MapClaims)
	if !ok {
		return nil, errors.New("invalid token claims")
	}
	return claims, nil
}

// UserID ดึง user_id ออกจาก claims แล้วแปลงเป็น uint
// (ค่าใน JWT ถูก decode กลับมาเป็น float64 เสมอ จึงต้องแปลง)
func UserID(claims jwt.MapClaims) (uint, error) {
	raw, ok := claims["user_id"]
	if !ok {
		return 0, errors.New("token has no user_id")
	}
	f, ok := raw.(float64)
	if !ok {
		return 0, errors.New("invalid user_id in token")
	}
	return uint(f), nil
}

// Version ดึงเลขรุ่น token (claim "tv") ออกจาก claims
//
// ⚠️ token ที่ไม่มี claim นี้ให้ถือว่าเป็นรุ่น 0 ไม่ใช่ error
//
// เป็นการจงใจเพื่อรองรับ token ที่ออกไปก่อนจะมีฟีเจอร์นี้ ซึ่งตรงกับค่าเริ่มต้น
// ของคอลัมน์ token_version ในฐาน ผู้ใช้ที่ล็อกอินค้างอยู่ตอนอัปเดตโค้ดจึงไม่ถูก
// เตะออกจากระบบ
//
// ความเสี่ยงที่ยอมรับ: ถ้าวันหนึ่งต้องการบังคับให้ทุกคนล็อกอินใหม่พร้อมกัน
// ต้องสั่ง UPDATE users SET token_version = token_version + 1 เอง
func Version(claims jwt.MapClaims) int {
	raw, ok := claims["tv"]
	if !ok {
		return 0
	}
	f, ok := raw.(float64)
	if !ok {
		return 0
	}
	return int(f)
}
