package services

import (

	"CPE-691015/internal/models"
	"CPE-691015/internal/dto"
	"errors"
	"strings"
	"time"
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
	// อัปเดตสถานะ active/inactive ให้เป็นปัจจุบันก่อนดึงรายชื่อ (best-effort ไม่ให้ล้มทั้ง request)
	_ = s.SyncCustomerStatuses()

	var users []models.User
	// Preload("Customer") เพื่อให้ได้ status/nickname/phone ของลูกค้ามาแสดงในหน้า admin ด้วย
	err := s.db.Preload("Customer").Find(&users).Error
	return users, err
}

// SyncCustomerStatuses ปรับสถานะลูกค้าอัตโนมัติตามการมี enrollment ที่ยัง active อยู่
//
//   - ตั้งเป็น "inactive": ลูกค้าที่ตอนนี้ไม่มี enrollment ที่ active (remaining_sessions > 0) เหลือ
//     และไม่มีความเคลื่อนไหวของ enrollment เกิน 3 เดือน (ถ้าไม่เคยลงเรียนเลย ยึดวันที่สมัครเป็นเกณฑ์)
//   - ตั้งกลับเป็น "active": ลูกค้าที่เคย inactive แต่กลับมามี enrollment active อีกครั้ง
//
// เกณฑ์เวลาใช้ enrollments.updated_at เป็นตัวแทน "เวลาที่ enrollment เปลี่ยนสถานะครั้งล่าสุด"
// (เช่น ตอน remaining_sessions หมด หรือถูกปิดเป็น completed/cancelled) ซึ่งเป็น field เวลาที่มีอยู่จริง
//
// คำนวณ cutoff ใน Go แล้วส่งเป็น parameter เพื่อไม่ผูกกับ syntax INTERVAL ของ DB เจ้าใดเจ้าหนึ่ง
func (s *UserService) SyncCustomerStatuses() error {
	now := time.Now()
	cutoff := now.AddDate(0, -3, 0) // ย้อนหลัง 3 เดือน

	// 1) ปิดใช้งานลูกค้าที่ไม่มี enrollment active มานานเกิน 3 เดือน
	//    ค่า 'active'/'inactive' ตรงกับ models.CustomerStatusActive/Inactive และ models.EnrollmentStatusActive
	const deactivate = `
		UPDATE customers
		SET status = 'inactive', updated_at = ?
		WHERE deleted_at IS NULL
		  AND status = 'active'
		  AND id NOT IN (
			SELECT customer_id FROM enrollments
			WHERE deleted_at IS NULL AND status = 'active' AND remaining_sessions > 0
		  )
		  AND COALESCE(
			(SELECT MAX(e.updated_at) FROM enrollments e
			  WHERE e.customer_id = customers.id AND e.deleted_at IS NULL),
			customers.created_at
		  ) < ?`
	if err := s.db.Exec(deactivate, now, cutoff).Error; err != nil {
		return err
	}

	// 2) เปิดใช้งานคืนให้ลูกค้าที่กลับมามี enrollment active อีกครั้ง
	const reactivate = `
		UPDATE customers
		SET status = 'active', updated_at = ?
		WHERE deleted_at IS NULL
		  AND status = 'inactive'
		  AND id IN (
			SELECT customer_id FROM enrollments
			WHERE deleted_at IS NULL AND status = 'active' AND remaining_sessions > 0
		  )`
	if err := s.db.Exec(reactivate, now).Error; err != nil {
		return err
	}

	return nil
}

func (s *UserService) GetUserByRole(role models.UserRole) ([]models.User, error) {
	var users []models.User
	// Preload Customer เพื่อให้มี nickname ติดมาด้วย (ใช้แสดงในหน้าออกบิล)
	err := s.db.Preload("Customer").Where("role = ?", role).Find(&users).Error
	return users, err
}

func (s *UserService) GetUserProfile(id uint) (*models.User, error) {
	var user models.User
	err := s.db.Preload("Customer").Preload("Coach").First(&user, id).Error
	return &user, err
}

// CreateUser inserts a new user and their customer profile into the database [POST]
func (s *UserService) CreateUser(user *models.User) error {
	
	cleanEmail := strings.ToLower(strings.TrimSpace(user.Email))
	if !strings.HasSuffix(cleanEmail, "@gmail.com") {
		return errors.New("กรุณาใช้อีเมลที่เป็น @gmail.com เท่านั้น")
	}
	user.Email = cleanEmail // อัปเดตอีเมลที่จัดฟอร์แมตแล้วกลับเข้าไป

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
        if input.ParentEmail != "" {
            customerUpdate["parent_email"] = input.ParentEmail
        }
        if input.ParentPhoneNumber != "" {
            customerUpdate["parent_phone_number"] = input.ParentPhoneNumber
        }

        if len(customerUpdate) > 0 {
            if err := s.db.Model(user.Customer).Updates(customerUpdate).Error; err != nil {
                return nil, err
            }
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


	expireStaleEnrollments(s.db)

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

    expireStaleEnrollments(s.db)

    graceCutoff := time.Now().AddDate(0, 0, -dto.GracePeriodDays)

    err := s.db.Joins("JOIN customers ON customers.user_id = users.id").
        Joins("JOIN enrollments ON enrollments.customer_id = customers.id").
        Where("enrollments.deleted_at IS NULL AND enrollments.remaining_sessions > 0").
        Where(
            s.db.Where("enrollments.status = ?", models.EnrollmentStatusActive).
                Or("enrollments.status = ? AND enrollments.expires_at > ?",
                    models.EnrollmentStatusExpired, graceCutoff),
        ).
        Group("users.id").
        Preload("Customer").
        Find(&users).Error

    return users, err
}

func (s *UserService) CountGraceEnrollments(userID uint) int64 {
    customerID, err := ResolveCustomerID(s.db, userID)
    if err != nil {
        return 0
    }

    graceCutoff := time.Now().AddDate(0, 0, -dto.GracePeriodDays)

    var count int64
    s.db.Model(&models.Enrollment{}).
        Where("customer_id = ? AND status = ? AND remaining_sessions > 0 AND expires_at > ?",
            customerID, models.EnrollmentStatusExpired, graceCutoff).
        Count(&count)
    return count
}

// FindAccountByIdentifier ค้นหาบัญชีผู้ใช้จาก Email หรือ PhoneNumber
func (s *UserService) FindAccountByIdentifier(identifier string) (*models.User, error) {
	var user models.User

	// 1. ลองค้นหาด้วย Email ในตาราง users ก่อน
	err := s.db.Preload("Customer").Preload("Coach").
		Where("email = ?", identifier).
		First(&user).Error

	if err == nil {
		return &user, nil
	}

	// 2. ถ้าหาด้วย Email ไม่เจอ ให้ Join ไปค้นหาที่ตาราง customers ด้วย phone_number
	err = s.db.Preload("Customer").Preload("Coach").
		Joins("JOIN customers ON customers.user_id = users.id").
		Where("customers.phone_number = ?", identifier).
		First(&user).Error

	if err == nil {
		return &user, nil
	}

	// 3. ถ้าหาด้วยเบอร์โค้ชด้วย (ถ้าตาราง coaches มีเบอร์โทรศัพท์)
	err = s.db.Preload("Customer").Preload("Coach").
		Joins("JOIN coaches ON coaches.user_id = users.id").
		Where("coaches.phone_number = ?", identifier).
		First(&user).Error

	if err == nil {
		return &user, nil
	}

	return nil, errors.New("ไม่พบบัญชีผู้ใช้นี้ในระบบ")
}