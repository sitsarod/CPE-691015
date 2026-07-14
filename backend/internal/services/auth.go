package services

import (
	"CPE-691015/internal/models"
	"CPE-691015/internal/dto"
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type AuthService interface {
	Login(input dto.LoginInput) (string, *models.User, error)
}

type authService struct {
	db *gorm.DB
}

func NewAuthService(db *gorm.DB) AuthService {
	return &authService{db: db}
}

// Mock secret key for JWT signing (in a real application, use a secure method to manage secrets)
var jwtSecret = []byte("my_super_secret_key_1234")

func (s *authService) Login(input dto.LoginInput) (string, *models.User, error) {
	var user models.User
	err := s.db.Where("email = ?", input.Email).First(&user).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", nil, errors.New("อีเมลหรือรหัสผ่านไม่ถูกต้อง")
		}
		return "", nil, err
	}

	//  เปลี่ยนมาใช้ bcrypt เทียบรหัสลับในดาต้าเบสกับรหัสผ่านดิบที่ได้มาจากหน้าบ้าน
	err = bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(input.Password))
	if err != nil {
		// ถ้าแฮชไม่ตรงกัน แปลว่ารหัสผ่านผิด
		return "", nil, errors.New("อีเมลหรือรหัสผ่านไม่ถูกต้อง")
	}

	//jwtToken
	claims := jwt.MapClaims{
		"user_id": user.ID,
		"role":    user.Role,
		"exp":     time.Now().Add(time.Hour * 1).Unix(), // Token expires in 1 hours
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(jwtSecret)
	if err != nil {
		return "", nil, errors.New("เกิดข้อผิดพลาดในการสร้างโทเค็น")
	}
	
	return tokenString, &user, nil
}