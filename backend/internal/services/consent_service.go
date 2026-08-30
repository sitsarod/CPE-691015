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
	ErrConsentNotApplicable = errors.New("บัญชีนี้ไม่ต้องให้ความยินยอมเก็บข้อมูลใบหน้า")
	ErrConsentUserNotFound  = errors.New("ไม่พบบัญชีผู้ใช้งานนี้")
	ErrCoachProfileNotFound = errors.New("ไม่พบโปรไฟล์โค้ชของผู้ใช้งานนี้")
)

// consentSubject คือ "เจ้าของความยินยอม" หนึ่งราย ซึ่งเป็นได้ทั้งนักเรียนและโค้ช
//
// ทั้งสองบทบาทต้องให้ความยินยอมด้วยเหตุผลเดียวกัน คือใช้สแกนใบหน้าเช็คชื่อ
// (นักเรียนเช็คชื่อเข้าเรียน โค้ชเช็คชื่อเข้างาน) แต่โปรไฟล์อยู่คนละตาราง
// struct นี้จึงทำหน้าที่ห่อความต่างนั้นไว้ที่เดียว โค้ดส่วนอื่นของ service
// จะได้ไม่ต้องเขียน if role == ... ซ้ำทุกฟังก์ชัน
//
// ⚠️ CustomerID กับ CoachID ต้องมีค่าแค่ตัวใดตัวหนึ่งเสมอ (ตรงกับ CHECK constraint
// ของตาราง biometric_consents) — สร้าง struct นี้ผ่าน resolveSubject เท่านั้น
type consentSubject struct {
	Role       models.UserRole
	CustomerID *uint
	CoachID    *uint
	Status     models.FaceConsentStatus
}

// scope ใส่เงื่อนไข WHERE ให้ตรงกับเจ้าของแถว ใช้ตอน query ตาราง biometric_consents
func (s consentSubject) scope(db *gorm.DB) *gorm.DB {
	if s.CoachID != nil {
		return db.Where("coach_id = ?", *s.CoachID)
	}
	return db.Where("customer_id = ?", *s.CustomerID)
}

// resolveSubject หา "เจ้าของความยินยอม" จาก users.id ที่ได้มาจาก JWT
//
// แยกตาม role ของ user แทนการเดาจากว่ามีโปรไฟล์ไหนอยู่ เพราะ role คือแหล่งความจริง
// ที่ระบบใช้ตัดสินสิทธิ์ที่อื่นอยู่แล้ว ถ้าเดาเอาแล้ววันหนึ่งมีคนมีทั้งสองโปรไฟล์
// ความยินยอมจะไปลงผิดตารางโดยไม่มีใครรู้
func (s *ConsentService) resolveSubject(userID uint) (*consentSubject, error) {
	var user models.User
	if err := s.db.First(&user, userID).Error; err != nil {
		return nil, ErrConsentUserNotFound
	}

	switch user.Role {
	case models.CustomerRole:
		var customer models.Customer
		if err := s.db.Where("user_id = ?", userID).First(&customer).Error; err != nil {
			return nil, ErrCustomerProfileNotFound
		}
		id := customer.ID
		return &consentSubject{Role: models.CustomerRole, CustomerID: &id, Status: customer.FaceConsentStatus}, nil

	case models.CoachRole:
		var coach models.Coach
		if err := s.db.Where("user_id = ?", userID).First(&coach).Error; err != nil {
			return nil, ErrCoachProfileNotFound
		}
		id := coach.ID
		return &consentSubject{Role: models.CoachRole, CoachID: &id, Status: coach.FaceConsentStatus}, nil

	default:
		// แอดมินไม่ได้เช็คชื่อด้วยใบหน้า จึงไม่มีอะไรให้ยินยอม
		// ตอบเป็น error เฉพาะทางแทน 500 เพื่อให้หน้าเว็บแสดงข้อความที่ถูกต้องได้
		return nil, ErrConsentNotApplicable
	}
}

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
	subject, err := s.resolveSubject(userID)
	if err != nil {
		return nil, err
	}

	status := subject.Status
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
	err = subject.scope(s.db).Order("acted_at DESC, id DESC").First(&latest).Error
	if err == nil {
		res.PolicyVersion = latest.PolicyVersion
		actedAt := latest.ActedAt
		res.ActedAt = &actedAt
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	return res, nil
}

