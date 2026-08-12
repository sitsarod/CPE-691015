package services

import (
	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
	"CPE-691015/internal/token"
	"errors"

	"math/rand"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type AuthService interface {
	// Login คืนค่า access token, refresh token และข้อมูลผู้ใช้
	Login(input dto.LoginInput) (accessToken string, refreshToken string, user *models.User, err error)
	// Refresh ใช้ refresh token ขอ access token ใหม่ (พร้อมหมุน refresh token ใหม่ด้วย)
	Refresh(refreshToken string) (newAccessToken string, newRefreshToken string, err error)
	SendOTP(input dto.SendOTPInput) error
	VerifyOTP(input dto.VerifyOTPInput) (string, error) // คืนค่า Reset Token ถ้า OTP ถูกต้อง
}

type authService struct {
	db *gorm.DB
}

func NewAuthService(db *gorm.DB) AuthService {
	return &authService{db: db}
}

func (s *authService) Login(input dto.LoginInput) (string, string, *models.User, error) {
	var user models.User
	// Preload ทั้ง Customer และ Coach เพราะทั้งสองบทบาทมี QR ประจำตัวที่ต้องส่งกลับตอนล็อกอิน
	err := s.db.Preload("Customer").Preload("Coach").Where("email = ?", input.Email).First(&user).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", "", nil, errors.New("อีเมลหรือรหัสผ่านไม่ถูกต้อง")
		}
		return "", "", nil, err
	}

	err = bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(input.Password))
	if err != nil {
		return "", "", nil, errors.New("อีเมลหรือรหัสผ่านไม่ถูกต้อง")
	}

	accessToken, refreshToken, err := issueTokens(&user)
	if err != nil {
		return "", "", nil, err
	}

	return accessToken, refreshToken, &user, nil
}

// Refresh ตรวจสอบ refresh token แล้วออก token ชุดใหม่ให้
// จะดึง role ล่าสุดจาก DB เสมอ เผื่อสิทธิ์ผู้ใช้ถูกเปลี่ยนหลังจากออก token เดิม
func (s *authService) Refresh(refreshToken string) (string, string, error) {
	claims, err := token.Parse(refreshToken)
	if err != nil {
		return "", "", errors.New("refresh token ไม่ถูกต้องหรือหมดอายุ")
	}

	// ต้องเป็น refresh token เท่านั้น กัน access token ถูกนำมาใช้ขอต่ออายุ
	if t, _ := claims["type"].(string); t != token.TypeRefresh {
		return "", "", errors.New("token ไม่ใช่ refresh token")
	}

	userID, err := token.UserID(claims)
	if err != nil {
		return "", "", errors.New("refresh token ไม่ถูกต้อง")
	}

	var user models.User
	if err := s.db.First(&user, userID).Error; err != nil {
		return "", "", errors.New("ไม่พบบัญชีผู้ใช้")
	}

	accessToken, newRefreshToken, err := issueTokens(&user)
	if err != nil {
		return "", "", err
	}
	return accessToken, newRefreshToken, nil
}

// issueTokens ออก access + refresh token ให้ผู้ใช้ที่ระบุ
func issueTokens(user *models.User) (string, string, error) {
	accessToken, err := token.GenerateAccessToken(user.ID, string(user.Role))
	if err != nil {
		return "", "", errors.New("เกิดข้อผิดพลาดในการสร้างโทเค็น")
	}
	refreshToken, err := token.GenerateRefreshToken(user.ID)
	if err != nil {
		return "", "", errors.New("เกิดข้อผิดพลาดในการสร้างโทเค็น")
	}
	return accessToken, refreshToken, nil
}

// 🌟 สั่งสร้างและส่ง OTP (ตอนนี้ทำ Mock ส่งเลข 123456 ล็อคไว้เทสหน้าบ้านได้เลย)
func (s *authService) SendOTP(input dto.SendOTPInput) error {
	var user models.User
	if err := s.db.Where("email = ?", input.Email).First(&user).Error; err != nil {
		return errors.New("ไม่พบบัญชีผู้ใช้นี้ในระบบ")
	}

	// TODO: สุ่มเลข OTP และยิงส่งผ่าน SMTP / Mail Service
	// ตัวอย่าง: otpCode := fmt.Sprintf("%06d", rand.Intn(1000000))
	_ = rand.Intn(1000000)

	return nil
}

// 🌟 ตรวจสอบ OTP
func (s *authService) VerifyOTP(input dto.VerifyOTPInput) (string, error) {
	// เทส Mock: ยอมให้ผ่านถ้า OTP คือ "123456"
	if input.OTP != "123456" {
		return "", errors.New("รหัส OTP ไม่ถูกต้องหรือหมดอายุ")
	}

	// สร้าง Reset Token ชั่วคราว (อายุ 15 นาที) เพื่อเอาไปใช้ตอน Reset Password
	resetToken, err := token.GenerateResetToken(input.Email)
	if err != nil {
		return "", errors.New("ไม่สามารถสร้าง Reset Token ได้")
	}

	return resetToken, nil
}