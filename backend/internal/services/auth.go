package services

import (
	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
	"errors"

	"math/rand"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type AuthService interface {
	Login(input dto.LoginInput) (string, *models.User, error)
	SendOTP(input dto.SendOTPInput) error
	VerifyOTP(input dto.VerifyOTPInput) (string, error) // คืนค่า Reset Token ถ้า OTP ถูกต้อง
}

type authService struct {
	db *gorm.DB
}

func NewAuthService(db *gorm.DB) AuthService {
	return &authService{db: db}
}

func getJWTSecret() []byte {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		return []byte("my_super_secret_key_1234")
	}
	return []byte(secret)
}

func (s *authService) Login(input dto.LoginInput) (string, *models.User, error) {
	var user models.User
	err := s.db.Preload("Customer").Where("email = ?", input.Email).First(&user).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", nil, errors.New("อีเมลหรือรหัสผ่านไม่ถูกต้อง")
		}
		return "", nil, err
	}

	err = bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(input.Password))
	if err != nil {
		return "", nil, errors.New("อีเมลหรือรหัสผ่านไม่ถูกต้อง")
	}

	claims := jwt.MapClaims{
		"user_id": user.ID,
		"role":    user.Role,
		"exp":     time.Now().Add(time.Hour * 1).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(getJWTSecret())
	if err != nil {
		return "", nil, errors.New("เกิดข้อผิดพลาดในการสร้างโทเค็น")
	}

	return tokenString, &user, nil
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
	claims := jwt.MapClaims{
		"email":  input.Email,
		"action": "reset_password",
		"exp":    time.Now().Add(time.Minute * 15).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	resetToken, err := token.SignedString(getJWTSecret())
	if err != nil {
		return "", errors.New("ไม่สามารถสร้าง Reset Token ได้")
	}

	return resetToken, nil
}