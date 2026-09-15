package services

import (
	"errors"
	"testing"
	"time"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"

	"golang.org/x/crypto/bcrypt"
)

func TestLoginRejectsUnverifiedEmail(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret-auth")
	db := newTestDB(t, &models.User{}, &models.Customer{}, &models.Coach{})

	hash, _ := bcrypt.GenerateFromPassword([]byte("รหัสผ่าน1"), bcrypt.DefaultCost)
	user := models.User{
		Role:      models.CustomerRole,
		FirstName: "รอ",
		LastName:  "ยืนยัน",
		Email:     "unverified@example.com",
		Password:  string(hash),
	}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("สร้างผู้ใช้ไม่สำเร็จ: %v", err)
	}

	svc := NewAuthService(db)
	_, _, _, err := svc.Login(dto.LoginInput{Email: user.Email, Password: "รหัสผ่าน1"})
	if !errors.Is(err, ErrEmailNotVerified) {
		t.Fatalf("บัญชีที่ยังไม่ยืนยันอีเมลต้อง login ไม่ผ่าน แต่ได้: %v", err)
	}
}

func TestLoginAllowsVerifiedEmail(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret-auth")
	db := newTestDB(t, &models.User{}, &models.Customer{}, &models.Coach{})

	hash, _ := bcrypt.GenerateFromPassword([]byte("รหัสผ่าน1"), bcrypt.DefaultCost)
	now := time.Now()
	user := models.User{
		Role:            models.CustomerRole,
		FirstName:       "ยืนยัน",
		LastName:        "แล้ว",
		Email:           "verified@example.com",
		Password:        string(hash),
		EmailVerifiedAt: &now,
	}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("สร้างผู้ใช้ไม่สำเร็จ: %v", err)
	}

	svc := NewAuthService(db)
	access, refresh, loggedIn, err := svc.Login(dto.LoginInput{Email: user.Email, Password: "รหัสผ่าน1"})
	if err != nil {
		t.Fatalf("บัญชีที่ยืนยันแล้วควร login ผ่าน แต่ได้: %v", err)
	}
	if access == "" || refresh == "" || loggedIn == nil {
		t.Fatal("ควรได้ token และข้อมูลผู้ใช้กลับมาครบ")
	}
}
