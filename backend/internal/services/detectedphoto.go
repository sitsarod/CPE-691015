package services

import (
	"CPE-691015/internal/models"
	"context"
	"errors"
	"fmt"
	"log"
	"time"

	"gorm.io/gorm"
)

type DetectedPhotoService struct {
	db           *gorm.DB
	mediaStorage MediaStorage
}

func NewDetectedPhotoService(db *gorm.DB) *DetectedPhotoService {
	return &DetectedPhotoService{db: db}
}

// WithMediaStorage ผูกที่เก็บไฟล์เข้ากับ service — ต้องเรียกก่อนใช้ DeleteOldRawPhotos เท่านั้น
// (การอัปโหลด/ดูรูปปกติไม่ต้องใช้ ผ่าน MediaStorage ที่ controller ถืออยู่แล้วโดยตรง)
func (s *DetectedPhotoService) WithMediaStorage(ms MediaStorage) *DetectedPhotoService {
	s.mediaStorage = ms
	return s
}

// ErrRawPhotoForbidden ใช้เมื่อโค้ชพยายามจัดการ/ดูรูปที่ไม่ใช่ของตัวเอง (กัน IDOR)
// เหมือน ErrRawVideoForbidden แต่แยกตัวแปรเพื่อให้ controller แมป error message ได้ตรงบริบท
var ErrRawPhotoForbidden = errors.New("ไม่มีสิทธิ์เข้าถึงรูปนี้")

