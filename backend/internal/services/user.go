package services

import (
	
	"CPE-691015/internal/models"
	"CPE-691015/internal/dto"
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

// CreateUser inserts a new user and their customer profile into the database [POST]
func (s *UserService) CreateUser(user *models.User) error {
	var existingUser models.User

	if err := s.db.Where("email = ?", user.Email).First(&existingUser).Error; err == nil {
		return errors.New("บัญชีผู้ใช้นี้มีอยู่แล้ว")
	}
	

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(user.Password), bcrypt.DefaultCost)
	if err != nil {
		return errors.New("ไม่สามารถเข้ารหัสผ่านได้")
	}
	user.Password = string(hashedPassword)


	if user.Role == models.CustomerRole && user.Customer != nil {
		user.Customer.Status = models.CustomerStatusActive
		
		if user.Customer.PersonalQRCode == "" {
			user.Customer.PersonalQRCode = "QR_" + user.Email
		}
	}

	return s.db.Create(user).Error
}


// UpdateUser updates an existing user and their customer/coach details [PATCH]
func (s *UserService) UpdateUser(id uint, input dto.UpdateProfileInput) (*models.User, error) {
    var user models.User

    err := s.db.Preload("Customer").Preload("Coach").First(&user, id).Error
    if err != nil {
        return nil, err
    }


    updateData := make(map[string]interface{})
    if input.FirstName != "" {
        updateData["first_name"] = input.FirstName
    }
    if input.LastName != "" {
        updateData["last_name"] = input.LastName
    }
    if input.Email != "" {
    
        var existingUser models.User
        if err := s.db.Where("email = ? AND id != ?", input.Email, id).First(&existingUser).Error; err == nil {
            return nil, errors.New("อีเมลนี้ถูกใช้งานโดยบัญชีอื่นแล้ว")
        }
        updateData["email"] = input.Email
    }
    
    if len(updateData) > 0 {
        err = s.db.Model(&user).Updates(updateData).Error
        if err != nil {
            return nil, err
        }
    }

    
    if user.Role == "customer" && user.Customer != nil {
        customerUpdate := make(map[string]interface{})
        if input.Nickname != "" {
            customerUpdate["nickname"] = input.Nickname
        }
        if input.PhoneNumber != "" {
            customerUpdate["phone_number"] = input.PhoneNumber
        }
        
        if len(customerUpdate) > 0 {
            s.db.Model(user.Customer).Updates(customerUpdate)
        }
    } else if user.Role == "coach" {
        
    }

   
    s.db.Preload("Customer").Preload("Coach").First(&user, id) 
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

// IsActiveStudent ตรวจสอบว่าลูกค้ามีคอร์สที่กำลังเรียนอยู่หรือไม่
func (s *UserService) IsActiveStudent(userID uint) (bool, error) {
	var customer models.Customer
	err := s.db.Where("user_id = ?", userID).First(&customer).Error
	if err != nil {
		return false, nil 
	}


	var count int64
	err = s.db.Model(&models.Enrollment{}).
		Where("customer_id = ? AND status = ? AND remaining_sessions > ?", customer.ID, models.EnrollmentStatusActive, 0).
		Count(&count).Error

	if err != nil {
		return false, err
	}
	return count > 0, nil
}

func (s *UserService) GetActiveStudents() ([]models.User, error) {
    var users []models.User

    err := s.db.Joins("JOIN customers ON customers.user_id = users.id").
        Joins("JOIN enrollments ON enrollments.customer_id = customers.id").
        Where("enrollments.status = ? AND enrollments.remaining_sessions > ?", models.EnrollmentStatusActive, 0).
        Group("users.id").
        Preload("Customer").
        Find(&users).Error

    return users, err
}