// Record บันทึกการยินยอม/ปฏิเสธของผู้ใช้ (รับเป็น users.id) ใช้ได้ทั้งนักเรียนและโค้ช
//
// เขียนแถวใหม่ลง biometric_consents และอัปเดตสถานะในตารางโปรไฟล์ของเจ้าตัว
// (customers หรือ coaches) ใน transaction เดียวกันเสมอ
// เพื่อไม่ให้ตาราง audit กับสถานะปัจจุบันหลุดจากกัน
func (s *ConsentService) Record(userID uint, action models.ConsentAction, meta ConsentMeta) (*dto.FaceConsentStatusRes, error) {
	// รับเฉพาะสองค่านี้ — การถอนความยินยอมต้องไปทาง Withdraw เท่านั้น
	// เพราะมีขั้นตอนลบข้อมูลที่เก็บไว้พ่วงอยู่ด้วย
	if action != models.ConsentGranted && action != models.ConsentDeclined {
		return nil, ErrInvalidConsentAction
	}

	subject, err := s.resolveSubject(userID)
	if err != nil {
		return nil, err
	}

	if err := s.writeConsent(subject, userID, action, meta); err != nil {
		return nil, err
	}

	return s.GetStatus(userID)
}

// Withdraw ถอนความยินยอมและลบข้อมูลใบหน้าที่เก็บไว้ (รับเป็น users.id)
func (s *ConsentService) Withdraw(userID uint, meta ConsentMeta) (*dto.FaceConsentStatusRes, error) {
	subject, err := s.resolveSubject(userID)
	if err != nil {
		return nil, err
	}

	// ถอนได้เฉพาะคนที่เคยยินยอมไว้จริง — กันไม่ให้เกิดแถว withdrawn ลอย ๆ
	// ที่ไม่มี granted นำหน้า ซึ่งจะทำให้ประวัติอ่านแล้วสับสน
	if subject.Status != models.FaceConsentGranted {
		return nil, ErrNothingToWithdraw
	}

	// เขียนแถวถอนความยินยอม และลบภาพใบหน้าออกจากฐานใน transaction เดียวกัน
	//
	// ต้องอยู่ใน transaction เดียวกันเพราะถ้าแยกกันแล้วอันหลังพลาด จะเกิดกรณี
	// "บันทึกว่าถอนแล้ว แต่ข้อมูลใบหน้ายังอยู่" ซึ่งคือการเก็บข้อมูลชีวภาพ
	// โดยไม่มีฐานความยินยอมรองรับ — ผิดตรงกับที่ประกาศไว้กับผู้ใช้พอดี
	photoFiles, err := s.withdrawAndDeletePhotos(subject, userID, meta)
	if err != nil {
		return nil, err
	}

	// ลบไฟล์จริงหลัง commit เท่านั้น (ดูเหตุผลที่ RemovePhotoFiles)
	RemovePhotoFiles(photoFiles)

	return s.GetStatus(userID)
}

