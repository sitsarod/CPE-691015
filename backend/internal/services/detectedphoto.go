package services

import (
	"CPE-691015/internal/models"
	"errors"

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

// CreateRawPhoto บันทึกรูปต้นฉบับที่อัปโหลดโดยโค้ช
// coachID เป็น nil เมื่อแอดมินเป็นคนอัปโหลดเอง (ไม่ผูกกับโค้ชคนไหน)
func (s *DetectedPhotoService) CreateRawPhoto(photoURL string, coachID *uint) (*models.RawPhoto, error) {
	rawPhoto := models.RawPhoto{
		PhotoURL: photoURL,
		CoachID:  coachID,
	}
	if err := s.db.Create(&rawPhoto).Error; err != nil {
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
