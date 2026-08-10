package services

import (
	"errors"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"

	"gorm.io/gorm"
)

type CoachService struct {
	db *gorm.DB
}

// NewCoachService creates a new instance of CoachService
func NewCoachService(db *gorm.DB) *CoachService {
	return &CoachService{db: db}
}

// ErrCoachForbidden ใช้เมื่อผู้ใช้พยายามแก้ข้อมูลของโค้ชที่ไม่ใช่ตัวเอง (กัน IDOR)
// controller ควรแมป error นี้เป็น HTTP 403
var ErrCoachForbidden = errors.New("ไม่มีสิทธิ์แก้ไขข้อมูลของโค้ชคนอื่น")

// ErrCoachSelfOnly ใช้เมื่อ action นั้นสงวนไว้ให้โค้ชเจ้าของเท่านั้น (แม้แต่ admin ก็แก้ไม่ได้)
// เช่น การแก้ไขวันเวลาว่างของโค้ช
var ErrCoachSelfOnly = errors.New("เฉพาะโค้ชเจ้าของเท่านั้นที่แก้ไขวันเวลาว่างได้ admin ไม่มีสิทธิ์แก้")

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
)

// isValidPaymentType เช็คว่าค่า payment_type ที่รับมาอยู่ในชุดที่ระบบรองรับหรือไม่
// โค้ชแต่ละคนมีวิธีจ่ายเดียว (per_session = รายครั้ง, monthly = รายเดือน) ไม่ให้มีค่าอื่นหลุดเข้ามา
func isValidPaymentType(v string) bool {
	return v == "per_session" || v == "monthly"
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

	// 4. payment_type ต้องเป็นค่าที่ระบบรองรับเท่านั้น
	if !isValidPaymentType(req.PaymentType) {
		return nil, ErrCoachInvalidPaymentType
	}

	coach := models.Coach{
		UserID:         req.UserID,
		Phone:          req.Phone,
		Uid:            req.Uid,
		Address:        req.Address,
		BirthDate:      req.BirthDate,
		Nickname:       req.Nickname,
		ProfilePicture: req.ProfilePicture,
		Specialization: req.Specialization,
		CoachLicense:   req.CoachLicense,
		BankAccount:    req.BankAccount,
		PaymentInfo:    req.PaymentInfo,
		PaymentType:    req.PaymentType,
		PayRate:        req.PayRate,
	}

	if err := s.db.Create(&coach).Error; err != nil {
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
	if req.Address != nil {
		updateData["address"] = *req.Address
	}
	if req.Nickname != nil {
		updateData["nickname"] = *req.Nickname
	}
	if req.ProfilePicture != nil {
		updateData["profile_picture"] = *req.ProfilePicture
	}
	if req.BankAccount != nil {
		updateData["bank_account"] = *req.BankAccount
	}
	if req.PaymentInfo != nil {
		updateData["payment_info"] = *req.PaymentInfo
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
	if req.PaymentType != nil {
		if !isValidPaymentType(*req.PaymentType) {
			return nil, ErrCoachInvalidPaymentType
		}
		updateData["payment_type"] = *req.PaymentType
	}
	if req.PayRate != nil {
		if *req.PayRate < 0 {
			return nil, errors.New("pay_rate ต้องไม่ติดลบ")
		}
		updateData["pay_rate"] = *req.PayRate
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

// Delete removes a coach from the database (soft delete เพราะ gorm.Model มี DeletedAt)
func (s *CoachService) Delete(id uint) error {
	var coach models.Coach
	if err := s.db.First(&coach, id).Error; err != nil {
		return err
	}
	return s.db.Delete(&coach).Error
}