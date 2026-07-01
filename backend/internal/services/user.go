package services

import (
	
	"CPE-691015/internal/models"
	"errors"
	"gorm.io/gorm"
	"golang.org/x/crypto/bcrypt"
)

type UserService struct{
	db *gorm.DB
}

// NewUserService creates a new instance of UserService
func NewUserService(db *gorm.DB) *UserService {
	return &UserService{db: db}
}

// GetAllUsers retrieves all users from the database
func (s *UserService) GetAllUsers() ([]models.User, error) {
	var users []models.User
	err := s.db.Find(&users).Error
	return users, err
}

func (s *UserService) GetUserByRole(role models.UserRole) ([]models.User, error) {
	var users []models.User
	err := s.db.Where("role = ?", role).Find(&users).Error
	return users, err
}

func (s *UserService) GetUserProfile(id uint) (*models.User, error) {
	var user models.User
	err := s.db.Preload("Customer").Preload("Coach").First(&user, id).Error
	return &user, err
}

// Create inserts a new user into the database [POST]
func (s *UserService) CreateUser(user *models.User) error {
	var existingUser models.User
	// Check if a user with the same email already exists
	if err := s.db.Where("email = ?", user.Email).First(&existingUser).Error; err == nil {
		return errors.New("บัญชีผู้ใช้นี้มีอยู่แล้ว")
	}
	// Hash the password before saving
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(user.Password), bcrypt.DefaultCost)
	if err != nil {
		return errors.New("ไม่สามารถเข้ารหัสผ่านได้")
	}
	// เอารหัสที่แฮชเสร็จแล้วยัดกลับไปแทนที่ข้อความดิบ
	user.Password = string(hashedPassword)

	// Save the user to the database
	return s.db.Create(user).Error
}

// Update updates an existing user in the database [PATCH]
func (s *UserService) UpdateUser(id uint, input models.User) (*models.User, error) {
	var user models.User
	err := s.db.Preload("Customer").Preload("Coach").First(&user, id).Error
	if err != nil {
		return nil, err
	}
	// สร้าง map เก็บเฉพาะฟิลด์ที่จะอัปเดต (ป้องกันค่าว่างวิ่งไปทับของเดิม)
	updateData := make(map[string]interface{})
	if input.FirstName != "" {
		updateData["first_name"] = input.FirstName
	}
	if input.LastName != "" {
		updateData["last_name"] = input.LastName
	}
	if input.Email != "" {
		updateData["email"] = input.Email
	}
	
	if len(updateData) > 0 {
		err = s.db.Model(&user).Updates(updateData).Error
		if err != nil {
			return nil, err
		}
	}

	if user.Role == "customer" && input.Customer != nil {
		s.db.Model(user.Customer).Updates(input.Customer)
	}else if user.Role == "coach" && input.Coach != nil {
		s.db.Model(user.Coach).Updates(input.Coach)
	}

	s.db.Preload("Customer").Preload("Coach").First(&user, id) //ดึงข้อมูลล่าสุดหลังอัปเดต
	return &user, nil
}

// Delete removes a user from the database [DELETE]
func (s *UserService) DeleteUser(id uint) error {
	var user models.User
	if err := s.db.First(&user, id).Error; err != nil {
		return err
	}
	return s.db.Delete(&user).Error
}
