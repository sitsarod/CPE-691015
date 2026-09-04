package services

import (
	"CPE-691015/internal/models"
	"errors"
	"fmt"

	"gorm.io/gorm"
)

type DetectedPhotoService struct {
	db *gorm.DB
}

func NewDetectedPhotoService(db *gorm.DB) *DetectedPhotoService {
	return &DetectedPhotoService{db: db}
}

// ErrRawPhotoForbidden ใช้เมื่อโค้ชพยายามจัดการ/ดูรูปที่ไม่ใช่ของตัวเอง (กัน IDOR)
// เหมือน ErrRawVideoForbidden แต่แยกตัวแปรเพื่อให้ controller แมป error message ได้ตรงบริบท
var ErrRawPhotoForbidden = errors.New("ไม่มีสิทธิ์เข้าถึงรูปนี้")

// VerifyCoachOwnsRawPhoto คืน nil ถ้าผู้ใช้เป็นแอดมิน หรือเป็นโค้ชเจ้าของรูปนี้จริง
func VerifyCoachOwnsRawPhoto(db *gorm.DB, rawPhoto *models.RawPhoto, userID uint, role string) error {
	if role == string(models.AdminRole) {
		return nil
	}
	coachID, err := resolveCoachIDByUser(db, userID)
	if err != nil || rawPhoto.CoachID == nil || *rawPhoto.CoachID != coachID {
		return ErrRawPhotoForbidden
	}
	return nil
}

// VerifyCanViewRawPhoto คืน nil ถ้าเป็นแอดมิน, โค้ชเจ้าของรูปนี้ (ผ่าน VerifyCoachOwnsRawPhoto),
// หรือนักเรียนที่ถูกแท็กอยู่ในรูปนี้จริง (ผ่าน DetectedPhoto) — ใช้คุม endpoint ดูเนื้อไฟล์จริง
// (GetPhotoPostRaw) ที่ผูกกับข้อมูลชีวภาพของนักเรียนตาม PDPA
func VerifyCanViewRawPhoto(db *gorm.DB, rawPhoto *models.RawPhoto, userID uint, role string) error {
	if err := VerifyCoachOwnsRawPhoto(db, rawPhoto, userID, role); err == nil {
		return nil
	}

	customerID, err := ResolveCustomerID(db, userID)
	if err != nil {
		return ErrRawPhotoForbidden
	}

	var count int64
	if err := db.Model(&models.DetectedPhoto{}).
		Where("raw_photo_id = ? AND customer_id = ?", rawPhoto.ID, customerID).
		Count(&count).Error; err != nil || count == 0 {
		return ErrRawPhotoForbidden
	}
	return nil
}

// CreateRawPhoto บันทึกรูปต้นฉบับที่อัปโหลดโดยโค้ช (storageKey มาจาก MediaStorage.Save มาแล้ว)
// coachID เป็น nil เมื่อแอดมินเป็นคนอัปโหลดเอง (ไม่ผูกกับโค้ชคนไหน)
//
// PhotoURL คือ path เรียกดูรูปจริง ต้องรู้ ID ก่อนถึงคำนวณได้ จึงต้อง create แล้ว update ทีหลัง
// ⚠️ ครอบทั้งสองขั้นด้วย transaction เดียว — ถ้า update ล้มเหลวหลัง create สำเร็จแล้ว ต้อง rollback
// การ create ไปด้วย ไม่งั้นจะเหลือแถวกำพร้าที่ photo_url ว่างเปล่าค้างอยู่ถาวร
func (s *DetectedPhotoService) CreateRawPhoto(storageKey string, coachID *uint) (*models.RawPhoto, error) {
	var rawPhoto models.RawPhoto
	err := s.db.Transaction(func(tx *gorm.DB) error {
		rawPhoto = models.RawPhoto{StorageKey: storageKey, CoachID: coachID}
		if err := tx.Create(&rawPhoto).Error; err != nil {
			return err
		}
		rawPhoto.PhotoURL = fmt.Sprintf("/photo-posts/%d/raw", rawPhoto.ID)
		return tx.Model(&rawPhoto).Update("photo_url", rawPhoto.PhotoURL).Error
	})
	if err != nil {
		return nil, errors.New("ไม่สามารถบันทึกข้อมูลรูปต้นฉบับได้")
	}
	return &rawPhoto, nil
}

// AssignStudentsToPhoto โค้ชระบุรายชื่อนักเรียนที่อยู่ในรูปนี้ด้วยตนเอง
//
// เฉพาะนักเรียนที่ยินยอมให้เก็บข้อมูลใบหน้าแล้ว (FaceConsentStatus == granted) เท่านั้นที่จะถูกผูกจริง
// คนที่ไม่มีอยู่จริงหรือยังไม่ยินยอมจะถูกข้าม และคืนรายชื่อที่ถูกข้ามเพราะไม่ยินยอมแยกไว้
func (s *DetectedPhotoService) AssignStudentsToPhoto(rawPhotoID uint, photoURL string, customerIDs []uint) (assigned []models.DetectedPhoto, skippedNoConsent []uint, err error) {
	// ลบความสัมพันธ์เดิมของรูปนี้ออกก่อน (แก้ไข/override ผลเดิม)
	if err := s.db.Where("raw_photo_id = ?", rawPhotoID).Delete(&models.DetectedPhoto{}).Error; err != nil {
		return nil, nil, errors.New("ไม่สามารถรีเซ็ตข้อมูลเดิมของรูปนี้ได้")
	}

	for _, customerID := range customerIDs {
		var cust models.Customer
		if err := s.db.First(&cust, customerID).Error; err != nil {
			continue // ข้ามถ้าไม่พบ
		}

		if cust.FaceConsentStatus != models.FaceConsentGranted {
			skippedNoConsent = append(skippedNoConsent, customerID)
			continue
		}

		detectedPhoto := models.DetectedPhoto{
			CustomerID: customerID,
			RawPhotoID: rawPhotoID,
			PhotoURL:   photoURL,
		}

		if err := s.db.Create(&detectedPhoto).Error; err != nil {
			return nil, nil, errors.New("ไม่สามารถจัดเก็บข้อมูลนักเรียนในรูปได้")
		}

		s.db.Preload("Customer").Preload("Customer.User").First(&detectedPhoto, detectedPhoto.ID)
		assigned = append(assigned, detectedPhoto)
	}

	return assigned, skippedNoConsent, nil
}

// GetDetectedPhotosByStudentID ค้นหารูปทั้งหมดที่นักเรียนคนนี้ถูกแท็กอยู่
func (s *DetectedPhotoService) GetDetectedPhotosByStudentID(customerID uint) ([]models.DetectedPhoto, error) {
	var photos []models.DetectedPhoto
	err := s.db.Where("customer_id = ?", customerID).
		Preload("RawPhoto").
		Order("created_at DESC").
		Find(&photos).Error
	if err != nil {
		return nil, errors.New("ไม่สามารถค้นหารูปของนักเรียนคนนี้ได้")
	}
	return photos, nil
}

// GetDetectedPhotosByRawPhotoID ดึงรายชื่อนักเรียนที่ถูกแท็กอยู่ในรูปนี้
func (s *DetectedPhotoService) GetDetectedPhotosByRawPhotoID(rawPhotoID uint) ([]models.DetectedPhoto, error) {
	var list []models.DetectedPhoto
	err := s.db.Where("raw_photo_id = ?", rawPhotoID).
		Preload("Customer").
		Preload("Customer.User").
		Find(&list).Error
	return list, err
}
