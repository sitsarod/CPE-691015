package services

import (
	"errors"
	"regexp"
	"strings"
	"testing"
	"time"

	"CPE-691015/internal/models"
	"CPE-691015/internal/token"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// fakeMailer เก็บอีเมลไว้ในหน่วยความจำแทนการส่งจริง
//
// ทำให้เทสอ่าน OTP ที่ระบบออกให้ได้ โดยไม่ต้องต่อเน็ตและไม่ส่งหาใครจริง ๆ
type fakeMailer struct {
	to       string
	subject  string
	body     string
	sent     int
	failNext bool
}

func (m *fakeMailer) Send(to, subject, body string) error {
	if m.failNext {
		return errors.New("จำลองส่งอีเมลล้มเหลว")
	}
	m.to, m.subject, m.body = to, subject, body
	m.sent++
	return nil
}

// otp ดึงเลข 6 หลักออกจากเนื้ออีเมลที่ส่งไป
func (m *fakeMailer) otp(t *testing.T) string {
	t.Helper()

	found := regexp.MustCompile(`\b\d{6}\b`).FindString(m.body)
	if found == "" {
		t.Fatalf("หา OTP ในอีเมลไม่เจอ เนื้อหา: %s", m.body)
	}
	return found
}

// newResetTest เตรียมฐานข้อมูล ผู้ใช้ตัวอย่าง และ service พร้อมใช้
func newResetTest(t *testing.T) (*PasswordResetService, *fakeMailer, *gorm.DB, models.User) {
	t.Helper()
	t.Setenv("JWT_SECRET", "test-secret-password-reset")

	db := newTestDB(t, &models.User{}, &models.Customer{}, &models.PasswordResetOTP{})

	hash, _ := bcrypt.GenerateFromPassword([]byte("รหัสเดิมของฉัน"), bcrypt.DefaultCost)
	user := models.User{
		Role:      models.CustomerRole,
		FirstName: "สมชาย",
		LastName:  "ใจดี",
		Email:     "somchai@example.com",
		Password:  string(hash),
	}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("สร้างผู้ใช้ไม่สำเร็จ: %v", err)
	}

	mailer := &fakeMailer{}
	return NewPasswordResetService(db, mailer), mailer, db, user
}

// ─────────────────────────────────────────────────────────────────────────────
// ขอ OTP
// ─────────────────────────────────────────────────────────────────────────────

// ขอแล้วต้องได้อีเมลที่มีเลข 6 หลัก และฐานต้องเก็บเป็น hash ไม่ใช่ตัวเลข
func TestRequestOTPSendsCodeAndStoresHash(t *testing.T) {
	svc, mailer, db, user := newResetTest(t)

	if err := svc.RequestOTP(user.Email, "1.1.1.1"); err != nil {
		t.Fatalf("ขอ OTP ไม่สำเร็จ: %v", err)
	}

	if mailer.sent != 1 {
		t.Fatalf("ควรส่งอีเมล 1 ฉบับ แต่ส่ง %d", mailer.sent)
	}
	if mailer.to != user.Email {
		t.Fatalf("ควรส่งไปที่ %s แต่ส่งไปที่ %s", user.Email, mailer.to)
	}

	code := mailer.otp(t)

	var otp models.PasswordResetOTP
	if err := db.Where("user_id = ?", user.ID).First(&otp).Error; err != nil {
		t.Fatalf("ควรมีแถว OTP ในฐาน แต่หาไม่เจอ: %v", err)
	}

	// ⚠️ หัวใจของเทสนี้ — ฐานต้องไม่มีตัวเลขจริงเก็บไว้
	if strings.Contains(otp.CodeHash, code) {
		t.Fatal("ฐานข้อมูลเก็บ OTP เป็นตัวเลขตรง ๆ ต้องเก็บเป็น hash เท่านั้น")
	}
	if bcrypt.CompareHashAndPassword([]byte(otp.CodeHash), []byte(code)) != nil {
		t.Fatal("hash ที่เก็บไว้ไม่ตรงกับ OTP ที่ส่งไป")
	}
}

