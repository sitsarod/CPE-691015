package services

import (
	"errors"
	"fmt"
	"log"
	"time"

	"CPE-691015/internal/models"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// BackfillEmailVerifiedForExistingUsers ปักว่ายืนยันแล้วให้ทุกบัญชีที่มีอยู่ก่อนฟีเจอร์นี้
//
// ⚠️ ต้องรันครั้งเดียวตอน migrate หลังเพิ่มคอลัมน์ email_verified_at
//
// ถ้าไม่ทำ ทุกบัญชีเดิม (นักเรียน โค้ช แอดมิน ที่ใช้งานอยู่จริงอยู่แล้ว) จะมีค่าเป็น
// NULL แล้วโดนด่าน AuthService.Login กันไม่ให้เข้าระบบทันทีที่ deploy — ด่านนี้
// ควรบังคับเฉพาะบัญชีที่สมัครใหม่ผ่านหน้าเว็บ ไม่ใช่ย้อนไปรื้อบัญชีเดิม
func BackfillEmailVerifiedForExistingUsers(db *gorm.DB) error {
	res := db.Exec(`
		UPDATE users
		SET email_verified_at = created_at
		WHERE email_verified_at IS NULL
	`)
	if res.Error != nil {
		return fmt.Errorf("ปักสถานะยืนยันอีเมลย้อนหลังไม่สำเร็จ: %w", res.Error)
	}
	if res.RowsAffected > 0 {
		log.Printf("[email-verify] ปักสถานะยืนยันอีเมลย้อนหลังให้บัญชีเดิม %d บัญชี", res.RowsAffected)
	}
	return nil
}

// ─────────────────────────────────────────────────────────────────────────────
// ยืนยันอีเมลตอนสมัครสมาชิกด้วย OTP
//
// กลไกเดียวกับ services/password_reset.go ทุกอย่าง (สุ่มด้วย crypto/rand,
// เก็บ hash ไม่เก็บตัวเลขจริง, หมดอายุ 10 นาที, กรอกผิดได้ 5 ครั้ง, ใช้ได้ครั้งเดียว)
// แค่คนละเหตุการณ์และคนละตาราง — ดูเหตุผลที่ models.EmailVerificationOTP
// ─────────────────────────────────────────────────────────────────────────────

var (
	ErrEmailOTPInvalid  = errors.New("รหัสยืนยันไม่ถูกต้องหรือหมดอายุแล้ว")
	ErrEmailNotVerified = errors.New("อีเมลนี้ยังไม่ได้ยืนยัน กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ")
)

type EmailVerificationService struct {
	db     *gorm.DB
	mailer Mailer
}

func NewEmailVerificationService(db *gorm.DB, mailer Mailer) *EmailVerificationService {
	return &EmailVerificationService{db: db, mailer: mailer}
}

// SendOTP ออก OTP ใบใหม่ให้ user ที่ระบุแล้วส่งไปทางอีเมล ใช้ทั้งตอนสมัครสมาชิก
// และตอนกดขอรหัสใหม่ (resend)
func (s *EmailVerificationService) SendOTP(user *models.User, ipAddress string) error {
	if user.EmailVerifiedAt != nil {
		return nil
	}

	code, err := newOTP()
	if err != nil {
		log.Printf("[email-verify] สุ่ม OTP ไม่สำเร็จ: %v", err)
		return errors.New("ไม่สามารถออกรหัสยืนยันได้")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(code), bcrypt.DefaultCost)
	if err != nil {
		log.Printf("[email-verify] เข้ารหัส OTP ไม่สำเร็จ: %v", err)
		return errors.New("ไม่สามารถออกรหัสยืนยันได้")
	}

	err = s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Unscoped().
			Where("user_id = ? AND used_at IS NULL", user.ID).
			Delete(&models.EmailVerificationOTP{}).Error; err != nil {
			return err
		}

		return tx.Create(&models.EmailVerificationOTP{
			UserID:    user.ID,
			CodeHash:  string(hash),
			ExpiresAt: time.Now().Add(otpTTL),
			IPAddress: ipAddress,
		}).Error
	})
	if err != nil {
		log.Printf("[email-verify] บันทึก OTP ลงฐานข้อมูลไม่สำเร็จ: %v", err)
		return errors.New("ไม่สามารถออกรหัสยืนยันได้")
	}

	subject := "รหัสยืนยันอีเมลสำหรับสมัครสมาชิก"
	body := fmt.Sprintf(
		"สวัสดีคุณ %s\n\n"+
			"รหัสยืนยันอีเมลของท่านคือ\n\n"+
			"        %s\n\n"+
			"รหัสนี้ใช้ได้ภายใน %d นาที และใช้ได้เพียงครั้งเดียว\n\n"+
			"หากท่านไม่ได้เป็นผู้สมัครสมาชิก ไม่ต้องดำเนินการใด ๆ\n",
		user.FirstName, code, int(otpTTL.Minutes()))

	if err := s.mailer.Send(user.Email, subject, body); err != nil {
		log.Printf("[email-verify] ส่งอีเมลไม่สำเร็จ: %v", err)
		return errors.New("ไม่สามารถส่งอีเมลได้ กรุณาลองใหม่อีกครั้ง")
	}
	return nil
}

