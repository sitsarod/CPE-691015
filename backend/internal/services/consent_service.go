package services

import (
	"errors"
	"strings"
	"time"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
	"gorm.io/gorm"
)

// Sentinel errors — ให้ controller แมป HTTP status ได้ถูกต้อง ไม่ใช่ตอบ 500 ทุกกรณี
var (
	ErrInvalidConsentAction = errors.New("การกระทำไม่ถูกต้อง (รองรับเฉพาะ granted หรือ declined)")
	ErrNothingToWithdraw    = errors.New("ไม่มีความยินยอมที่ให้ถอน เนื่องจากท่านยังไม่ได้ให้ความยินยอมไว้")
)

type ConsentService struct {
	db *gorm.DB
}

func NewConsentService(db *gorm.DB) *ConsentService {
	return &ConsentService{db: db}
}

// GetPolicy คืนเนื้อหาประกาศการเก็บข้อมูลใบหน้า พร้อมเติมข้อมูลผู้ควบคุมข้อมูล (ม.23(5))
// จากข้อมูลติดต่อที่แอดมินตั้งไว้ใน CMS — ช่องไหนยังไม่กรอกจะคง placeholder เตือนว่ายังไม่ได้ตั้งค่า
func (s *ConsentService) GetPolicy() dto.FaceConsentPolicyRes {
	// ค่าเริ่มต้น (placeholder) — ใช้เมื่อยังไม่ได้ตั้งค่าใน CMS
	contact := dto.DataControllerContact{
		Name:    "Koyama Badminton School",
		Address: "[ที่อยู่โรงเรียน — กรุณากรอกข้อมูลจริงก่อนเปิดใช้งาน]",
		Email:   "[อีเมลติดต่อเรื่องข้อมูลส่วนบุคคล — กรุณากรอกข้อมูลจริง]",
		Phone:   "[เบอร์ติดต่อ — กรุณากรอกข้อมูลจริง]",
	}

	var hc models.HomeContent
	if err := s.db.Order("id ASC").First(&hc).Error; err == nil {
		if v := strings.TrimSpace(hc.SchoolName); v != "" {
			contact.Name = v
		}
		if v := strings.TrimSpace(hc.ContactAddress); v != "" {
			contact.Address = v
		}
		if v := strings.TrimSpace(hc.ContactEmail); v != "" {
			contact.Email = v
		}
		if v := strings.TrimSpace(hc.ContactPhone); v != "" {
			contact.Phone = v
		}
	}

	return FaceConsentPolicy(contact)
}

// ConsentMeta คือข้อมูลประกอบที่เก็บไว้เป็นหลักฐาน audit (ไม่ได้มาจาก body ที่ผู้ใช้ควบคุมได้)
type ConsentMeta struct {
	IPAddress string
	UserAgent string
}

