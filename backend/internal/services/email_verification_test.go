package services

import (
	"errors"
	"testing"
	"time"

	"CPE-691015/internal/models"

	"gorm.io/gorm"
)

// newEmailVerifyTest เตรียมฐานข้อมูล ผู้ใช้ที่ยังไม่ยืนยัน และ service พร้อมใช้
func newEmailVerifyTest(t *testing.T) (*EmailVerificationService, *fakeMailer, *gorm.DB, models.User) {
	t.Helper()
	t.Setenv("JWT_SECRET", "test-secret-email-verify")

	db := newTestDB(t, &models.User{}, &models.Customer{}, &models.EmailVerificationOTP{})

	user := models.User{
		Role:      models.CustomerRole,
		FirstName: "สมหญิง",
		LastName:  "รอยืนยัน",
		Email:     "somying@example.com",
		Password:  "hashed",
	}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("สร้างผู้ใช้ไม่สำเร็จ: %v", err)
	}

	mailer := &fakeMailer{}
	return NewEmailVerificationService(db, mailer), mailer, db, user
}

func TestSendOTPSkipsAlreadyVerifiedUser(t *testing.T) {
	svc, mailer, _, user := newEmailVerifyTest(t)

	verified := &user
	now := time.Now()
	verified.EmailVerifiedAt = &now

	if err := svc.SendOTP(verified, "1.1.1.1"); err != nil {
		t.Fatalf("ไม่ควร error: %v", err)
	}
	if mailer.sent != 0 {
		t.Fatal("บัญชีที่ยืนยันแล้วไม่ควรถูกส่ง OTP ซ้ำ")
	}
}

func TestVerifyOTPHappyPathIssuesTokens(t *testing.T) {
	svc, mailer, db, user := newEmailVerifyTest(t)

	if err := svc.SendOTP(&user, "1.1.1.1"); err != nil {
		t.Fatalf("ส่ง OTP ไม่สำเร็จ: %v", err)
	}

	verified, access, refresh, err := svc.VerifyOTP(user.Email, mailer.otp(t))
	if err != nil {
		t.Fatalf("ควรยืนยันผ่าน แต่ได้: %v", err)
	}
	if verified.EmailVerifiedAt == nil {
		t.Fatal("ควรปักเวลายืนยันให้แล้ว")
	}
	if access == "" || refresh == "" {
		t.Fatal("ควรได้ token คู่ล็อกอินกลับมาด้วย")
	}

	var reloaded models.User
	if err := db.First(&reloaded, user.ID).Error; err != nil {
		t.Fatalf("โหลดผู้ใช้ไม่สำเร็จ: %v", err)
	}
	if reloaded.EmailVerifiedAt == nil {
		t.Fatal("ค่าที่บันทึกลงฐานควรถูกปักเวลายืนยันแล้วเช่นกัน")
	}
}

func TestVerifyOTPRejectsWrongCode(t *testing.T) {
	svc, _, _, user := newEmailVerifyTest(t)

	if err := svc.SendOTP(&user, "1.1.1.1"); err != nil {
		t.Fatalf("ส่ง OTP ไม่สำเร็จ: %v", err)
	}

	if _, _, _, err := svc.VerifyOTP(user.Email, "000000"); !errors.Is(err, ErrEmailOTPInvalid) {
		t.Fatalf("รหัสผิดควรได้ ErrEmailOTPInvalid แต่ได้: %v", err)
	}
}

func TestVerifyOTPRejectsAfterAlreadyVerified(t *testing.T) {
	svc, mailer, _, user := newEmailVerifyTest(t)

	if err := svc.SendOTP(&user, "1.1.1.1"); err != nil {
		t.Fatalf("ส่ง OTP ไม่สำเร็จ: %v", err)
	}
	code := mailer.otp(t)

	if _, _, _, err := svc.VerifyOTP(user.Email, code); err != nil {
		t.Fatalf("ครั้งแรกควรผ่าน: %v", err)
	}
	if _, _, _, err := svc.VerifyOTP(user.Email, code); !errors.Is(err, ErrEmailOTPInvalid) {
		t.Fatalf("ยืนยันซ้ำควรถูกปฏิเสธ แต่ได้: %v", err)
	}
}

func TestResendOTPSilentWhenAccountNotFound(t *testing.T) {
	svc, mailer, _, _ := newEmailVerifyTest(t)

	if err := svc.ResendOTP("ไม่มีคนนี้@example.com", "1.1.1.1"); err != nil {
		t.Fatalf("ไม่ควร error แม้ไม่พบบัญชี: %v", err)
	}
	if mailer.sent != 0 {
		t.Fatal("ไม่ควรมีการส่งอีเมลเมื่อไม่พบบัญชี")
	}
}

func TestBackfillEmailVerifiedForExistingUsers(t *testing.T) {
	db := newTestDB(t, &models.User{})

	user := models.User{FirstName: "เก่า", LastName: "แก่", Email: "old@example.com", Password: "hashed"}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("สร้างผู้ใช้ไม่สำเร็จ: %v", err)
	}
	if user.EmailVerifiedAt != nil {
		t.Fatal("ก่อน backfill ควรยังเป็น nil")
	}

	if err := BackfillEmailVerifiedForExistingUsers(db); err != nil {
		t.Fatalf("backfill ไม่สำเร็จ: %v", err)
	}

	var reloaded models.User
	if err := db.First(&reloaded, user.ID).Error; err != nil {
		t.Fatalf("โหลดผู้ใช้ไม่สำเร็จ: %v", err)
	}
	if reloaded.EmailVerifiedAt == nil {
		t.Fatal("หลัง backfill ควรถูกปักเวลายืนยันแล้ว")
	}
}
