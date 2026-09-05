package services

import (
	"CPE-691015/internal/models"
	"context"
	"errors"
	"fmt"
	"log"
	"math/rand"
	"time"

	"gorm.io/gorm"
)

type DetectedVideoService struct {
	db           *gorm.DB
	mediaStorage MediaStorage
}

func NewDetectedVideoService(db *gorm.DB) *DetectedVideoService {
	return &DetectedVideoService{db: db}
}

// WithMediaStorage ผูกที่เก็บไฟล์เข้ากับ service — ต้องเรียกก่อนใช้ DeleteOldRawVideos เท่านั้น
func (s *DetectedVideoService) WithMediaStorage(ms MediaStorage) *DetectedVideoService {
	s.mediaStorage = ms
	return s
}

// ErrRawVideoForbidden ใช้เมื่อโค้ชพยายามจัดการ/ดูวิดีโอที่ไม่ใช่ของตัวเอง (กัน IDOR)
// วิดีโอที่แอดมินอัปโหลดเอง (CoachID เป็น nil) จะให้เฉพาะแอดมินจัดการได้เท่านั้น
var ErrRawVideoForbidden = errors.New("ไม่มีสิทธิ์เข้าถึงวิดีโอนี้")

// VerifyCoachOwnsRawVideo คืน nil ถ้าผู้ใช้เป็นแอดมิน หรือเป็นโค้ชเจ้าของวิดีโอนี้จริง
func VerifyCoachOwnsRawVideo(db *gorm.DB, rawVideo *models.RawVideo, userID uint, role string) error {
	if role == string(models.AdminRole) {
		return nil
	}
	coachID, err := resolveCoachIDByUser(db, userID)
	if err != nil || rawVideo.CoachID == nil || *rawVideo.CoachID != coachID {
		return ErrRawVideoForbidden
	}
	return nil
}

// VerifyCanViewRawVideo คืน nil ถ้าเป็นแอดมิน, โค้ชเจ้าของวิดีโอนี้ (ผ่าน VerifyCoachOwnsRawVideo),
// หรือนักเรียนที่ถูกแท็กอยู่ในวิดีโอนี้จริง (ผ่าน DetectedVideo) — ใช้คุม endpoint ดูเนื้อไฟล์จริง
// (GetVideoRaw) ที่ผูกกับข้อมูลชีวภาพของนักเรียนตาม PDPA
func VerifyCanViewRawVideo(db *gorm.DB, rawVideo *models.RawVideo, userID uint, role string) error {
	if err := VerifyCoachOwnsRawVideo(db, rawVideo, userID, role); err == nil {
		return nil
	}

	customerID, err := ResolveCustomerID(db, userID)
	if err != nil {
		return ErrRawVideoForbidden
	}

	var count int64
	if err := db.Model(&models.DetectedVideo{}).
		Where("raw_video_id = ? AND customer_id = ?", rawVideo.ID, customerID).
		Count(&count).Error; err != nil || count == 0 {
		return ErrRawVideoForbidden
	}
	return nil
}

// CreateRawVideo บันทึกวิดีโอต้นฉบับที่อัปโหลดโดยโค้ช (storageKey มาจาก MediaStorage.Save มาแล้ว)
// coachID เป็น nil เมื่อแอดมินเป็นคนอัปโหลดเอง (ไม่ผูกกับโค้ชคนไหน)
//
// ⚠️ ครอบทั้ง create และ update ด้วย transaction เดียว — ถ้า update ล้มเหลวหลัง create สำเร็จแล้ว
// ต้อง rollback การ create ไปด้วย ไม่งั้นจะเหลือแถวกำพร้าที่ video_url ว่างเปล่าค้างอยู่ถาวร
func (s *DetectedVideoService) CreateRawVideo(storageKey string, coachID *uint) (*models.RawVideo, error) {
	var rawVideo models.RawVideo
	err := s.db.Transaction(func(tx *gorm.DB) error {
		rawVideo = models.RawVideo{StorageKey: storageKey, CoachID: coachID}
		if err := tx.Create(&rawVideo).Error; err != nil {
			return err
		}
		rawVideo.VideoURL = fmt.Sprintf("/videos/%d/raw", rawVideo.ID)
		return tx.Model(&rawVideo).Update("video_url", rawVideo.VideoURL).Error
	})
	if err != nil {
		return nil, errors.New("ไม่สามารถบันทึกข้อมูลวิดีโอต้นฉบับได้")
	}
	return &rawVideo, nil
}