// ⚠️ ขออีเมลที่ไม่มีในระบบต้องตอบเหมือนกรณีปกติ
//
// ถ้าตอบต่างกัน คนที่ไล่ยิงอีเมลจะรู้ว่าอีเมลไหนมีสมาชิกอยู่จริง
// แล้วเอารายชื่อนั้นไปลองรหัสผ่านที่รั่วจากเว็บอื่นต่อ
func TestRequestOTPDoesNotRevealWhetherAccountExists(t *testing.T) {
	svc, mailer, _, _ := newResetTest(t)

	if err := svc.RequestOTP("ไม่มีคนนี้@example.com", "1.1.1.1"); err != nil {
		t.Fatalf("ต้องตอบเหมือนกรณีสำเร็จ แต่ได้ error: %v", err)
	}
	if mailer.sent != 0 {
		t.Fatal("ไม่ควรส่งอีเมลหาคนที่ไม่มีในระบบ")
	}
}

// ขอใหม่ต้องล้างใบเก่าทิ้ง ไม่ให้มีหลายใบใช้ได้พร้อมกัน
func TestRequestOTPInvalidatesPrevious(t *testing.T) {
	svc, mailer, db, user := newResetTest(t)

	svc.RequestOTP(user.Email, "1.1.1.1")
	firstCode := mailer.otp(t)

	svc.RequestOTP(user.Email, "1.1.1.1")

	var count int64
	db.Model(&models.PasswordResetOTP{}).Where("user_id = ? AND used_at IS NULL", user.ID).Count(&count)
	if count != 1 {
		t.Fatalf("ควรเหลือ OTP ที่ใช้ได้ใบเดียว แต่มี %d ใบ", count)
	}

	// ใบเก่าต้องใช้ไม่ได้แล้ว
	if _, err := svc.VerifyOTP(user.Email, firstCode); !errors.Is(err, ErrOTPInvalid) {
		t.Fatalf("OTP ใบเก่าต้องใช้ไม่ได้ แต่ได้: %v", err)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// ยืนยัน OTP
// ─────────────────────────────────────────────────────────────────────────────

func TestVerifyOTPHappyPath(t *testing.T) {
	svc, mailer, _, user := newResetTest(t)

	svc.RequestOTP(user.Email, "1.1.1.1")

	resetToken, err := svc.VerifyOTP(user.Email, mailer.otp(t))
	if err != nil {
		t.Fatalf("ควรยืนยันผ่าน แต่ได้: %v", err)
	}
	if resetToken == "" {
		t.Fatal("ควรได้ reset token กลับมา")
	}
}

// รหัสผิดต้องไม่ผ่าน และต้องนับจำนวนครั้งไว้
func TestVerifyOTPCountsFailedAttempts(t *testing.T) {
	svc, _, db, user := newResetTest(t)
	svc.RequestOTP(user.Email, "1.1.1.1")

	if _, err := svc.VerifyOTP(user.Email, "000000"); !errors.Is(err, ErrOTPInvalid) {
		t.Fatalf("รหัสผิดต้องไม่ผ่าน แต่ได้: %v", err)
	}

	var otp models.PasswordResetOTP
	db.Where("user_id = ?", user.ID).First(&otp)
	if otp.Attempts != 1 {
		t.Fatalf("ควรนับครั้งที่ผิดเป็น 1 แต่ได้ %d", otp.Attempts)
	}
}

// ⚠️ เทสสำคัญ: เดาผิดครบเพดานแล้วต้องใช้ใบนั้นไม่ได้อีก แม้จะกรอกถูก
//
// OTP 6 หลักมีความเป็นไปได้ 1 ล้านแบบ ถ้าเดาได้ไม่จำกัดครั้งจะถูกในเวลาไม่นาน
func TestVerifyOTPLocksAfterTooManyAttempts(t *testing.T) {
	svc, mailer, _, user := newResetTest(t)
	svc.RequestOTP(user.Email, "1.1.1.1")
	correct := mailer.otp(t)

	for i := 0; i < otpMaxAttempts; i++ {
		svc.VerifyOTP(user.Email, "000000")
	}

	// กรอกถูกแล้วก็ต้องไม่ผ่าน เพราะใบนี้ถูกยกเลิกไปแล้ว
	if _, err := svc.VerifyOTP(user.Email, correct); !errors.Is(err, ErrOTPInvalid) {
		t.Fatalf("เดาผิดครบเพดานแล้วต้องใช้ไม่ได้อีก แต่ได้: %v", err)
	}
}

// OTP ที่หมดอายุแล้วต้องใช้ไม่ได้
func TestVerifyOTPRejectsExpired(t *testing.T) {
	svc, mailer, db, user := newResetTest(t)
	svc.RequestOTP(user.Email, "1.1.1.1")
	code := mailer.otp(t)

	// ย้อนเวลาหมดอายุให้เป็นอดีต
	db.Model(&models.PasswordResetOTP{}).
		Where("user_id = ?", user.ID).
		Update("expires_at", time.Now().Add(-time.Minute))

	if _, err := svc.VerifyOTP(user.Email, code); !errors.Is(err, ErrOTPInvalid) {
		t.Fatalf("OTP หมดอายุต้องใช้ไม่ได้ แต่ได้: %v", err)
	}
}

// ใช้ได้ครั้งเดียว — ยืนยันผ่านแล้วเอารหัสเดิมมาใช้ซ้ำไม่ได้
func TestVerifyOTPIsSingleUse(t *testing.T) {
	svc, mailer, _, user := newResetTest(t)
	svc.RequestOTP(user.Email, "1.1.1.1")
	code := mailer.otp(t)

	if _, err := svc.VerifyOTP(user.Email, code); err != nil {
		t.Fatalf("ครั้งแรกควรผ่าน แต่ได้: %v", err)
	}
	if _, err := svc.VerifyOTP(user.Email, code); !errors.Is(err, ErrOTPInvalid) {
		t.Fatalf("ใช้ซ้ำต้องไม่ผ่าน แต่ได้: %v", err)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// ตั้งรหัสผ่านใหม่
// ─────────────────────────────────────────────────────────────────────────────

func TestResetPasswordHappyPath(t *testing.T) {
	svc, mailer, db, user := newResetTest(t)
	svc.RequestOTP(user.Email, "1.1.1.1")
	resetToken, _ := svc.VerifyOTP(user.Email, mailer.otp(t))

	if err := svc.ResetPassword(resetToken, "รหัสผ่านใหม่ที่ยาวพอ"); err != nil {
		t.Fatalf("ควรตั้งรหัสใหม่ได้ แต่ได้: %v", err)
	}

	var updated models.User
	db.First(&updated, user.ID)
	if bcrypt.CompareHashAndPassword([]byte(updated.Password), []byte("รหัสผ่านใหม่ที่ยาวพอ")) != nil {
		t.Fatal("รหัสผ่านใหม่ใช้ไม่ได้")
	}
	if bcrypt.CompareHashAndPassword([]byte(updated.Password), []byte("รหัสเดิมของฉัน")) == nil {
		t.Fatal("รหัสผ่านเดิมต้องใช้ไม่ได้แล้ว")
	}
}

// ⚠️ เทสสำคัญ: เอา access token มาใช้แทน reset token ไม่ได้
//
// ถ้าใช้ได้ คนที่ยึด session ของเหยื่อไปจะเปลี่ยนรหัสผ่านได้เลย
// โดยไม่ต้องรู้รหัสเดิม = ยึดบัญชีถาวร
func TestResetPasswordRejectsNonResetToken(t *testing.T) {
	svc, _, _, user := newResetTest(t)

	accessToken := mustAccessToken(t, user.ID, string(user.Role))

	if err := svc.ResetPassword(accessToken, "รหัสผ่านใหม่ที่ยาวพอ"); !errors.Is(err, ErrResetTokenInvalid) {
		t.Fatalf("access token ต้องใช้แทน reset token ไม่ได้ แต่ได้: %v", err)
	}
}

// token มั่ว ๆ ต้องถูกปฏิเสธ
func TestResetPasswordRejectsGarbageToken(t *testing.T) {
	svc, _, _, _ := newResetTest(t)

	for _, bad := range []string{"", "abc", "a.b.c"} {
		if err := svc.ResetPassword(bad, "รหัสผ่านใหม่ที่ยาวพอ"); err == nil {
			t.Fatalf("token %q ต้องถูกปฏิเสธ", bad)
		}
	}
}

// รหัสใหม่ที่สั้นเกินต้องถูกปฏิเสธ ด่านเดียวกับตอนสมัคร
func TestResetPasswordEnforcesStrength(t *testing.T) {
	svc, mailer, _, user := newResetTest(t)
	svc.RequestOTP(user.Email, "1.1.1.1")
	resetToken, _ := svc.VerifyOTP(user.Email, mailer.otp(t))

	if err := svc.ResetPassword(resetToken, "สั้น"); !errors.Is(err, ErrPasswordTooShort) {
		t.Fatalf("รหัสสั้นเกินต้องถูกปฏิเสธ แต่ได้: %v", err)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// เปลี่ยนรหัสผ่านตอนล็อกอินอยู่
// ─────────────────────────────────────────────────────────────────────────────

func TestChangePassword(t *testing.T) {
	svc, _, db, user := newResetTest(t)

	t.Run("รหัสเดิมถูกต้องเปลี่ยนได้", func(t *testing.T) {
		if err := svc.ChangePassword(user.ID, "รหัสเดิมของฉัน", "รหัสผ่านใหม่ที่ยาวพอ"); err != nil {
			t.Fatalf("ควรเปลี่ยนได้ แต่ได้: %v", err)
		}

		var updated models.User
		db.First(&updated, user.ID)
		if bcrypt.CompareHashAndPassword([]byte(updated.Password), []byte("รหัสผ่านใหม่ที่ยาวพอ")) != nil {
			t.Fatal("รหัสผ่านใหม่ใช้ไม่ได้")
		}
	})

	t.Run("รหัสเดิมผิดเปลี่ยนไม่ได้", func(t *testing.T) {
		err := svc.ChangePassword(user.ID, "เดาเอาเอง", "อีกรหัสที่ยาวพอ")
		if !errors.Is(err, ErrWrongPassword) {
			t.Fatalf("ควรได้ ErrWrongPassword แต่ได้: %v", err)
		}
	})
}

// ตั้งรหัสใหม่ให้เหมือนเดิมไม่ได้
//
// ถ้าเปลี่ยนเพราะสงสัยว่ารหัสรั่ว การตั้งค่าเดิมไม่ได้แก้อะไรเลย
// แต่ผู้ใช้จะเข้าใจว่าปลอดภัยแล้ว
func TestChangePasswordRejectsSamePassword(t *testing.T) {
	svc, _, _, user := newResetTest(t)

	err := svc.ChangePassword(user.ID, "รหัสเดิมของฉัน", "รหัสเดิมของฉัน")
	if err == nil {
		t.Fatal("ตั้งรหัสใหม่ซ้ำกับเดิมต้องไม่ผ่าน")
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// การสุ่ม OTP
// ─────────────────────────────────────────────────────────────────────────────

// OTP ต้องเป็นเลข 6 หลักเสมอ รวมถึงกรณีที่สุ่มได้เลขน้อย ๆ
func TestNewOTPFormat(t *testing.T) {
	for i := 0; i < 50; i++ {
		code, err := newOTP()
		if err != nil {
			t.Fatalf("สุ่มไม่สำเร็จ: %v", err)
		}
		if len(code) != otpDigits {
			t.Fatalf("ควรยาว %d หลัก แต่ได้ %q", otpDigits, code)
		}
		if !regexp.MustCompile(`^\d{6}$`).MatchString(code) {
			t.Fatalf("ต้องเป็นตัวเลขล้วน แต่ได้ %q", code)
		}
	}
}

// สุ่มหลายครั้งต้องไม่ได้ค่าเดิมซ้ำ ๆ
//
// ถ้าเทสนี้พัง = มีคนเปลี่ยนไปใช้ math/rand ที่ไม่ได้ seed หรือค่าคงที่
func TestNewOTPIsRandom(t *testing.T) {
	seen := map[string]bool{}

	for i := 0; i < 100; i++ {
		code, _ := newOTP()
		seen[code] = true
	}

	// สุ่ม 100 ครั้งจาก 1 ล้านค่า โอกาสซ้ำน้อยมาก
	// เผื่อไว้ที่ 90 กันกรณีบังเอิญซ้ำจริง ๆ
	if len(seen) < 90 {
		t.Fatalf("สุ่ม 100 ครั้งได้ค่าต่างกันแค่ %d — น่าจะไม่ได้สุ่มจริง", len(seen))
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// เลขรุ่น token — ยกเลิก session เก่าตอนเปลี่ยนรหัสผ่าน
// ─────────────────────────────────────────────────────────────────────────────

// ⚠️ เทสสำคัญ: ตั้งรหัสผ่านใหม่แล้วเลขรุ่นต้องเดินขึ้น
//
// ถ้าไม่เดิน token ที่คนร้ายถืออยู่จะยังใช้ได้ต่อ การเปลี่ยนรหัสผ่านจะกลายเป็น
// การปลอบใจเจ้าของบัญชีเฉย ๆ ไม่ได้ไล่ใครออกจากระบบจริง
func TestResetPasswordBumpsTokenVersion(t *testing.T) {
	svc, mailer, db, user := newResetTest(t)
	svc.RequestOTP(user.Email, "1.1.1.1")
	resetToken, _ := svc.VerifyOTP(user.Email, mailer.otp(t))

	if err := svc.ResetPassword(resetToken, "รหัสผ่านใหม่ที่ยาวพอ"); err != nil {
		t.Fatalf("ควรตั้งรหัสใหม่ได้ แต่ได้: %v", err)
	}

	var updated models.User
	db.First(&updated, user.ID)
	if updated.TokenVersion != user.TokenVersion+1 {
		t.Fatalf("เลขรุ่นควรเดินจาก %d เป็น %d แต่ได้ %d",
			user.TokenVersion, user.TokenVersion+1, updated.TokenVersion)
	}
}

// เปลี่ยนรหัสผ่านตอนล็อกอินอยู่ก็ต้องเดินเลขรุ่นเหมือนกัน
func TestChangePasswordBumpsTokenVersion(t *testing.T) {
	svc, _, db, user := newResetTest(t)

	if err := svc.ChangePassword(user.ID, "รหัสเดิมของฉัน", "รหัสผ่านใหม่ที่ยาวพอ"); err != nil {
		t.Fatalf("ควรเปลี่ยนได้ แต่ได้: %v", err)
	}

	var updated models.User
	db.First(&updated, user.ID)
	if updated.TokenVersion != user.TokenVersion+1 {
		t.Fatalf("เลขรุ่นควรเดินขึ้นหนึ่ง แต่ได้ %d", updated.TokenVersion)
	}
}

// กรอกรหัสเดิมผิดต้องไม่เดินเลขรุ่น
//
// ถ้าเดิน คนที่รู้แค่อีเมลของเหยื่อจะยิงคำขอเปลี่ยนรหัสผ่านด้วยรหัสเดิมมั่ว ๆ
// เพื่อเตะเหยื่อออกจากระบบซ้ำ ๆ ได้ ทั้งที่ไม่รู้รหัสผ่านเลย
func TestChangePasswordWithWrongCurrentDoesNotBumpVersion(t *testing.T) {
	svc, _, db, user := newResetTest(t)

	if err := svc.ChangePassword(user.ID, "รหัสผิด", "รหัสผ่านใหม่ที่ยาวพอ"); err == nil {
		t.Fatal("รหัสเดิมผิดต้องไม่ผ่าน")
	}

	var updated models.User
	db.First(&updated, user.ID)
	if updated.TokenVersion != user.TokenVersion {
		t.Fatalf("รหัสเดิมผิดต้องไม่เดินเลขรุ่น แต่เดินจาก %d เป็น %d",
			user.TokenVersion, updated.TokenVersion)
	}
}

// ⚠️ เทสกันหายนะ: ส่งผู้ใช้ที่ไม่มี ID เข้ามาต้องไม่เขียนทับใครเลย
//
// db.Model(user) ใช้ user.ID เป็นเงื่อนไข WHERE ถ้า ID เป็น 0
// GORM จะมองว่าไม่มีเงื่อนไขแล้วอัปเดตทุกแถวในตาราง
// ผลคือรหัสผ่านของทุกคนถูกเขียนทับพร้อมกันและกู้คืนไม่ได้
func TestSetPasswordRefusesUserWithoutID(t *testing.T) {
	_, _, db, user := newResetTest(t)

	// ผู้ใช้เปล่าที่ยังไม่มี ID
	if err := SetPassword(db, &models.User{}, "รหัสผ่านใหม่ที่ยาวพอ"); err == nil {
		t.Fatal("ผู้ใช้ที่ไม่มี ID ต้องถูกปฏิเสธ")
	}
	if err := SetPassword(db, nil, "รหัสผ่านใหม่ที่ยาวพอ"); err == nil {
		t.Fatal("ผู้ใช้ที่เป็น nil ต้องถูกปฏิเสธ")
	}

	// รหัสผ่านของผู้ใช้จริงต้องไม่ถูกแตะ
	var untouched models.User
	db.First(&untouched, user.ID)
	if untouched.Password != user.Password {
		t.Fatal("รหัสผ่านของผู้ใช้คนอื่นถูกเขียนทับ — คำสั่งอัปเดตหลุดเงื่อนไข WHERE")
	}
}

// mustAccessToken ออก access token ปกติไว้ใช้ทดสอบว่าเอามาใช้แทน reset token ไม่ได้
func mustAccessToken(t *testing.T, userID uint, role string) string {
	t.Helper()

	tok, err := token.GenerateAccessToken(userID, role, 0)
	if err != nil {
		t.Fatalf("ออก access token ไม่สำเร็จ: %v", err)
	}
	return tok
}
