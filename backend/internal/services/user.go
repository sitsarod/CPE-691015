package services

import (

	"CPE-691015/internal/models"
	"CPE-691015/internal/dto"
	"errors"
	"time"
	"gorm.io/gorm"
	"golang.org/x/crypto/bcrypt"
)

// Sentinel errors ของการลบผู้ใช้ — ให้ controller แมป HTTP status ได้ถูก
// ไม่ใช่ตอบ 500 ทั้งที่เป็นเรื่องกติกาการใช้งาน ไม่ใช่ระบบพัง
var (
	// ErrLastAdmin กันไม่ให้ระบบเหลือศูนย์แอดมิน ซึ่งกู้คืนในระบบไม่ได้
	ErrLastAdmin = errors.New("ลบไม่ได้ เพราะนี่คือผู้ดูแลระบบคนสุดท้าย หากลบแล้วจะไม่มีใครเข้าจัดการระบบได้อีก")

	// ErrDeleteSelf กันแอดมินเผลอลบบัญชีตัวเองระหว่างใช้งานอยู่
	ErrDeleteSelf = errors.New("ลบบัญชีของตัวเองไม่ได้ กรุณาให้ผู้ดูแลระบบคนอื่นเป็นผู้ดำเนินการ")
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
	
	// กติกาอีเมลขึ้นกับบทบาท (ดู email_policy.go)
	// ผู้เรียน/โค้ชใช้อีเมลอะไรก็ได้ ส่วนแอดมินห้ามใช้อีเมลฟรีสาธารณะ
	cleanEmail := NormalizeEmail(user.Email)
	if err := ValidateEmailForRole(cleanEmail, user.Role); err != nil {
		return err
	}
	user.Email = cleanEmail // อัปเดตอีเมลที่จัดฟอร์แมตแล้วกลับเข้าไป

	if err := ValidatePasswordStrength(user.Password); err != nil {
		return err
	}

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

		// QR ประจำตัวต้องสุ่มจากฝั่งเซิร์ฟเวอร์เสมอ และเขียนทับค่าที่ client ส่งมาทุกครั้ง
		//
		// เดิมใช้ "QR_" + อีเมล ซึ่งคำนวณย้อนกลับได้ ใครรู้อีเมลก็สร้าง QR ของคนนั้นได้
		// และการปล่อยให้ client กำหนดเองยังเปิดช่องให้จองค่าของคนอื่นไว้ล่วงหน้า
		// (personal_qr_code เป็น unique) ทำให้เหยื่อสมัครสมาชิกไม่ผ่าน
		qrCode, err := GenerateUniqueQRCode(s.db)
		if err != nil {
			return err
		}
		user.Customer.PersonalQRCode = qrCode

		// รหัสประจำตัวแบบอ่านออกพูดได้ (เช่น KYS0001) — เซิร์ฟเวอร์ออกให้เสมอ
		// เขียนทับค่าที่ client ส่งมาทุกครั้ง เพราะเป็น unique
		// ถ้าปล่อยให้กำหนดเองได้จะจองรหัสของคนอื่นไว้ล่วงหน้าได้
		memberCode, err := GenerateMemberCode(s.db, models.CustomerRole)
		if err != nil {
			return err
		}
		user.Customer.MemberCode = memberCode
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


    // ชื่อ นามสกุล และอีเมล ย้ายไปให้แอดมินแก้ผ่าน PATCH /api/admin/users/:id แล้ว
    // (ดูเหตุผลที่คอมเมนต์ของ dto.UpdateProfileInput) เส้นนี้จึงเหลือแค่ช่องทางติดต่อ

    if user.Role == "customer" && user.Customer != nil {
        customerUpdate := make(map[string]interface{})
        if input.PhoneNumber != "" {
            customerUpdate["phone_number"] = input.PhoneNumber
        }
        if input.ParentEmail != "" {
            customerUpdate["parent_email"] = input.ParentEmail
        }
        if input.ParentPhoneNumber != "" {
            customerUpdate["parent_phone_number"] = input.ParentPhoneNumber
        }
        // LineID / Facebook ไม่บังคับ จึงยอมให้ส่งค่าว่างมาเพื่อลบข้อมูลเดิมได้
        if input.LineID != nil {
            customerUpdate["line_id"] = *input.LineID
        }
        if input.Facebook != nil {
            customerUpdate["facebook"] = *input.Facebook
        }
        // รูปโปรไฟล์ (อัปโหลดขึ้น Cloudinary แล้วส่ง URL มาบันทึก)
        if input.ProfilePicture != nil {
            customerUpdate["profile_picture"] = *input.ProfilePicture
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
// DeleteUser ลบผู้ใช้งานหนึ่งคน พร้อมโปรไฟล์ตามบทบาทของเขา
//
// actorUserID คือ users.id ของแอดมินที่กดลบ ใช้กันไม่ให้ลบตัวเอง
//
// ─── ทำไมต้องมีด่านตรวจ ───
//
// ของเดิมเป็น s.db.Delete(&user) เปล่า ๆ ซึ่งมีปัญหาสองข้อ:
//
//  1. ลบแอดมินคนสุดท้ายได้ พอลบแล้วจะไม่มีใครเข้าหน้าแอดมินได้อีกเลย
//     และระบบยังไม่มีคำสั่งสร้างแอดมินจากเครื่อง ต้องไปแก้ในฐานข้อมูลมือเปล่า
//     ถือเป็นความเสียหายที่กู้คืนในระบบไม่ได้ จึงต้องกันไว้ตั้งแต่แรก
//
//  2. ลบแถว users อย่างเดียว ทิ้งแถว customers/coaches ค้างไว้
//     แถวพวกนั้นยังเก็บชื่อ เบอร์ เลขบัตรประชาชน และเลขบัญชีธนาคารอยู่ครบ
//     ซึ่งขัด PDPA (เก็บข้อมูลไว้ทั้งที่ไม่มีฐานให้เก็บแล้ว) และทำให้
//     ข้อมูลกำพร้าไปโผล่ในรายงานที่ join ข้ามตาราง
func (s *UserService) DeleteUser(id uint, actorUserID uint) error {
	var user models.User
	if err := s.db.First(&user, id).Error; err != nil {
		return err
	}

	// กันลบตัวเอง — แอดมินที่เผลอลบบัญชีตัวเองจะยังถือ token ที่ใช้ได้อยู่
	// จนกว่าจะหมดอายุ กลายเป็นสถานะกำกวมที่ debug ยาก
	// และถ้าเป็นแอดมินคนเดียวก็จะไม่มีใครกู้ให้ได้ด้วย
	if user.ID == actorUserID {
		return ErrDeleteSelf
	}

	if user.Role == models.AdminRole {
		var remaining int64
		if err := s.db.Model(&models.User{}).
			Where("role = ? AND id <> ?", models.AdminRole, user.ID).
			Count(&remaining).Error; err != nil {
			return err
		}
		if remaining == 0 {
			return ErrLastAdmin
		}
	}

	// ลบ user กับข้อมูลพ่วงทั้งหมดใน transaction เดียว
	// ถ้าแยกกันแล้วอันหลังพลาด จะเหลือข้อมูลส่วนตัวค้างโดยไม่มีบัญชีเจ้าของ
	//
	// ไฟล์ภาพใบหน้าบนดิสก์ลบ "หลัง" commit เท่านั้น เพราะการลบไฟล์ย้อนกลับไม่ได้
	// ถ้าลบระหว่าง transaction แล้ว rollback ทีหลัง จะได้แถวที่ยังอยู่แต่ไฟล์หายไป
	// ซึ่งซ่อมไม่ได้ (ดูเหตุผลเต็มที่ services.RemovePhotoFiles)
	var photoFiles []string

	err := s.db.Transaction(func(tx *gorm.DB) error {
		var files []string
		var err error

		switch user.Role {
		case models.CustomerRole:
			files, err = deleteCustomerData(tx, user.ID)
		case models.CoachRole:
			files, err = deleteCoachData(tx, user.ID)
		}
		if err != nil {
			return err
		}
		photoFiles = files

		return tx.Delete(&user).Error
	})
	if err != nil {
		return err
	}

	RemovePhotoFiles(photoFiles)
	return nil
}

// ─────────────────────────────────────────────────────────────────────────────
// ข้อมูลพ่วงของคนที่ถูกลบ — อะไรลบตาม อะไรเก็บไว้
//
// ⚠️ ต้องลบเองทุกตาราง เพราะ ON DELETE CASCADE ของฐานข้อมูล "ใช้ไม่ได้" ที่นี่
//
// เหตุผล: โมเดลทุกตัวฝัง gorm.Model ซึ่งมี DeletedAt แปลว่า tx.Delete()
// ยิงคำสั่ง UPDATE deleted_at ไม่ใช่ DELETE จริง ส่วน cascade ของฐานข้อมูล
// ทำงานตอนมี DELETE จริงเท่านั้น จึงไม่มีอะไรเกิดขึ้นเลย
// (ต่อให้ประกาศ constraint:OnDelete:CASCADE ไว้ครบ ก็ยังไม่ทำงานอยู่ดี)
//
// ─── ตารางที่ "เก็บไว้" โดยตั้งใจ อย่าเผลอไปเพิ่มให้มันถูกลบ ───
//
//	billings / invoices / payment_items / expenses
//	    เอกสารการเงิน ต้องเก็บตามอายุความทางบัญชีและภาษี
//	    ลบทิ้งแล้วยอดในรายงานย้อนหลังจะไม่ตรงกับที่เคยออกใบเสร็จไป
//
//	enrollments
//	    ผูกกับใบเสร็จและใช้พิสูจน์ว่าเคยจ่ายค่าคอร์สอะไรไป
//
//	coach_attendances / student_attendances
//	    ประวัติเช็กชื่อ ใช้คิดค่าจ้างย้อนหลังและยืนยันว่ามาเรียนจริง
//
//	work_schedules ของวันที่ผ่านมาแล้ว
//	    เป็นบันทึกการทำงานจริงที่ใช้คิดค่าจ้าง (ส่วนคาบในอนาคตลบทิ้ง ดูด้านล่าง)
//
//	reviews
//	    คนอื่นใช้ประกอบการตัดสินใจเลือกคอร์ส ถ้าลบตามคนที่ลาออกไป
//	    คะแนนเฉลี่ยของคอร์สจะกระโดดโดยไม่มีใครรู้สาเหตุ
//
//	biometric_consents
//	    ⚠️ ห้ามลบเด็ดขาด เป็นตาราง append-only ที่ใช้พิสูจน์ว่าการเก็บข้อมูล
//	    ใบหน้าในอดีตชอบด้วยกฎหมาย ถ้าลบไปพร้อมเจ้าตัวจะพิสูจน์ย้อนหลังไม่ได้เลย
//
// เพราะแถว customers/coaches เป็น soft delete ตารางข้างบนจึงยัง join กลับมา
// หาชื่อเจ้าของได้ด้วย Unscoped() ตอนตรวจสอบย้อนหลัง — เป็นเหตุผลที่ไม่ใช้ hard delete
// ─────────────────────────────────────────────────────────────────────────────

// deleteCustomerData ลบโปรไฟล์ผู้เรียนและข้อมูลชีวภาพของเขา
//
// คืนรายการ URL ของไฟล์ภาพที่ต้องลบตามหลัง transaction commit
func deleteCustomerData(tx *gorm.DB, userID uint) ([]string, error) {
	var customer models.Customer
	if err := tx.Where("user_id = ?", userID).First(&customer).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			// ไม่มีโปรไฟล์ก็ไม่ต้องลบอะไร ไม่ถือว่าผิดพลาด
			return nil, nil
		}
		return nil, err
	}

	// ภาพใบหน้าและค่า face embedding เป็นข้อมูลชีวภาพ (PDPA ม.26)
	// เมื่อไม่มีสถานะนักเรียนแล้ว ฐานที่ใช้เก็บก็หมดไปด้วย จึงต้องลบทันที
	photoFiles, err := DeleteCustomerPhotos(tx, customer.ID)
	if err != nil {
		return nil, err
	}

	if err := tx.Delete(&customer).Error; err != nil {
		return nil, err
	}
	return photoFiles, nil
}

// deleteCoachData ลบโปรไฟล์โค้ช ข้อมูลชีวภาพ และตารางเวลาที่ยังไม่เกิดขึ้น
//
// คืนรายการ URL ของไฟล์ภาพที่ต้องลบตามหลัง transaction commit
func deleteCoachData(tx *gorm.DB, userID uint) ([]string, error) {
	var coach models.Coach
	if err := tx.Where("user_id = ?", userID).First(&coach).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}

	// ข้อมูลชีวภาพ เหตุผลเดียวกับฝั่งผู้เรียน
	photoFiles, err := DeleteCoachPhotos(tx, coach.ID)
	if err != nil {
		return nil, err
	}

	// เวลาว่างประจำสัปดาห์ — เป็นข้อมูลสำหรับจัดตารางล่วงหน้าเท่านั้น ไม่มีคุณค่าย้อนหลัง
	// ถ้าไม่ลบ โค้ชที่ออกไปแล้วจะยังโผล่เป็นตัวเลือกในหน้าจัดตารางของแอดมิน
	if err := tx.Where("coach_id = ?", coach.ID).Delete(&models.CoachAvailability{}).Error; err != nil {
		return nil, err
	}

	// คาบสอนตั้งแต่วันนี้เป็นต้นไป — ยังไม่เกิดขึ้นจริง ต้องเอาออกจากปฏิทิน
	// ส่วนคาบก่อนหน้านี้เก็บไว้ เพราะเป็นบันทึกการทำงานที่ใช้คิดค่าจ้างย้อนหลัง
	//
	// เทียบวันที่แบบข้อความได้เพราะคอลัมน์เก็บรูปแบบ YYYY-MM-DD ซึ่งเรียงตามตัวอักษร
	// แล้วได้ลำดับเวลาที่ถูกต้องพอดี
	today := time.Now().Format("2006-01-02")
	if err := tx.Where("coach_id = ? AND date >= ?", coach.ID, today).
		Delete(&models.WorkSchedule{}).Error; err != nil {
		return nil, err
	}

	if err := tx.Delete(&coach).Error; err != nil {
		return nil, err
	}
	return photoFiles, nil
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