// ProcessFaceDetection รันระบบจำลองการสแกนใบหน้าหาตัวตนนักเรียนในวิดีโอ (Mock Face Recognition)
// โดยระบบจะสแกนหาเฉพาะนักเรียนที่กดยินยอมเก็บใบหน้า (PDPA: FaceConsentStatus == "granted") เท่านั้น
func (s *DetectedVideoService) ProcessFaceDetection(rawVideoID uint, videoURL string) ([]models.DetectedVideo, error) {
	var activeConsentCustomers []models.Customer
	// ดึงนักเรียนทั้งหมดที่ให้ความยินยอมสแกนใบหน้า
	err := s.db.Where("face_consent_status = ?", string(models.FaceConsentGranted)).
		Preload("User").
		Find(&activeConsentCustomers).Error
	if err != nil {
		return nil, errors.New("ไม่สามารถดึงรายชื่อนักเรียนที่มีประวัติการให้ความยินยอมใบหน้าได้")
	}

	var detected []models.DetectedVideo

	// หากไม่มีนักเรียนที่กดยินยอมเลย จะไม่เกิดการจำลองตรวจจับ
	if len(activeConsentCustomers) == 0 {
		return detected, nil
	}

	// สุ่มตรวจจับพบนักเรียนประมาณ 1-2 คนจากนักเรียนที่กดยินยอม (ถ้ามี)
	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	countToDetect := r.Intn(2) + 1 // สุ่มพบ 1-2 คน
	if countToDetect > len(activeConsentCustomers) {
		countToDetect = len(activeConsentCustomers)
	}

	// สับเปลี่ยนลำดับเพื่อสุ่มเลือกนักเรียน
	r.Shuffle(len(activeConsentCustomers), func(i, j int) {
		activeConsentCustomers[i], activeConsentCustomers[j] = activeConsentCustomers[j], activeConsentCustomers[i]
	})

	for i := 0; i < countToDetect; i++ {
		cust := activeConsentCustomers[i]

		// สร้าง DetectedVideo ผูกนักเรียนเข้ากับวิดีโอ
		detectedVideo := models.DetectedVideo{
			CustomerID: cust.ID,
			RawVideoID: rawVideoID,
			VideoURL:   videoURL,
		}

		if err := s.db.Create(&detectedVideo).Error; err != nil {
			return nil, errors.New("ไม่สามารถบันทึกความสัมพันธ์วิดีโอกับใบหน้านักเรียนได้")
		}

		// ดึงความสัมพันธ์มาให้ครบก่อนส่งกลับ
		s.db.Preload("Customer").Preload("Customer.User").First(&detectedVideo, detectedVideo.ID)
		detected = append(detected, detectedVideo)
	}

	return detected, nil
}

