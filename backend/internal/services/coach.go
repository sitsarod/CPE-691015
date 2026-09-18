package services

import (
	"errors"
	"time"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type CoachService struct {
	db *gorm.DB

	// faceStorage ใช้ตอนลบโค้ช เพื่อลบไฟล์รูปใบหน้าบน Cloudinary ให้หมดจริง
	// เป็น nil ได้ — ตั้งผ่าน WithFaceStorage ตอนประกอบ service ใน routes
	faceStorage *CloudinaryService
}

// WithFaceStorage ผูกที่เก็บไฟล์รูปใบหน้าเข้ากับ service (แพตเทิร์นเดียวกับ UserService)
func (s *CoachService) WithFaceStorage(cld *CloudinaryService) *CoachService {
	s.faceStorage = cld
	return s
}

// NewCoachService creates a new instance of CoachService
func NewCoachService(db *gorm.DB) *CoachService {
	return &CoachService{db: db}
}

// ErrCoachForbidden ใช้เมื่อผู้ใช้พยายามแก้ข้อมูลของโค้ชที่ไม่ใช่ตัวเอง (กัน IDOR)
// controller ควรแมป error นี้เป็น HTTP 403
var ErrCoachForbidden = errors.New("ไม่มีสิทธิ์แก้ไขข้อมูลของโค้ชคนอื่น")

// ErrCoachSelfOnly ใช้เมื่อ action นั้นสงวนไว้ให้โค้ชเจ้าของเท่านั้น (แม้แต่ admin ก็แก้ไม่ได้)
// เช่น การแก้ไขวันเวลาว่าง และการแก้ข้อมูลบัญชีรับเงินของตัวเอง
var ErrCoachSelfOnly = errors.New("เฉพาะโค้ชเจ้าของบัญชีเท่านั้นที่ทำรายการนี้ได้ admin ไม่มีสิทธิ์")

// ErrWrongPassword ใช้เมื่อยืนยันรหัสผ่านซ้ำแล้วไม่ตรง (step-up authentication)
//
// ข้อความตั้งใจบอกแค่ว่า "รหัสผ่านไม่ถูกต้อง" ไม่บอกว่าบัญชีมีจริงหรือไม่
// เพราะจุดนี้ผู้เรียกล็อกอินอยู่แล้ว การบอกมากกว่านี้ไม่ช่วยเจ้าตัวแต่ช่วยคนเดา
var ErrWrongPassword = errors.New("รหัสผ่านไม่ถูกต้อง")

// Sentinel errors ตอนสร้างโค้ช — ให้ controller แยก HTTP status ได้
//   ErrCoachUserNotFound  = user_id ไม่มีในระบบ (400)
//   ErrCoachUserNotCoach  = user มีจริงแต่ role ไม่ใช่ coach (400)
//   ErrCoachDuplicateUser = user คนนี้มีข้อมูลโค้ชอยู่แล้ว (409)
//   ErrCoachDuplicateUID  = uid ซ้ำ (409)
var (
	ErrCoachUserNotFound  = errors.New("ไม่พบผู้ใช้งานสำหรับ user_id นี้")
	ErrCoachUserNotCoach  = errors.New("ผู้ใช้งานนี้ไม่ได้มีบทบาทเป็นโค้ช (role ต้องเป็น coach)")
	ErrCoachDuplicateUser = errors.New("ผู้ใช้งานนี้มีข้อมูลโค้ชอยู่แล้ว")
	ErrCoachDuplicateUID  = errors.New("uid นี้ถูกใช้งานแล้ว")
	// ErrCoachInvalidPaymentType ใช้เมื่อ payment_type ที่ส่งมาไม่ใช่ "per_session" หรือ "monthly"
	ErrCoachInvalidPaymentType = errors.New("payment_type ต้องเป็น per_session หรือ monthly เท่านั้น")

	// ErrCoachNoAccount ใช้ตอนลบ เมื่อโปรไฟล์โค้ชไม่มี user_id ผูกอยู่
	// เป็นข้อมูลเสียที่ต้องให้คนไปแก้ ไม่ใช่เคสที่ควรลบผ่านไปเงียบ ๆ (ดู CoachService.Delete)
	ErrCoachNoAccount = errors.New("โปรไฟล์โค้ชนี้ไม่มีบัญชีผู้ใช้ผูกอยู่ กรุณาติดต่อผู้ดูแลระบบเพื่อตรวจสอบข้อมูล")
)

// isValidPaymentType เช็คว่าค่า payment_type ที่รับมาอยู่ในชุดที่ระบบรองรับหรือไม่
// โค้ชแต่ละคนมีวิธีจ่ายเดียว (per_session = รายครั้ง, monthly = รายเดือน) ไม่ให้มีค่าอื่นหลุดเข้ามา
func isValidPaymentType(v string) bool {
	return v == PaymentTypePerSession || v == PaymentTypeMonthly
}

// resolveCoachIDByUser ดึง coaches.id จาก users.id (JWT) — ใช้ร่วมกันในการตรวจสิทธิ์
//
// สำคัญ: coachID ที่ path param ส่งมาคือ coaches.id ส่วน userID คือ users.id สองค่านี้คนละชุดเลข
// จึงต้องดึง coach ด้วย user_id ก่อนแล้วเทียบ coach.ID เอง ห้ามเอา userID ไปเทียบ coachID ตรง ๆ
func resolveCoachIDByUser(db *gorm.DB, userID uint) (uint, error) {
	var coach models.Coach
	if err := db.Where("user_id = ?", userID).First(&coach).Error; err != nil {
		return 0, err
	}
	return coach.ID, nil
}

// VerifyCoachOwnership คืน nil ถ้าผู้ใช้เป็น admin หรือเป็นเจ้าของ coach record (coachID) จริง
// ใช้กับข้อมูลโปรไฟล์โค้ชที่ทั้งเจ้าของและ admin แก้ได้
func VerifyCoachOwnership(db *gorm.DB, coachID, userID uint, role string) error {
	if role == string(models.AdminRole) {
		return nil
	}
	ownID, err := resolveCoachIDByUser(db, userID)
	if err != nil || ownID != coachID {
		return ErrCoachForbidden
	}
	return nil
}

// VerifyCoachSelf คืน nil เฉพาะเมื่อผู้เรียกเป็นโค้ชเจ้าของ record นั้นจริงเท่านั้น
// admin จะไม่ผ่าน (คืน ErrCoachSelfOnly) — ใช้กับ action ที่สงวนให้เจ้าของ เช่น แก้ไขวันเวลาว่างของตัวเอง
func VerifyCoachSelf(db *gorm.DB, coachID, userID uint, role string) error {
	if role == string(models.AdminRole) {
		return ErrCoachSelfOnly
	}
	ownID, err := resolveCoachIDByUser(db, userID)
	if err != nil || ownID != coachID {
		return ErrCoachForbidden
	}
	return nil
}

// GetAll retrieves all coaches from the database
func (s *CoachService) GetAll() ([]models.Coach, error) {
	var coaches []models.Coach
	err := s.db.Preload("User").Find(&coaches).Error
	return coaches, err
}

// GetMe ดึงข้อมูลโค้ชของผู้ใช้ที่ล็อกอินอยู่ (resolve จาก userID ใน JWT แทนที่จะรับ coach id มาจาก client)
// ใช้กับหน้าโปรไฟล์/แดชบอร์ดของโค้ชเอง ที่ยังไม่รู้ coaches.id ล่วงหน้า
func (s *CoachService) GetMe(userID uint) (*models.Coach, error) {
	var coach models.Coach
	if err := s.db.Preload("User").Where("user_id = ?", userID).First(&coach).Error; err != nil {
		return nil, err
	}
	return &coach, nil
}

// GetByID retrieves a single coach by id
// coach ดูได้เฉพาะข้อมูลของตัวเอง, admin ดูได้ทุกคน (กัน IDOR ตอนอ่านข้อมูล)
func (s *CoachService) GetByID(id uint, userID uint, role string) (*models.Coach, error) {
	if err := VerifyCoachOwnership(s.db, id, userID, role); err != nil {
		return nil, err
	}

	var coach models.Coach
	err := s.db.Preload("User").First(&coach, id).Error
	if err != nil {
		return nil, err
	}
	return &coach, nil
}

// Create inserts a new coach into the database, สร้างจาก CreateCoachRequest (admin เป็นคนกรอก รวมถึงระดับและค่าจ้างเริ่มต้น)
func (s *CoachService) Create(req dto.CreateCoachRequest) (*models.Coach, error) {
	// 1. user_id ต้องมีอยู่จริงและมี role เป็น coach (กันผูกโปรไฟล์โค้ชกับ user ที่ไม่มี/ผิด role)
	var user models.User
	if err := s.db.First(&user, req.UserID).Error; err != nil {
		return nil, ErrCoachUserNotFound
	}
	if user.Role != models.CoachRole {
		return nil, ErrCoachUserNotCoach
	}

	// 2. 1 user มีข้อมูลโค้ชได้เพียง record เดียว
	var dupUser models.Coach
	if err := s.db.Where("user_id = ?", req.UserID).First(&dupUser).Error; err == nil {
		return nil, ErrCoachDuplicateUser
	}

	// 3. เช็คว่า Uid ซ้ำกับ coach ที่มีอยู่แล้วหรือไม่ (เหมือนที่ UserService เช็ค email ซ้ำ)
	var existing models.Coach
	if err := s.db.Where("uid = ?", req.Uid).First(&existing).Error; err == nil {
		return nil, ErrCoachDuplicateUID
	}

	// 4. payment_type + pay_rate ต้องผ่านกติกาชุดเดียวกับทุกเส้นทางที่แก้ค่าจ้าง
	// (เดิมตรงนี้ตรวจแค่ payment_type จึงสร้างโค้ชด้วย pay_rate ติดลบได้
	//  ขณะที่ AdminUpdate ตรวจอยู่ — กฎเดียวกันสองมาตรฐาน ดู ValidateCoachPay)
	if err := ValidateCoachPay(req.PaymentType, req.PayRate); err != nil {
		return nil, err
	}

	var coach models.Coach

	// ⚠️ ทั้งก้อนอยู่ในทรานแซกชันเดียว
	//
	// เดิม GenerateUniqueQRCode และ GenerateMemberCode ถูกเรียกก่อน Create แบบลอย ๆ
	// ถ้า Create ล้มเหลว รหัสที่จองไว้จะสูญไปเฉย ๆ (ไม่ร้ายแรง แต่ทำให้เลขกระโดด
	// และถ้ามีตารางจองเลขในอนาคตจะกลายเป็นขยะ)
	err := s.db.Transaction(func(tx *gorm.DB) error {
		// QR ประจำตัวโค้ช สุ่มจากฝั่งเซิร์ฟเวอร์เสมอ ไม่รับค่าจาก client
		// (ใช้ namespace เดียวกับ QR ของนักเรียน — ไม่ซ้ำกันข้ามสองตาราง)
		qrCode, err := GenerateUniqueQRCode(tx)
		if err != nil {
			return err
		}

		// รหัสประจำตัวแบบอ่านออกพูดได้ ใช้ชุดเลขเดียวกับนักเรียน
		memberCode, err := GenerateMemberCode(tx, models.CoachRole)
		if err != nil {
			return err
		}

		coach = models.Coach{
			UserID:         req.UserID,
			Phone:          req.Phone,
			PersonalQRCode: qrCode,
			MemberCode:     memberCode,
			LineID:         req.LineID,
			Facebook:       req.Facebook,
			Uid:            req.Uid,
			Address:        req.Address,
			BirthDate:      req.BirthDate,
			Nickname:       req.Nickname,
			ProfilePicture: req.ProfilePicture,
			Specialization: req.Specialization,
			CoachLicense:   req.CoachLicense,
			BankAccount:    req.BankAccount,
			PaymentInfo:    req.PaymentInfo,
			PromptPay:      req.PromptPay,
			PaymentType:    req.PaymentType,
			PayRate:        req.PayRate,
		}

		// ⚠️ พึ่ง unique index เป็นด่านสุดท้าย ไม่ใช่พึ่งการเช็คซ้ำข้างบนอย่างเดียว
		//
		// การเช็คด้วย First().Error == nil ข้างบนเป็น TOCTOU — สอง request ที่เข้ามา
		// พร้อมกันจะอ่านเจอ "ยังไม่มี" ทั้งคู่แล้วผ่านไปทั้งคู่
		//
		// ด่านจริงคือ unique index ที่ฐาน แต่เดิม error ที่ได้จะหลุดเป็น 500
		// แปลงกลับเป็น sentinel เดิมเพื่อให้ controller ตอบ 409 ตามที่ควรเป็น
		// (แพทเทิร์นเดียวกับ recordCoachAttendance ที่ทำเรื่องนี้ถูกอยู่แล้ว)
		if err := tx.Create(&coach).Error; err != nil {
			if isUniqueViolation(err) {
				return ErrCoachDuplicateUID
			}
			return err
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &coach, nil
}

// Update แก้ไขข้อมูล coach บางฟิลด์ที่ coach แก้เองได้ (ไม่รวม specialization/payment_type/pay_rate
// เพราะ UpdateCoachRequest ไม่มีฟิลด์เหล่านี้แล้ว ต้องแก้ผ่าน AdminUpdate เท่านั้น)
func (s *CoachService) Update(id uint, userID uint, role string, req dto.UpdateCoachRequest) (*models.Coach, error) {
	// กัน IDOR: coach แก้ได้เฉพาะ record ของตัวเอง (admin ผ่านได้ทุก record)
	if err := VerifyCoachOwnership(s.db, id, userID, role); err != nil {
		return nil, err
	}

	var coach models.Coach
	if err := s.db.First(&coach, id).Error; err != nil {
		return nil, err
	}

	updateData := make(map[string]interface{})
	if req.Phone != nil {
		updateData["phone"] = *req.Phone
	}
	// LineID / Facebook ไม่บังคับ จึงยอมให้ส่งค่าว่างมาเพื่อลบข้อมูลเดิมได้
	if req.LineID != nil {
		updateData["line_id"] = *req.LineID
	}
	if req.Facebook != nil {
		updateData["facebook"] = *req.Facebook
	}
	if req.Address != nil {
		updateData["address"] = *req.Address
	}
	if req.ProfilePicture != nil {
		updateData["profile_picture"] = *req.ProfilePicture
	}

	if len(updateData) > 0 {
		if err := s.db.Model(&coach).Updates(updateData).Error; err != nil {
			return nil, err
		}
	}

	if err := s.db.First(&coach, id).Error; err != nil {
		return nil, err
	}
	return &coach, nil
}

// UpdateBankAccount แก้ข้อมูลรับเงินของโค้ช โดยต้องยืนยันรหัสผ่านปัจจุบันก่อน
//
// เจตนาของฟังก์ชันนี้ต่างจาก Update ตรงที่กันคนละภัย:
//   - Update กัน IDOR (คนอื่นมาแก้ข้อมูลเรา)
//   - ตัวนี้กันคนที่ "เป็นเรา" อยู่แล้วในสายตาระบบ แต่ไม่ใช่เราจริง
//     เช่นคนที่หยิบเครื่องที่เปิดค้างไว้ หรือได้ token ไปจากที่อื่น
//
// จึงใช้ VerifyCoachSelf ไม่ใช่ VerifyCoachOwnership — admin เรียกเส้นนี้ไม่ได้
// เพราะ admin ไม่รู้รหัสผ่านของโค้ชอยู่แล้ว จะยืนยันตัวตนซ้ำไม่ผ่านแน่นอน
//
// หมายเหตุ: admin ยังแก้เลขบัญชีโค้ชได้อยู่ผ่านอีกเส้นหนึ่ง
// (PATCH /admin/users/:id → dto.AdminUpdateCoachProfile) ตามนโยบายของทีมที่ว่า
// โค้ชส่งหลักฐานมาให้แอดมินตรวจแล้วแอดมินแก้ให้ได้ ทางนี้จึงไม่ได้มาแทนที่ทางนั้น
// แต่เพิ่มทางที่โค้ชทำเองได้โดยไม่ต้องรอแอดมิน
//
// ⚠️ แปลว่าเส้นทางของ admin ยังเป็นจุดเสี่ยงที่เหลืออยู่ — ถ้าบัญชี admin ถูกยึด
// คนร้ายเปลี่ยนปลายทางเงินของโค้ชทุกคนได้รวดเดียวโดยไม่ต้องรู้รหัสผ่านใคร
// ถ้าจะปิดช่องนั้นต้องถอด BankAccount/PaymentInfo ออกจาก AdminUpdateCoachProfile
// แล้วให้ทุกการเปลี่ยนเลขบัญชีวิ่งผ่านฟังก์ชันนี้ทางเดียว
func (s *CoachService) UpdateBankAccount(id uint, userID uint, role string, req dto.UpdateCoachBankRequest) (*models.Coach, error) {
	if err := VerifyCoachSelf(s.db, id, userID, role); err != nil {
		return nil, err
	}

	var user models.User
	if err := s.db.First(&user, userID).Error; err != nil {
		return nil, ErrCoachForbidden
	}

	// เทียบรหัสผ่านกับ hash — bcrypt.CompareHashAndPassword ใช้เวลาคงที่อยู่แล้ว
	// จึงไม่รั่วข้อมูลผ่าน timing
	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.CurrentPassword)); err != nil {
		return nil, ErrWrongPassword
	}

	var coach models.Coach
	if err := s.db.First(&coach, id).Error; err != nil {
		return nil, err
	}

	updateData := map[string]interface{}{
		"bank_account": req.BankAccount,
		"payment_info": req.PaymentInfo,
		"prompt_pay":   req.PromptPay,
	}

	if err := s.db.Model(&coach).Updates(updateData).Error; err != nil {
		return nil, err
	}

	if err := s.db.First(&coach, id).Error; err != nil {
		return nil, err
	}
	return &coach, nil
}

// AdminUpdate แก้ไข specialization (ระดับ), coach_license, payment_type (ประเภทการจ่ายเงิน)
// และ/หรือ pay_rate (อัตราค่าจ้าง) เฉพาะ admin เท่านั้นที่ควรเรียกฟังก์ชันนี้ได้ (คุมสิทธิ์ที่ชั้น route ด้วย adminOnly middleware)
func (s *CoachService) AdminUpdate(id uint, req dto.AdminUpdateCoachRequest) (*models.Coach, error) {
	var coach models.Coach
	if err := s.db.First(&coach, id).Error; err != nil {
		return nil, err
	}

	updateData := make(map[string]interface{})
	if req.Specialization != nil {
		updateData["specialization"] = *req.Specialization
	}
	if req.CoachLicense != nil {
		updateData["coach_license"] = *req.CoachLicense
	}

	// ⚠️ pay_rate / payment_type ไม่ได้อยู่ใน updateData โดยตั้งใจ
	// สองฟิลด์นี้มีผลย้อนหลังกับเงิน จึงต้องผ่าน ApplyCoachPayChange เท่านั้น
	// (มีด่านห้ามสลับวิธีจ่ายตอนยังค้างจ่าย และเติมสแนปช็อตให้คาบเดิม)
	err := s.db.Transaction(func(tx *gorm.DB) error {
		if len(updateData) > 0 {
			if err := tx.Model(&models.Coach{}).Where("id = ?", id).Updates(updateData).Error; err != nil {
				return err
			}
		}
		return ApplyCoachPayChange(tx, id, req.PaymentType, req.PayRate, time.Now())
	})
	if err != nil {
		return nil, err
	}

	if err := s.db.First(&coach, id).Error; err != nil {
		return nil, err
	}
	return &coach, nil
}

// Delete ลบโค้ชจากหน้าจัดการโค้ช (DELETE /api/coaches/:id) โดยส่งต่อให้
// DeleteUserAccount เป็นคนลบจริง ไม่ได้ลบเอง
//
// actorUserID คือ users.id ของแอดมินที่กดปุ่ม ส่งต่อไปให้ด่านกันลบตัวเองใช้
//
// ─── ทำไมเมธอดนี้ถึงไม่ลบอะไรเองเลย ───
//
// ของเดิมตรงนี้เขียนลำดับลบขึ้นมาเองอีกชุด แล้วใช้ tx.Unscoped() ลบจริงทุกตาราง
// รวมถึง work_schedules กับ coach_attendances ซึ่งเป็น "ตารางที่ห้ามลบ" ตามที่
// services/user.go เขียนกำกับไว้ชัดเจนว่าเก็บไว้ใช้คิดค่าจ้างย้อนหลัง
//
// ผลคือระบบมีทางลบโค้ชสองทางที่นโยบายสวนกัน และทางที่แอดมินกดจริงคือทางที่
// ทำลายข้อมูล — กดครั้งเดียวประวัติเช็คชื่อกับตารางงานย้อนหลังหายถาวร (hard delete
// จึง rollback ไม่ได้), แถว expenses ชี้ไปหาโค้ชที่ไม่มีตัวตนแล้วทำให้รายงานการเงิน
// join ไม่เจอชื่อ, และแถว biometric_consents กลายเป็นแถวกำพร้าทั้งที่มีไว้พิสูจน์
// ความชอบด้วยกฎหมายของการเก็บข้อมูลใบหน้าในอดีต
//
// ตอนนี้จึงเหลือทางเดียว: เส้นนี้แปลง coaches.id → users.id แล้วเรียกแกนกลางตัวเดียวกัน
// กับที่ DELETE /api/users/:id ใช้ ได้ soft delete + เก็บบันทึกการทำงาน + ลบเฉพาะ
// คาบในอนาคต + ลบข้อมูลชีวภาพ เหมือนกันทุกประการ
//
// ⚠️ อย่าเขียนลำดับลบขึ้นมาใหม่ในนี้อีก ถ้าต้องแก้นโยบายให้ไปแก้ที่ DeleteUserAccount
// ที่เดียว ไม่งั้นจะกลับไปมีสองนโยบายเหมือนเดิม
func (s *CoachService) Delete(id uint, actorUserID uint) error {
	var coach models.Coach
	if err := s.db.First(&coach, id).Error; err != nil {
		return err
	}

	// โปรไฟล์โค้ชที่ไม่มีบัญชีผูกอยู่ถือเป็นข้อมูลเสีย — ไม่ลบครึ่ง ๆ กลาง ๆ ให้
	// แต่ตอบกลับไปตรง ๆ เพื่อให้คนแก้ที่ต้นเหตุ (ปกติเกิดไม่ได้ เพราะ Create บังคับ user_id)
	if coach.UserID == 0 {
		return ErrCoachNoAccount
	}

	return DeleteUserAccount(s.db, s.faceStorage, coach.UserID, actorUserID)
}