// ResendOTP ออก OTP ใบใหม่ให้บัญชีที่ระบุด้วยอีเมล
//
// ⚠️ ไม่คืน error เมื่อไม่พบบัญชีหรือยืนยันไปแล้ว — คืน nil เหมือนกรณีสำเร็จ
// เหตุผลเดียวกับ PasswordResetService.RequestOTP: กันคนไล่ยิงอีเมลตรวจว่า
// อีเมลไหนมีสมาชิกอยู่จริง
func (s *EmailVerificationService) ResendOTP(email, ipAddress string) error {
	user, err := s.findUnverifiedUser(email)
	if err != nil {
		return nil
	}
	return s.SendOTP(user, ipAddress)
}

// VerifyOTP ตรวจรหัสยืนยัน ถ้าถูกต้องจะปักเวลายืนยันอีเมลให้และออก token คู่ล็อกอินทันที
// (ผู้ใช้ไม่ต้องกลับไปกดเข้าสู่ระบบซ้ำหลังยืนยันเสร็จ)
func (s *EmailVerificationService) VerifyOTP(email, code string) (*models.User, string, string, error) {
	user, err := s.findUnverifiedUser(email)
	if err != nil {
		return nil, "", "", ErrEmailOTPInvalid
	}

	var otp models.EmailVerificationOTP
	err = s.db.Where("user_id = ? AND used_at IS NULL", user.ID).
		Order("id DESC").First(&otp).Error
	if err != nil {
		return nil, "", "", ErrEmailOTPInvalid
	}

	if time.Now().After(otp.ExpiresAt) {
		return nil, "", "", ErrEmailOTPInvalid
	}
	if otp.Attempts >= otpMaxAttempts {
		return nil, "", "", ErrEmailOTPInvalid
	}

	if err := bcrypt.CompareHashAndPassword([]byte(otp.CodeHash), []byte(code)); err != nil {
		s.db.Model(&otp).Update("attempts", otp.Attempts+1)
		return nil, "", "", ErrEmailOTPInvalid
	}

	now := time.Now()
	if err := s.db.Model(&otp).Update("used_at", now).Error; err != nil {
		return nil, "", "", errors.New("ไม่สามารถยืนยันอีเมลได้")
	}
	if err := s.db.Model(user).Update("email_verified_at", now).Error; err != nil {
		return nil, "", "", errors.New("ไม่สามารถยืนยันอีเมลได้")
	}
	user.EmailVerifiedAt = &now

	accessToken, refreshToken, err := issueTokens(user)
	if err != nil {
		return nil, "", "", err
	}
	return user, accessToken, refreshToken, nil
}

// findUnverifiedUser ค้นบัญชีจากอีเมลที่ยังไม่ยืนยัน
//
// คืน error เดียวกันไม่ว่าจะเพราะหาไม่เจอหรือยืนยันไปแล้ว — ฝั่งเรียกไม่ควร
// แยกออกจากกันได้ เหตุผลเดียวกับ PasswordResetService (กันเดาสถานะบัญชี)
func (s *EmailVerificationService) findUnverifiedUser(email string) (*models.User, error) {
	var user models.User
	if err := s.db.Where("email = ?", NormalizeEmail(email)).First(&user).Error; err != nil {
		return nil, err
	}
	if user.EmailVerifiedAt != nil {
		return nil, errors.New("อีเมลนี้ยืนยันแล้ว")
	}
	return &user, nil
}