// ErrPostNotFound ใช้ตอนนักเรียนพยายามลบโพสต์ (รูป/วิดีโอ) ที่ตัวเองไม่ได้ถูกแท็กอยู่จริง
// (กัน IDOR — เดข raw_id ของคนอื่นแล้วยิงลบไม่ได้ ถือใช้ร่วมกันทั้งรูปและวิดีโอ)
var ErrPostNotFound = errors.New("ไม่พบโพสต์นี้ หรือคุณไม่ได้ถูกแท็กอยู่ในโพสต์นี้")

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

	// กัน customerID ซ้ำในชุดที่ส่งมา (เช่น โค้ช reassign สอง detection คนละแถวไปเป็นคนเดียวกันโดยไม่ตั้งใจ)
	// ไม่งั้นจะสร้างแท็กซ้ำหลายแถวให้นักเรียนคนเดียวกันในรูปเดียวกัน ไปโผล่ซ้ำในฟีดโพสต์ของเขา
	seen := make(map[uint]bool, len(customerIDs))

	for _, customerID := range customerIDs {
		if seen[customerID] {
			continue
		}
		seen[customerID] = true

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

// DeleteMyPhotoTag ให้นักเรียนลบตัวเองออกจากรูปนี้ (soft delete แท็กของตัวเองเท่านั้น)
//
// ⚠️ ต่างจาก DeleteOldRawPhotos ตรงที่ไม่แตะรูปต้นฉบับ (RawPhoto) เลย — รูปหมู่ที่มีคนอื่นถูกแท็ก
// อยู่ด้วยจะยังอยู่ให้คนอื่นเห็นตามปกติ ถ้าลบแล้วไม่เหลือใครถูกแท็กในรูปนี้อีก รูปต้นฉบับจะยัง
// ไม่ถูกลบทันที แต่รอ cron อายุ 7 วันมาเก็บกวาดทีหลังเหมือนเดิม
func (s *DetectedPhotoService) DeleteMyPhotoTag(customerID, rawPhotoID uint) error {
	result := s.db.Where("raw_photo_id = ? AND customer_id = ?", rawPhotoID, customerID).Delete(&models.DetectedPhoto{})
	if result.Error != nil {
		return errors.New("ไม่สามารถลบโพสต์นี้ได้")
	}
	if result.RowsAffected == 0 {
		return ErrPostNotFound
	}
	return nil
}

// DeleteOldRawPhotos ลบรูปโพสต์ที่ "ถึงมือนักเรียน" มานานเกิน olderThan ทิ้งถาวร (แถว + แท็ก + ไฟล์จริง)
//
// เรียกจาก background job รายวัน — ให้เวลาผู้ถูกแท็กดาวน์โหลดเก็บไว้เองก่อนถูกลบถาวร
// (ปุ่มดาวน์โหลดอยู่ที่แท็บ Posts ในโปรไฟล์)
//
// ⚠️ นับอายุจากตอนที่ถูกแท็กเข้าโปรไฟล์จริง (DetectedPhoto.created_at) ไม่ใช่ตอนอัปโหลดดิบ
// (RawPhoto.created_at) — ไม่งั้นเวลาที่โค้ชใช้ตรวจทาน/ยืนยันก่อนกด assign จะไปกินเวลา 7 วัน
// ที่ควรเป็นของนักเรียนไปฟรีๆ ทั้งที่นักเรียนยังไม่เคยเห็นรูปเลยด้วยซ้ำ
//
// รูปที่ยังไม่เคยถูกแท็กเลย (AI หาไม่เจอใคร หรือโค้ชยังไม่ได้ตรวจทาน) ไม่มี "ตอนถึงมือนักเรียน"
// ให้นับ ใช้เวลาอัปโหลดดิบแทนไปก่อน กันไฟล์ที่ไม่มีใครสนใจค้างอยู่ในระบบไม่จำกัดเวลา
func (s *DetectedPhotoService) DeleteOldRawPhotos(olderThan time.Duration) (int64, error) {
	if s.mediaStorage == nil {
		return 0, nil // ยังไม่ได้ผูกที่เก็บไฟล์ไว้ ข้ามไปเงียบๆ เหมือน worker อื่นที่พึ่งพา dependency ภายนอก
	}

	cutoff := time.Now().Add(-olderThan)

	// เวลาแท็กล่าสุดต่อรูป (ดึงมาครั้งเดียวเป็น map กัน N+1 query ตอนวนเช็คทีละรูปด้านล่าง)
	// หา MAX เองในโค้ด Go แทนให้ฐานข้อมูลทำ — ดึงเป็น model ปกติผ่าน Find ให้ GORM แปลงเวลาให้ถูกต้อง
	// เอง (ต่างจาก raw aggregate ที่ scan กลับเป็น time.Time ตรงๆ ไม่ได้บนไดรเวอร์ sqlite ที่ใช้เทส)
	var tags []models.DetectedPhoto
	if err := s.db.Select("raw_photo_id, created_at").Find(&tags).Error; err != nil {
		return 0, err
	}
	latestTagByPhoto := make(map[uint]time.Time, len(tags))
	for _, t := range tags {
		if existing, ok := latestTagByPhoto[t.RawPhotoID]; !ok || t.CreatedAt.After(existing) {
			latestTagByPhoto[t.RawPhotoID] = t.CreatedAt
		}
	}

	var allPhotos []models.RawPhoto
	if err := s.db.Find(&allPhotos).Error; err != nil {
		return 0, err
	}

	var photos []models.RawPhoto
	for _, photo := range allPhotos {
		referenceTime := photo.CreatedAt
		if taggedAt, ok := latestTagByPhoto[photo.ID]; ok {
			referenceTime = taggedAt
		}
		if referenceTime.Before(cutoff) {
			photos = append(photos, photo)
		}
	}

	var deleted int64
	for _, photo := range photos {
		if err := s.db.Unscoped().Where("raw_photo_id = ?", photo.ID).Delete(&models.DetectedPhoto{}).Error; err != nil {
			log.Printf("ลบแท็กของรูป id=%d ไม่สำเร็จ (ข้ามไปก่อน ลองใหม่รอบหน้า): %v", photo.ID, err)
			continue
		}
		if err := s.db.Unscoped().Delete(&models.RawPhoto{}, photo.ID).Error; err != nil {
			log.Printf("ลบรูป id=%d ไม่สำเร็จ (ข้ามไปก่อน ลองใหม่รอบหน้า): %v", photo.ID, err)
			continue
		}
		if err := s.mediaStorage.Delete(context.Background(), MediaKindPhotoPost, photo.StorageKey); err != nil {
			log.Printf("ลบไฟล์รูป id=%d ไม่สำเร็จ (แถวถูกลบไปแล้ว ต้องตามลบไฟล์ด้วยมือ): %v", photo.ID, err)
		}
		deleted++
	}
	return deleted, nil
}