// ManuallyAssignStudentsToVideo โค้ชระบุรายชื่อนักเรียนในวิดีโอเอง (เพื่อแก้ไขกรณี AI ตรวจไม่พบ หรือโค้ชเลือกเอง)
//
// เฉพาะนักเรียนที่ยินยอมให้เก็บข้อมูลใบหน้าแล้ว (FaceConsentStatus == granted) เท่านั้นที่จะถูกผูกจริง
// คนที่ไม่มีอยู่จริงหรือยังไม่ยินยอมจะถูกข้าม และคืนรายชื่อที่ถูกข้ามเพราะไม่ยินยอมแยกไว้
// ให้ฝั่งเรียกแจ้งโค้ชได้ว่าทำไมบางคนถึงไม่ถูกเพิ่ม
func (s *DetectedVideoService) ManuallyAssignStudentsToVideo(rawVideoID uint, videoURL string, customerIDs []uint) (assigned []models.DetectedVideo, skippedNoConsent []uint, err error) {
	// ลบความสัมพันธ์การตรวจจับใบหน้าเดิมของวิดีโอนี้ออกก่อน
	if err := s.db.Where("raw_video_id = ?", rawVideoID).Delete(&models.DetectedVideo{}).Error; err != nil {
		return nil, nil, errors.New("ไม่สามารถรีเซ็ตข้อมูลการวิเคราะห์วิดีโอเดิมได้")
	}

	for _, customerID := range customerIDs {
		// ตรวจสอบว่านักเรียนมีจริงหรือไม่
		var cust models.Customer
		if err := s.db.First(&cust, customerID).Error; err != nil {
			continue // ข้ามถ้าไม่พบ
		}

		// กันโค้ชแท็กนักเรียนที่ไม่เคยยินยอมให้เก็บข้อมูลใบหน้าเข้าไปในวิดีโอ
		if cust.FaceConsentStatus != models.FaceConsentGranted {
			skippedNoConsent = append(skippedNoConsent, customerID)
			continue
		}

		detectedVideo := models.DetectedVideo{
			CustomerID: customerID,
			RawVideoID: rawVideoID,
			VideoURL:   videoURL,
		}

		if err := s.db.Create(&detectedVideo).Error; err != nil {
			return nil, nil, errors.New("ไม่สามารถจัดเก็บข้อมูลนักเรียนในวิดีโอได้")
		}

		s.db.Preload("Customer").Preload("Customer.User").First(&detectedVideo, detectedVideo.ID)
		assigned = append(assigned, detectedVideo)
	}

	return assigned, skippedNoConsent, nil
}

// GetDetectedVideosByStudentID ค้นหาวิดีโอทั้งหมดที่มีภาพนักเรียนคนนี้ปรากฏตัวอยู่
func (s *DetectedVideoService) GetDetectedVideosByStudentID(customerID uint) ([]models.DetectedVideo, error) {
	var videos []models.DetectedVideo
	err := s.db.Where("customer_id = ?", customerID).
		Preload("RawVideo").
		Order("created_at DESC").
		Find(&videos).Error
	if err != nil {
		return nil, errors.New("ไม่สามารถค้นหาวิดีโอของนักเรียนคนนี้ได้")
	}
	return videos, nil
}

// GetDetectedVideosByRawVideoID ดึงรายชื่อนักเรียนที่ปรากฏตัวในวิดีโอนี้
func (s *DetectedVideoService) GetDetectedVideosByRawVideoID(rawVideoID uint) ([]models.DetectedVideo, error) {
	var list []models.DetectedVideo
	err := s.db.Where("raw_video_id = ?", rawVideoID).
		Preload("Customer").
		Preload("Customer.User").
		Find(&list).Error
	return list, err
}

// DeleteOldRawVideos ลบวิดีโอที่อัปโหลดมานานเกิน olderThan ทิ้งถาวร (แถว + แท็ก + ไฟล์จริง)
// เหตุผล/ลำดับการลบเหมือน DeletedPhotoService.DeleteOldRawPhotos ทุกอย่าง
func (s *DetectedVideoService) DeleteOldRawVideos(olderThan time.Duration) (int64, error) {
	if s.mediaStorage == nil {
		return 0, nil
	}

	cutoff := time.Now().Add(-olderThan)

	var videos []models.RawVideo
	if err := s.db.Where("created_at < ?", cutoff).Find(&videos).Error; err != nil {
		return 0, err
	}

	var deleted int64
	for _, video := range videos {
		if err := s.db.Unscoped().Where("raw_video_id = ?", video.ID).Delete(&models.DetectedVideo{}).Error; err != nil {
			log.Printf("ลบแท็กของวิดีโอ id=%d ไม่สำเร็จ (ข้ามไปก่อน ลองใหม่รอบหน้า): %v", video.ID, err)
			continue
		}
		if err := s.db.Unscoped().Delete(&models.RawVideo{}, video.ID).Error; err != nil {
			log.Printf("ลบวิดีโอ id=%d ไม่สำเร็จ (ข้ามไปก่อน ลองใหม่รอบหน้า): %v", video.ID, err)
			continue
		}
		if err := s.mediaStorage.Delete(context.Background(), MediaKindVideo, video.StorageKey); err != nil {
			log.Printf("ลบไฟล์วิดีโอ id=%d ไม่สำเร็จ (แถวถูกลบไปแล้ว ต้องตามลบไฟล์ด้วยมือ): %v", video.ID, err)
		}
		deleted++
	}
	return deleted, nil
}
