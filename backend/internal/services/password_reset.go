package services

import (
	"crypto/rand"
	"errors"
	"fmt"
	"log"
	"math/big"
	"strings"
	"time"

	"CPE-691015/internal/models"
	"CPE-691015/internal/token"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// ─────────────────────────────────────────────────────────────────────────────
// กู้รหัสผ่านด้วย OTP ทางอีเมล
//
// ─── ของเดิมเป็นอะไร ───
//
// โค้ดชุดก่อนหน้าเป็นโครงเปล่า: SendOTP สุ่มเลขทิ้งแล้วไม่ได้ส่งอะไรเลย
// ส่วน VerifyOTP เขียนไว้ว่า if input.OTP != "123456" แปลว่าใครก็ตาม
// ที่รู้อีเมลของคนอื่น กรอก 123456 แล้วยึดบัญชีได้ทันที
//
// ─── ขั้นตอนที่ทำจริงตอนนี้ ───
//
//	1. RequestOTP  — ออกเลข 6 หลัก เก็บ hash ไว้ ส่งตัวเลขจริงไปทางอีเมล
//	2. VerifyOTP   — ตรวจเลข ถ้าถูกจะได้ reset token อายุสั้น
//	3. ResetPassword — ใช้ reset token ตั้งรหัสผ่านใหม่
//
// ─── สิ่งที่ป้องกันไว้ ───
//
//	สุ่มด้วย crypto/rand      — math/rand เดาค่าถัดไปได้ถ้ารู้ค่าก่อนหน้า
//	เก็บ hash ไม่เก็บตัวเลข    — ฐานข้อมูลรั่วแล้ว OTP ยังใช้ไม่ได้
//	หมดอายุใน 10 นาที         — จำกัดช่วงเวลาที่รหัสถูกใช้ได้
//	กรอกผิดได้ 5 ครั้ง         — 6 หลักเดารัว ๆ ไม่นานก็ถูก ถ้าไม่จำกัด
//	ใช้ได้ครั้งเดียว           — ใช้ซ้ำไม่ได้แม้ยังไม่หมดอายุ
//	ขอใหม่ล้างใบเก่าทิ้ง       — ไม่ให้มีหลายใบใช้ได้พร้อมกัน
//	ตอบเหมือนกันทุกกรณี        — ไม่บอกว่าอีเมลนี้มีในระบบหรือไม่
// ─────────────────────────────────────────────────────────────────────────────

const (
	// otpDigits จำนวนหลักของ OTP
	otpDigits = 6

	// otpTTL อายุของ OTP
	//
	// 10 นาทีพอให้เปิดอีเมลแล้วพิมพ์ทัน แต่สั้นพอที่คนแอบเห็นอีเมลทีหลัง
	// จะเอาไปใช้ไม่ได้
	otpTTL = 10 * time.Minute

	// otpMaxAttempts จำนวนครั้งที่กรอกผิดได้ก่อนใบนั้นถูกยกเลิก
	//
	// OTP 6 หลักมีความเป็นไปได้ 1 ล้านแบบ ถ้าเดาได้ไม่จำกัดครั้งจะถูกในเวลาไม่นาน
	// จำกัดที่ 5 ทำให้โอกาสเดาถูกเหลือ 5 ใน 1,000,000 ต่อการขอหนึ่งครั้ง
	otpMaxAttempts = 5
)

var (
	// ErrOTPInvalid ใช้ตอบทุกกรณีที่ยืนยันไม่ผ่าน
	//
	// ⚠️ จงใจใช้ข้อความเดียวสำหรับทุกสาเหตุ (รหัสผิด / หมดอายุ / ใช้ไปแล้ว /
	// ไม่มีบัญชีนี้) เพราะถ้าแยกข้อความ คนที่ไล่เดาจะรู้ว่าอีเมลไหนมีในระบบ
	// และรู้ว่าเดาใกล้เคียงแค่ไหน
	ErrOTPInvalid = errors.New("รหัสยืนยันไม่ถูกต้องหรือหมดอายุแล้ว")

	// ErrResetTokenInvalid ใช้เมื่อ token สำหรับตั้งรหัสผ่านใหม่ใช้ไม่ได้
	ErrResetTokenInvalid = errors.New("ลิงก์ตั้งรหัสผ่านใหม่หมดอายุแล้ว กรุณาขอรหัสยืนยันใหม่")
)

// PasswordResetService จัดการทั้งขั้นตอนกู้รหัสผ่าน
type PasswordResetService struct {
	db     *gorm.DB
	mailer Mailer
}

func NewPasswordResetService(db *gorm.DB, mailer Mailer) *PasswordResetService {
	return &PasswordResetService{db: db, mailer: mailer}
}

// newOTP สุ่มเลข 6 หลัก
//
// ⚠️ ใช้ crypto/rand เท่านั้น ห้ามเปลี่ยนไปใช้ math/rand เด็ดขาด
// เพราะ math/rand เดาค่าถัดไปได้ถ้ารู้ค่าก่อนหน้า ซึ่งแปลว่าคนร้ายที่ขอ OTP
// ของตัวเองไปหลายใบ จะคำนวณ OTP ของคนอื่นที่ออกไล่กันได้
func newOTP() (string, error) {
	max := big.NewInt(1)
	for i := 0; i < otpDigits; i++ {
		max.Mul(max, big.NewInt(10))
	}

	n, err := rand.Int(rand.Reader, max)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%0*d", otpDigits, n), nil
}

// RequestOTP ออก OTP ใบใหม่แล้วส่งไปทางอีเมลของเจ้าของบัญชี
//
// ⚠️ ไม่คืน error เมื่อไม่พบบัญชี — คืน nil เหมือนกรณีสำเร็จ
//
// ถ้าตอบต่างกัน คนที่ไล่ยิงอีเมลจะรู้ทันทีว่าอีเมลไหนมีสมาชิกอยู่จริง
// ซึ่งเป็นข้อมูลตั้งต้นของการโจมตีขั้นถัดไป (เอาไปลองรหัสผ่านที่รั่วจากที่อื่น)
func (s *PasswordResetService) RequestOTP(identifier, ipAddress string) error {
	user, err := s.findUser(identifier)
	if err != nil {
		// เงียบ ๆ แต่ไม่ทำอะไรต่อ — ฝั่งเรียกจะตอบว่า "ส่งแล้ว" เหมือนกรณีปกติ
		return nil
	}

	code, err := newOTP()
	if err != nil {
		log.Printf("[password-reset] สุ่ม OTP ไม่สำเร็จ: %v", err)
		return errors.New("ไม่สามารถออกรหัสยืนยันได้")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(code), bcrypt.DefaultCost)
	if err != nil {
		log.Printf("[password-reset] เข้ารหัส OTP ไม่สำเร็จ: %v", err)
		return errors.New("ไม่สามารถออกรหัสยืนยันได้")
	}

	err = s.db.Transaction(func(tx *gorm.DB) error {
		// ยกเลิกใบเก่าที่ยังไม่ถูกใช้ก่อนออกใบใหม่
		//
		// ถ้าไม่ล้าง จะมี OTP หลายใบใช้ได้พร้อมกัน ซึ่งเพิ่มโอกาสเดาถูก
		// ตามจำนวนใบที่ยังมีชีวิตอยู่
		if err := tx.Unscoped().
			Where("user_id = ? AND used_at IS NULL", user.ID).
			Delete(&models.PasswordResetOTP{}).Error; err != nil {
			return err
		}

		return tx.Create(&models.PasswordResetOTP{
			UserID:    user.ID,
			CodeHash:  string(hash),
			ExpiresAt: time.Now().Add(otpTTL),
			IPAddress: ipAddress,
		}).Error
	})
	if err != nil {
		// ⚠️ ต้อง log ต้นเหตุจริงไว้ ไม่งั้นตามหาสาเหตุไม่ได้เลย
		//
		// สาเหตุที่พบบ่อยที่สุดคือยังไม่ได้รัน cmd/migrate ตาราง password_reset_otps
		// จึงยังไม่มีอยู่จริง ซึ่งหน้าเว็บจะขึ้นแค่ "ไม่สามารถออกรหัสยืนยันได้"
		// เหมือนกับความผิดพลาดอื่น ๆ ทุกแบบ
		log.Printf("[password-reset] บันทึก OTP ลงฐานข้อมูลไม่สำเร็จ: %v", err)
		return errors.New("ไม่สามารถออกรหัสยืนยันได้")
	}

	subject := "รหัสยืนยันสำหรับตั้งรหัสผ่านใหม่"
	body := fmt.Sprintf(
		"สวัสดีคุณ %s\n\n"+
			"รหัสยืนยันสำหรับตั้งรหัสผ่านใหม่ของท่านคือ\n\n"+
			"        %s\n\n"+
			"รหัสนี้ใช้ได้ภายใน %d นาที และใช้ได้เพียงครั้งเดียว\n\n"+
			"หากท่านไม่ได้เป็นผู้ขอตั้งรหัสผ่านใหม่ ไม่ต้องดำเนินการใด ๆ\n"+
			"รหัสนี้จะหมดอายุไปเอง และรหัสผ่านเดิมของท่านยังใช้ได้ตามปกติ\n",
		user.FirstName, code, int(otpTTL.Minutes()))

	if err := s.mailer.Send(user.Email, subject, body); err != nil {
		log.Printf("[password-reset] ส่งอีเมลไม่สำเร็จ: %v", err)
		return errors.New("ไม่สามารถส่งอีเมลได้ กรุณาลองใหม่อีกครั้ง")
	}
	return nil
}

// VerifyOTP ตรวจรหัสยืนยัน ถ้าถูกต้องจะคืน token อายุสั้นไว้ใช้ตั้งรหัสผ่านใหม่
func (s *PasswordResetService) VerifyOTP(identifier, code string) (string, error) {
	user, err := s.findUser(identifier)
	if err != nil {
		return "", ErrOTPInvalid
	}

	var otp models.PasswordResetOTP
	err = s.db.Where("user_id = ? AND used_at IS NULL", user.ID).
		Order("id DESC").First(&otp).Error
	if err != nil {
		return "", ErrOTPInvalid
	}

	if time.Now().After(otp.ExpiresAt) {
		return "", ErrOTPInvalid
	}
	if otp.Attempts >= otpMaxAttempts {
		return "", ErrOTPInvalid
	}

	// bcrypt.CompareHashAndPassword ใช้เวลาคงที่ จึงไม่รั่วข้อมูลผ่าน timing
	if err := bcrypt.CompareHashAndPassword([]byte(otp.CodeHash), []byte(code)); err != nil {
		// นับครั้งที่ผิดไว้ ไม่งั้นเดาได้ไม่จำกัด
		s.db.Model(&otp).Update("attempts", otp.Attempts+1)
		return "", ErrOTPInvalid
	}

	// ทำเครื่องหมายว่าใช้แล้วทันที ก่อนคืน token
	// ถ้าทำทีหลัง คนที่ยิงพร้อมกันสองครั้งจะได้ token สองใบจาก OTP ใบเดียว
	now := time.Now()
	if err := s.db.Model(&otp).Update("used_at", now).Error; err != nil {
		return "", errors.New("ไม่สามารถยืนยันรหัสได้")
	}

	resetToken, err := token.GenerateResetToken(user.Email)
	if err != nil {
		return "", errors.New("ไม่สามารถออกรหัสสำหรับตั้งรหัสผ่านใหม่ได้")
	}
	return resetToken, nil
}

// ResetPassword ตั้งรหัสผ่านใหม่ด้วย token ที่ได้จากการยืนยัน OTP
func (s *PasswordResetService) ResetPassword(resetToken, newPassword string) error {
	claims, err := token.Parse(resetToken)
	if err != nil {
		return ErrResetTokenInvalid
	}

	// ต้องเป็น token ที่ออกมาเพื่อการนี้เท่านั้น
	//
	// ⚠️ กันไม่ให้เอา access token มาใช้แทน ซึ่งจะทำให้คนที่ยึด session ไปได้
	// เปลี่ยนรหัสผ่านของเหยื่อได้เลยโดยไม่ต้องรู้รหัสเดิม
	if action, _ := claims["action"].(string); action != "reset_password" {
		return ErrResetTokenInvalid
	}

	email, _ := claims["email"].(string)
	if email == "" {
		return ErrResetTokenInvalid
	}

	if err := ValidatePasswordStrength(newPassword); err != nil {
		return err
	}

	var user models.User
	if err := s.db.Where("email = ?", NormalizeEmail(email)).First(&user).Error; err != nil {
		return ErrResetTokenInvalid
	}

	// SetPassword เดินเลขรุ่น token ให้ด้วย — session เก่าทุกอันถูกยกเลิกทันที
	return SetPassword(s.db, &user, newPassword)
}

// ChangePassword ให้ผู้ที่ล็อกอินอยู่เปลี่ยนรหัสผ่านของตัวเอง
//
// ต่างจาก ResetPassword ตรงที่เส้นนี้ต้องรู้รหัสผ่านเดิม จึงไม่ต้องพึ่งอีเมล
//
// การขอรหัสเดิมเป็นการยืนยันตัวตนซ้ำ (step-up) แบบเดียวกับตอนเปลี่ยนบัญชีธนาคาร
// ป้องกันคนที่หยิบเครื่องที่เปิดค้างไว้แล้วเปลี่ยนรหัสผ่านยึดบัญชีไปเลย
func (s *PasswordResetService) ChangePassword(userID uint, currentPassword, newPassword string) error {
	var user models.User
	if err := s.db.First(&user, userID).Error; err != nil {
		return ErrWrongPassword
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(currentPassword)); err != nil {
		return ErrWrongPassword
	}

	if err := ValidatePasswordStrength(newPassword); err != nil {
		return err
	}

	// กันตั้งรหัสเดิมซ้ำ — ถ้าเปลี่ยนเพราะสงสัยว่ารหัสรั่ว การตั้งค่าเดิม
	// ไม่ได้แก้อะไรเลย แต่ผู้ใช้จะเข้าใจว่าปลอดภัยแล้ว
	if currentPassword == newPassword {
		return errors.New("รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม")
	}

	// ⚠️ ผู้ใช้จะถูกเตะออกจากระบบทุกเครื่องรวมถึงเครื่องที่กำลังใช้อยู่
	//
	// เป็นพฤติกรรมที่ตั้งใจ เพราะเราแยกไม่ออกว่าเครื่องไหนเป็นของเจ้าของตัวจริง
	// หน้าเว็บต้องพาไปหน้าเข้าสู่ระบบพร้อมบอกว่าเปลี่ยนรหัสสำเร็จแล้ว
	return SetPassword(s.db, &user, newPassword)
}

// findUser ค้นบัญชีจากอีเมลหรือเบอร์โทรศัพท์
func (s *PasswordResetService) findUser(identifier string) (*models.User, error) {
	identifier = strings.TrimSpace(identifier)
	if identifier == "" {
		return nil, errors.New("ไม่พบบัญชี")
	}

	var user models.User

	// เป็นอีเมล
	if strings.Contains(identifier, "@") {
		if err := s.db.Where("email = ?", NormalizeEmail(identifier)).First(&user).Error; err != nil {
			return nil, err
		}
		return &user, nil
	}

	// เป็นเบอร์โทร — เบอร์อยู่ในตาราง customers จึงต้อง join
	err := s.db.Joins("JOIN customers ON customers.user_id = users.id").
		Where("customers.phone_number = ?", identifier).
		First(&user).Error
	if err != nil {
		return nil, err
	}
	return &user, nil
}