// GetStatus คืนสถานะความยินยอมปัจจุบันของผู้ใช้ (รับเป็น users.id)
func (s *ConsentService) GetStatus(userID uint) (*dto.FaceConsentStatusRes, error) {
	customerID, err := ResolveCustomerID(s.db, userID)
	if err != nil {
		return nil, err
	}

	var customer models.Customer
	if err := s.db.First(&customer, customerID).Error; err != nil {
		return nil, ErrCustomerNotFound
	}

	status := customer.FaceConsentStatus
	if status == "" {
		// แถวที่ถูกสร้างก่อนจะมีฟิลด์นี้จะเป็นค่าว่าง — ถือว่ายังไม่เคยถาม
		status = models.FaceConsentUnknown
	}

	res := &dto.FaceConsentStatusRes{
		Status: string(status),
		// เด้ง modal เฉพาะคนที่ยังไม่เคยตอบ — คนที่ปฏิเสธหรือถอนไปแล้วต้องไม่ถูกถามซ้ำ
		// เพราะการถามย้ำจนกว่าจะยอมถือเป็นการบีบให้ยินยอม ซึ่งขัดหลักความยินยอมโดยอิสระ
		//
		// หมายเหตุสำหรับอนาคต: ถ้าแก้ข้อความประกาศจนขยับเวอร์ชัน อาจต้องขอความยินยอมใหม่
		// จากคนที่เคยตอบ granted ตามเวอร์ชันเก่า — จุดนั้นให้เพิ่มเงื่อนไขตรงนี้
		NeedsDecision: status == models.FaceConsentUnknown,
		// รอบนี้ยังไม่มีระบบเก็บรูป จึงเช็คแค่สถานะความยินยอม
		// เมื่อทำเฟสเก็บรูปแล้ว ต้องเพิ่มเงื่อนไข "มีรูปที่พร้อมใช้อย่างน้อย 1 ใบ"
		CanUseFaceCheckIn: status == models.FaceConsentGranted,
	}

	// ดึงแถวล่าสุดจากตาราง audit มาเติมรายละเอียดว่าตอบเมื่อไหร่ ตามประกาศเวอร์ชันไหน
	var latest models.BiometricConsent
	err = s.db.Where("customer_id = ?", customerID).Order("acted_at DESC, id DESC").First(&latest).Error
	if err == nil {
		res.PolicyVersion = latest.PolicyVersion
		actedAt := latest.ActedAt
		res.ActedAt = &actedAt
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	return res, nil
}

// Record บันทึกการยินยอม/ปฏิเสธของผู้ใช้ (รับเป็น users.id)
//
// เขียนแถวใหม่ลง biometric_consents และอัปเดต Customer.FaceConsentStatus ใน transaction
// เดียวกันเสมอ เพื่อไม่ให้ตาราง audit กับสถานะปัจจุบันหลุดจากกัน
func (s *ConsentService) Record(userID uint, action models.ConsentAction, meta ConsentMeta) (*dto.FaceConsentStatusRes, error) {
	// รับเฉพาะสองค่านี้ — การถอนความยินยอมต้องไปทาง Withdraw เท่านั้น
	// เพราะมีขั้นตอนลบข้อมูลที่เก็บไว้พ่วงอยู่ด้วย
	if action != models.ConsentGranted && action != models.ConsentDeclined {
		return nil, ErrInvalidConsentAction
	}

	customerID, err := ResolveCustomerID(s.db, userID)
	if err != nil {
		return nil, err
	}

	if err := s.writeConsent(customerID, userID, action, meta); err != nil {
		return nil, err
	}

	return s.GetStatus(userID)
}

// Withdraw ถอนความยินยอมและลบข้อมูลใบหน้าที่เก็บไว้ (รับเป็น users.id)
func (s *ConsentService) Withdraw(userID uint, meta ConsentMeta) (*dto.FaceConsentStatusRes, error) {
	customerID, err := ResolveCustomerID(s.db, userID)
	if err != nil {
		return nil, err
	}

	var customer models.Customer
	if err := s.db.First(&customer, customerID).Error; err != nil {
		return nil, ErrCustomerNotFound
	}

	// ถอนได้เฉพาะคนที่เคยยินยอมไว้จริง — กันไม่ให้เกิดแถว withdrawn ลอย ๆ
	// ที่ไม่มี granted นำหน้า ซึ่งจะทำให้ประวัติอ่านแล้วสับสน
	if customer.FaceConsentStatus != models.FaceConsentGranted {
		return nil, ErrNothingToWithdraw
	}

	if err := s.writeConsent(customerID, userID, models.ConsentWithdrawn, meta); err != nil {
		return nil, err
	}

	// TODO (เฟสเก็บรูปใบหน้า): ลบไฟล์รูปบนดิสก์ + hard delete แถว face_images ของ customer นี้
	// ต้องทำใน transaction เดียวกับ writeConsent ด้านบน มิฉะนั้นอาจเกิดกรณีบันทึกว่าถอนแล้ว
	// แต่ข้อมูลใบหน้ายังค้างอยู่ ซึ่งเป็นการเก็บข้อมูลโดยไม่มีฐานความยินยอมรองรับ

	return s.GetStatus(userID)
}

// writeConsent เขียนแถว audit + อัปเดตสถานะปัจจุบัน ใน transaction เดียว
func (s *ConsentService) writeConsent(customerID uint, actorUserID uint, action models.ConsentAction, meta ConsentMeta) error {
	now := time.Now()

	return s.db.Transaction(func(tx *gorm.DB) error {
		record := models.BiometricConsent{
			CustomerID:      customerID,
			Action:          action,
			PolicyVersion:   models.FaceConsentPolicyVersion,
			ActedAt:         now,
			GrantedByUserID: actorUserID,
			IPAddress:       meta.IPAddress,
			UserAgent:       meta.UserAgent,
			// IsMinor / GuardianEmail ปล่อยเป็นค่าว่างโดยตั้งใจ — รอบนี้ยังไม่ประเมินกรณีผู้เยาว์
		}

		if err := tx.Create(&record).Error; err != nil {
			return errors.New("ไม่สามารถบันทึกความยินยอมได้")
		}

		if err := tx.Model(&models.Customer{}).
			Where("id = ?", customerID).
			Update("face_consent_status", action.ToConsentStatus()).Error; err != nil {
			return errors.New("ไม่สามารถอัปเดตสถานะความยินยอมได้")
		}

		return nil
	})
}

// GetHistory ดึงประวัติความยินยอมทั้งหมด (สำหรับแอดมินใช้ตรวจสอบย้อนหลังตาม PDPA)
//
// ถ้าระบุ customerUserID (users.id) จะกรองเฉพาะของคนนั้น ถ้าเป็น 0 คือดึงทั้งหมด
func (s *ConsentService) GetHistory(customerUserID uint) ([]dto.FaceConsentHistoryItem, error) {
	query := s.db.Model(&models.BiometricConsent{}).
		Preload("Customer").
		Preload("Customer.User").
		Order("acted_at DESC, id DESC")

	if customerUserID != 0 {
		customerID, err := ResolveCustomerID(s.db, customerUserID)
		if err != nil {
			return nil, err
		}
		query = query.Where("customer_id = ?", customerID)
	}

	var records []models.BiometricConsent
	if err := query.Find(&records).Error; err != nil {
		return nil, err
	}

	items := make([]dto.FaceConsentHistoryItem, 0, len(records))
	for _, r := range records {
		item := dto.FaceConsentHistoryItem{
			ID:            r.ID,
			CustomerID:    r.CustomerID,
			Action:        string(r.Action),
			PolicyVersion: r.PolicyVersion,
			ActedAt:       r.ActedAt,
		}
		// แมปเป็น DTO เท่าที่จำเป็น ไม่ส่ง models.User ดิบออกไป
		// เพราะ User.Password ยังใช้ tag json:"password" อยู่ ถ้าส่งดิบ bcrypt hash จะรั่ว
		if r.Customer != nil {
			item.CustomerName = r.Customer.Nickname
			if r.Customer.User != nil {
				item.CustomerName = r.Customer.User.FirstName + " " + r.Customer.User.LastName
				item.CustomerEmail = r.Customer.User.Email
			}
		}
		items = append(items, item)
	}

	return items, nil
}
