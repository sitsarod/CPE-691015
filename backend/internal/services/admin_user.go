package services

import (
	"errors"
	"strings"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

var (
	// ErrProfileRequired ถูกคืนเมื่อ role ต้องมีโปรไฟล์แนบมาแต่ไม่ได้ส่งมา
	ErrProfileRequired = errors.New("กรุณากรอกข้อมูลโปรไฟล์ให้ครบตามบทบาทที่เลือก")

	// ErrEmailTaken ถูกคืนเมื่ออีเมลถูกใช้ไปแล้ว
	ErrEmailTaken = errors.New("อีเมลนี้ถูกใช้งานแล้ว")

	// ErrProfileNotFound ถูกคืนเมื่อพยายามแก้โปรไฟล์ที่ผู้ใช้คนนั้นไม่มี
	// (เช่นส่งก้อน coach มาแก้ให้ผู้ใช้ที่เป็น customer)
	ErrProfileNotFound = errors.New("ผู้ใช้งานนี้ไม่มีโปรไฟล์ตามบทบาทที่ระบุ")
)

// AdminUpdateUser ให้แอดมินแก้ข้อมูลสมาชิก รวมถึงข้อมูลตัวตนและการเงิน
//
// ทำใน tx เดียวเพราะการแก้ครั้งหนึ่งอาจแตะทั้งตาราง users และตารางโปรไฟล์
// ถ้าเขียนสำเร็จแค่ตารางเดียวจะได้ข้อมูลที่ไม่ตรงกันครึ่ง ๆ กลาง ๆ
func (s *UserService) AdminUpdateUser(id uint, req *dto.AdminUpdateUserRequest) (*models.User, error) {
	var user models.User
	if err := s.db.Preload("Customer").Preload("Coach").First(&user, id).Error; err != nil {
		return nil, err
	}

	err := s.db.Transaction(func(tx *gorm.DB) error {
		// ── ตาราง users ──
		userUpdate := map[string]any{}
		if req.FirstName != nil {
			userUpdate["first_name"] = strings.TrimSpace(*req.FirstName)
		}
		if req.LastName != nil {
			userUpdate["last_name"] = strings.TrimSpace(*req.LastName)
		}
		if req.Email != nil {
			email := strings.ToLower(strings.TrimSpace(*req.Email))

			var dup int64
			if err := tx.Model(&models.User{}).
				Where("email = ? AND id <> ?", email, id).Count(&dup).Error; err != nil {
				return err
			}
			if dup > 0 {
				return ErrEmailTaken
			}
			userUpdate["email"] = email
		}
		if len(userUpdate) > 0 {
			if err := tx.Model(&models.User{}).Where("id = ?", id).Updates(userUpdate).Error; err != nil {
				return err
			}
		}

		// ── โปรไฟล์ผู้เรียน ──
		if req.Customer != nil {
			if user.Customer == nil {
				return ErrProfileNotFound
			}

			p := req.Customer
			data := map[string]any{}
			setStr(data, "nickname", p.Nickname)
			setStr(data, "gender", p.Gender)
			setStr(data, "phone_number", p.PhoneNumber)
			setStr(data, "line_id", p.LineID)
			setStr(data, "facebook", p.Facebook)
			setStr(data, "parent_email", p.ParentEmail)
			setStr(data, "parent_phone_number", p.ParentPhoneNumber)
			setStr(data, "status", p.Status)
			if p.BirthDate != nil {
				data["birth_date"] = *p.BirthDate
			}

			if len(data) > 0 {
				if err := tx.Model(&models.Customer{}).
					Where("id = ?", user.Customer.ID).Updates(data).Error; err != nil {
					return err
				}
			}
		}

		// ── โปรไฟล์โค้ช ──
		if req.Coach != nil {
			if user.Coach == nil {
				return ErrProfileNotFound
			}

			p := req.Coach

			// เลขบัตรประชาชนเป็น unique จึงต้องเช็คก่อนว่าไม่ไปชนของคนอื่น
			if p.Uid != nil {
				uid := strings.TrimSpace(*p.Uid)
				var dup int64
				if err := tx.Model(&models.Coach{}).
					Where("uid = ? AND id <> ?", uid, user.Coach.ID).Count(&dup).Error; err != nil {
					return err
				}
				if dup > 0 {
					return ErrCoachDuplicateUID
				}
			}

			data := map[string]any{}
			setStr(data, "nickname", p.Nickname)
			setStr(data, "phone", p.Phone)
			setStr(data, "line_id", p.LineID)
			setStr(data, "facebook", p.Facebook)
			setStr(data, "uid", p.Uid)
			setStr(data, "birth_date", p.BirthDate)
			setStr(data, "address", p.Address)
			setStr(data, "profile_picture", p.ProfilePicture)
			setStr(data, "specialization", p.Specialization)
			setStr(data, "coach_license", p.CoachLicense)
			setStr(data, "bank_account", p.BankAccount)
			setStr(data, "payment_info", p.PaymentInfo)
			setStr(data, "payment_type", p.PaymentType)
			if p.PayRate != nil {
				data["pay_rate"] = *p.PayRate
			}

			if len(data) > 0 {
				if err := tx.Model(&models.Coach{}).
					Where("id = ?", user.Coach.ID).Updates(data).Error; err != nil {
					return err
				}
			}
		}

		return nil
	})
	if err != nil {
		return nil, err
	}

	// อ่านกลับมาใหม่เพื่อให้ค่าที่คืนไปเป็นค่าล่าสุดจริง ๆ
	var updated models.User
	if err := s.db.Preload("Customer").Preload("Coach").First(&updated, id).Error; err != nil {
		return nil, err
	}
	return &updated, nil
}

// setStr ใส่ค่าลง map ถ้า pointer ไม่ใช่ nil (พร้อมตัดช่องว่างหัวท้าย)
//
// แยกออกมาเป็นฟังก์ชันเพราะฟิลด์ที่แอดมินแก้ได้มีเป็นสิบ ถ้าเขียน if ทีละอัน
// จะยาวจนอ่านไม่ออกและพลาดง่าย
func setStr(data map[string]any, column string, v *string) {
	if v != nil {
		data[column] = strings.TrimSpace(*v)
	}
}

// AdminCreateUser สร้างบัญชีผู้ใช้พร้อมโปรไฟล์ตามบทบาท ในทรานแซกชันเดียว
//
// ทำไมต้องเป็นทรานแซกชันเดียว:
//
// ถ้าแยกเป็นสองขั้น (สร้าง user ก่อน แล้วค่อยสร้างโปรไฟล์) แล้วขั้นที่สองพัง
// เช่นเลขบัตรประชาชนซ้ำ หรือเน็ตหลุดกลางคัน จะเหลือ user ที่ไม่มีโปรไฟล์ค้างในฐาน
// ซึ่งเป็นบัญชีที่ล็อกอินได้แต่ใช้งานไม่ได้จริง — โค้ชที่ไม่มี QR เช็คชื่อ
// หรือนักเรียนที่ไม่มีชื่อเล่นและเบอร์ติดต่อ และแอดมินก็ไม่รู้ว่ามีบัญชีเสียค้างอยู่
//
// การรวมไว้ใน tx เดียวทำให้ผลลัพธ์มีแค่สองแบบ: สำเร็จครบ หรือไม่เกิดอะไรขึ้นเลย
func (s *UserService) AdminCreateUser(req *dto.AdminCreateUserRequest) (*models.User, error) {
	role := models.UserRole(req.Role)

	// ตรวจว่าโปรไฟล์ที่แนบมาตรงกับบทบาทที่เลือก
	// (binding tag เขียนเงื่อนไขแบบ "ต้องมีเมื่อ role เป็นค่านี้" ได้ไม่สวย จึงเช็คที่นี่)
	switch role {
	case models.CustomerRole:
		if req.Customer == nil {
			return nil, ErrProfileRequired
		}
	case models.CoachRole:
		if req.Coach == nil {
			return nil, ErrProfileRequired
		}
		if !isValidPaymentType(req.Coach.PaymentType) {
			return nil, ErrCoachInvalidPaymentType
		}
	}

	cleanEmail := strings.ToLower(strings.TrimSpace(req.Email))
	if !strings.HasSuffix(cleanEmail, "@gmail.com") {
		return nil, errors.New("กรุณาใช้อีเมลที่เป็น @gmail.com เท่านั้น")
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, errors.New("ไม่สามารถเข้ารหัสผ่านได้")
	}

	user := req.ToUser()
	user.Email = cleanEmail
	user.Password = string(hashed)

	err = s.db.Transaction(func(tx *gorm.DB) error {
		// เช็คอีเมลซ้ำในทรานแซกชันเดียวกับการเขียน เพื่อลดช่องที่สองคำขอ
		// สมัครอีเมลเดียวกันพร้อมกันแล้วรอดไปทั้งคู่
		// (ด่านสุดท้ายยังเป็น unique constraint ที่ระดับฐานข้อมูลอยู่ดี)
		var exists int64
		if err := tx.Model(&models.User{}).Where("email = ?", user.Email).Count(&exists).Error; err != nil {
			return err
		}
		if exists > 0 {
			return ErrEmailTaken
		}

		if err := tx.Create(user).Error; err != nil {
			return err
		}

		switch role {
		case models.CustomerRole:
			customer := req.ToCustomer(user.ID)
			customer.Status = models.CustomerStatusActive

			qrCode, err := GenerateUniqueQRCode(tx)
			if err != nil {
				return err
			}
			customer.PersonalQRCode = qrCode

			if err := tx.Create(customer).Error; err != nil {
				return err
			}
			user.Customer = customer

		case models.CoachRole:
			// เลขบัตรประชาชนต้องไม่ซ้ำ เช็คในทรานแซกชันเดียวกันด้วยเหตุผลเดียวกับอีเมล
			var dupUID int64
			if err := tx.Model(&models.Coach{}).Where("uid = ?", strings.TrimSpace(req.Coach.Uid)).
				Count(&dupUID).Error; err != nil {
				return err
			}
			if dupUID > 0 {
				return ErrCoachDuplicateUID
			}

			coach := req.ToCoach(user.ID)

			qrCode, err := GenerateUniqueQRCode(tx)
			if err != nil {
				return err
			}
			coach.PersonalQRCode = qrCode

			if err := tx.Create(coach).Error; err != nil {
				return err
			}
			user.Coach = coach
		}

		return nil
	})
	if err != nil {
		return nil, err
	}

	return user, nil
}