// withdrawAndDeletePhotos เขียนแถวถอนความยินยอม + ลบภาพใบหน้า ในทรานแซกชันเดียว
//
// คืนรายการ URL ของไฟล์ที่ต้องลบตามหลัง commit
//
// ⚠️ นักเรียนที่ถอนความยินยอมแล้ว ต้องไม่เหลือ "หลักฐานว่าเคยถูกจำแนกใบหน้า" ค้างอยู่ด้วย
// จึงต้องลบ DetectedVideo/DetectedPhoto (แถวที่บอกว่า "นักเรียนคนนี้อยู่ในวิดีโอ/รูปไหนบ้าง")
// ของนักเรียนคนนั้นออกไปพร้อมกันในทรานแซกชันเดียวกัน — ไม่ลบ RawVideo/RawPhoto (ไฟล์ต้นฉบับ)
// เอง เพราะอาจมีนักเรียนคนอื่นที่ยังยินยอมอยู่ถูกแท็กอยู่ในสื่อชิ้นเดียวกันด้วย
//
// ใช้ Unscoped() (ลบจริง ไม่ใช่ soft delete) ด้วยเหตุผลเดียวกับ Photo — แถวนี้คือ
// หลักฐานผลลัพธ์การจำแนกใบหน้า นับเป็นข้อมูลชีวภาพเช่นกัน
func (s *ConsentService) withdrawAndDeletePhotos(subject *consentSubject, actorUserID uint, meta ConsentMeta) ([]string, error) {
	var photoFiles []string

	err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := writeConsentTx(tx, subject, actorUserID, models.ConsentWithdrawn, meta); err != nil {
			return err
		}

		var files []string
		var err error
		if subject.CoachID != nil {
			files, err = DeleteCoachPhotos(tx, *subject.CoachID)
		} else {
			files, err = DeleteCustomerPhotos(tx, *subject.CustomerID)
			if err == nil {
				err = deleteFaceDetectionLinks(tx, *subject.CustomerID)
			}
		}
		if err != nil {
			return err
		}

		photoFiles = files
		return nil
	})
	if err != nil {
		return nil, err
	}
	return photoFiles, nil
}

// deleteFaceDetectionLinks ลบแถว DetectedVideo/DetectedPhoto ของนักเรียนคนนี้ทั้งหมด
// (ตัวไฟล์ RawVideo/RawPhoto ไม่ถูกลบ — ดูเหตุผลในคอมเมนต์ของ withdrawAndDeletePhotos)
func deleteFaceDetectionLinks(tx *gorm.DB, customerID uint) error {
	if err := tx.Unscoped().Where("customer_id = ?", customerID).Delete(&models.DetectedVideo{}).Error; err != nil {
		return errors.New("ไม่สามารถลบประวัติวิดีโอที่เคยตรวจพบใบหน้าได้")
	}
	if err := tx.Unscoped().Where("customer_id = ?", customerID).Delete(&models.DetectedPhoto{}).Error; err != nil {
		return errors.New("ไม่สามารถลบประวัติรูปที่เคยตรวจพบใบหน้าได้")
	}
	return nil
}

// writeConsent เขียนแถว audit + อัปเดตสถานะปัจจุบัน ใน transaction เดียว
//
// สองอย่างนี้ต้องสำเร็จหรือล้มเหลวพร้อมกันเสมอ ถ้าแยกกันแล้วอันหนึ่งพลาด
// จะได้สถานะที่ไม่มีหลักฐานรองรับ หรือหลักฐานที่ไม่ตรงกับสถานะที่ระบบใช้จริง
// ซึ่งทั้งสองแบบใช้ยืนยันความชอบด้วยกฎหมายไม่ได้
func (s *ConsentService) writeConsent(subject *consentSubject, actorUserID uint, action models.ConsentAction, meta ConsentMeta) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		return writeConsentTx(tx, subject, actorUserID, action, meta)
	})
}

// writeConsentTx คือเนื้อในของ writeConsent ที่แยกออกมาเพื่อให้เรียกซ้อนใน
// transaction ที่เปิดอยู่แล้วได้ (ใช้ตอนถอนความยินยอมซึ่งต้องลบรูปในทรานแซกชันเดียวกัน)
//
// ห้ามเปิด transaction ซ้อนในนี้ — ตัวเรียกเป็นคนคุม transaction เอง
func writeConsentTx(tx *gorm.DB, subject *consentSubject, actorUserID uint, action models.ConsentAction, meta ConsentMeta) error {
	record := models.BiometricConsent{
		CustomerID:      subject.CustomerID,
		CoachID:         subject.CoachID,
		Action:          action,
		PolicyVersion:   models.FaceConsentPolicyVersion,
		ActedAt:         time.Now(),
		GrantedByUserID: actorUserID,
		IPAddress:       meta.IPAddress,
		UserAgent:       meta.UserAgent,
		// IsMinor / GuardianEmail ปล่อยเป็นค่าว่างโดยตั้งใจ — รอบนี้ยังไม่ประเมินกรณีผู้เยาว์
	}

	if err := tx.Create(&record).Error; err != nil {
		return errors.New("ไม่สามารถบันทึกความยินยอมได้")
	}

	// อัปเดตค่า denormalize ในตารางโปรไฟล์ให้ตรงกับแถวที่เพิ่งเขียน
	status := action.ToConsentStatus()

	var result *gorm.DB
	if subject.CoachID != nil {
		result = tx.Model(&models.Coach{}).Where("id = ?", *subject.CoachID).Update("face_consent_status", status)
	} else {
		result = tx.Model(&models.Customer{}).Where("id = ?", *subject.CustomerID).Update("face_consent_status", status)
	}

	if result.Error != nil {
		return errors.New("ไม่สามารถอัปเดตสถานะความยินยอมได้")
	}

	return nil
}

// GetHistory ดึงประวัติความยินยอมทั้งหมด (สำหรับแอดมินใช้ตรวจสอบย้อนหลังตาม PDPA)
//
// ถ้าระบุ subjectUserID (users.id) จะกรองเฉพาะของคนนั้น ถ้าเป็น 0 คือดึงทั้งหมด
// รวมทั้งของนักเรียนและโค้ชในชุดเดียว เรียงตามเวลาที่ตอบ
func (s *ConsentService) GetHistory(subjectUserID uint) ([]dto.FaceConsentHistoryItem, error) {
	query := s.db.Model(&models.BiometricConsent{}).
		Preload("Customer").
		Preload("Customer.User").
		Preload("Coach").
		Preload("Coach.User").
		Order("acted_at DESC, id DESC")

	if subjectUserID != 0 {
		subject, err := s.resolveSubject(subjectUserID)
		if err != nil {
			return nil, err
		}
		query = subject.scope(query)
	}

	var records []models.BiometricConsent
	if err := query.Find(&records).Error; err != nil {
		return nil, err
	}

	items := make([]dto.FaceConsentHistoryItem, 0, len(records))
	for _, r := range records {
		item := dto.FaceConsentHistoryItem{
			ID:            r.ID,
			Action:        string(r.Action),
			PolicyVersion: r.PolicyVersion,
			ActedAt:       r.ActedAt,
		}

		// แมปเป็น DTO เท่าที่จำเป็น ไม่ส่ง models.User ดิบออกไป
		// เพราะ User.Password ยังใช้ tag json:"password" อยู่ ถ้าส่งดิบ bcrypt hash จะรั่ว
		switch {
		case r.CoachID != nil:
			item.SubjectRole = string(models.CoachRole)
			item.SubjectID = *r.CoachID
			if r.Coach != nil {
				item.SubjectName = r.Coach.Nickname
				if r.Coach.User != nil {
					item.SubjectName = r.Coach.User.FirstName + " " + r.Coach.User.LastName
					item.SubjectEmail = r.Coach.User.Email
				}
			}

		case r.CustomerID != nil:
			item.SubjectRole = string(models.CustomerRole)
			item.SubjectID = *r.CustomerID
			if r.Customer != nil {
				item.SubjectName = r.Customer.Nickname
				if r.Customer.User != nil {
					item.SubjectName = r.Customer.User.FirstName + " " + r.Customer.User.LastName
					item.SubjectEmail = r.Customer.User.Email
				}
			}
		}

		items = append(items, item)
	}

	return items, nil
}
