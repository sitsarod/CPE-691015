package services

import (
	"context"
	"errors"
	"io"
	"log"
	"strings"
	"time"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"

	"gorm.io/gorm"
)

// การลงทะเบียนรูปใบหน้าของนักเรียน — ข้อมูลชีวภาพตาม PDPA ม.26
// ไฟล์ขึ้น Cloudinary โหมด authenticated เท่านั้น และการลบต้องลบไฟล์จริงด้วยเสมอ

// MaxFaceImagesPerCustomer = จำนวนท่าที่ต้องถ่าย จำกัดไม่ให้ใช้เป็นที่ฝากไฟล์
var MaxFaceImagesPerCustomer = len(models.AllFacePoses)

var (
	ErrFaceConsentRequired    = errors.New("กรุณาให้ความยินยอมเก็บข้อมูลใบหน้าก่อนอัปโหลดรูป")
	ErrInvalidFacePose        = errors.New("ท่าถ่ายรูปไม่ถูกต้อง (รองรับเฉพาะ front, left, right)")
	ErrFacePoseAlreadyExists  = errors.New("ถ่ายท่านี้ไว้แล้ว หากต้องการถ่ายใหม่ให้ลบรูปเดิมก่อน")
	ErrFaceImageLimitReached  = errors.New("อัปโหลดรูปใบหน้าครบตามจำนวนแล้ว")
	ErrFaceImageNotFound      = errors.New("ไม่พบรูปใบหน้าที่ระบุ")
	ErrFaceImageForbidden     = errors.New("ไม่มีสิทธิ์เข้าถึงรูปใบหน้านี้")
	ErrFaceStorageUnavailable = errors.New("ระบบจัดเก็บรูปใบหน้ายังไม่พร้อมใช้งาน กรุณาแจ้งผู้ดูแลระบบ")
	ErrInvalidFaceStatus      = errors.New("สถานะที่ใช้กรองไม่ถูกต้อง")
	ErrInvalidReviewAction    = errors.New("การกระทำไม่ถูกต้อง (รองรับเฉพาะ approve หรือ reject)")
	ErrRejectReasonRequired   = errors.New("กรุณาระบุเหตุผลที่ปฏิเสธรูปนี้")
)

type FaceImageService struct {
	db  *gorm.DB
	cld *CloudinaryService
}

// NewFaceImageService — cld เป็น nil ได้ แล้วเมธอดที่ต้องแตะไฟล์จะตอบ ErrFaceStorageUnavailable
//
// ⚠️ ตั้งใจไม่ fallback ไปเก็บในเครื่องเหมือนรูปทั่วไป เพราะโฟลเดอร์นั้นเสิร์ฟสาธารณะ
// ผ่าน r.Static และหายทุก redeploy — ทำงานได้แบบไม่ปลอดภัยแย่กว่าบอกตรง ๆ ว่ายังใช้ไม่ได้
func NewFaceImageService(db *gorm.DB, cld *CloudinaryService) *FaceImageService {
	return &FaceImageService{db: db, cld: cld}
}

// Upload รับรูปใบหน้าหนึ่งท่า — ผู้เรียกต้องตรวจขนาด/magic bytes มาก่อน (controllers/upload.go)
//
// คืนแถวสถานะ pending เพราะ embedding สร้างแบบ async โดย worker
// เพื่อให้อัปโหลดได้แม้ Python service ล่ม
func (s *FaceImageService) Upload(userID uint, pose models.FacePose, file io.Reader) (*models.FaceImage, error) {
	if s.cld == nil {
		return nil, ErrFaceStorageUnavailable
	}
	if !models.IsValidFacePose(pose) {
		return nil, ErrInvalidFacePose
	}

	customerID, err := ResolveCustomerID(s.db, userID)
	if err != nil {
		return nil, err
	}

	var customer models.Customer
	if err := s.db.First(&customer, customerID).Error; err != nil {
		return nil, ErrCustomerNotFound
	}
	if customer.FaceConsentStatus != models.FaceConsentGranted {
		return nil, ErrFaceConsentRequired
	}

	var existing int64
	if err := s.db.Model(&models.FaceImage{}).
		Where("customer_id = ?", customerID).Count(&existing).Error; err != nil {
		return nil, errors.New("ไม่สามารถตรวจสอบรูปใบหน้าที่มีอยู่ได้")
	}
	if existing >= int64(MaxFaceImagesPerCustomer) {
		return nil, ErrFaceImageLimitReached
	}

	var samePose int64
	if err := s.db.Model(&models.FaceImage{}).
		Where("customer_id = ? AND pose = ?", customerID, pose).Count(&samePose).Error; err != nil {
		return nil, errors.New("ไม่สามารถตรวจสอบรูปใบหน้าที่มีอยู่ได้")
	}
	if samePose > 0 {
		return nil, ErrFacePoseAlreadyExists
	}

	ctx := context.Background()
	storageKey, err := s.cld.UploadPrivateImage(ctx, file, s.cld.FaceEnrollmentFolder(customerID))
	if err != nil {
		log.Printf("อัปโหลดรูปใบหน้าขึ้น Cloudinary ไม่สำเร็จ (customer %d): %v", customerID, err)
		return nil, errors.New("อัปโหลดรูปใบหน้าไม่สำเร็จ กรุณาลองใหม่อีกครั้ง")
	}

	image := models.FaceImage{
		CustomerID: customerID,
		StorageKey: storageKey,
		Pose:       pose,
		Status:     models.FaceImagePending,
	}
	if err := s.db.Create(&image).Error; err != nil {
		// เขียนแถวไม่สำเร็จ = ไฟล์ที่เพิ่งอัปไม่มีใครชี้ถึงอีกเลย ต้องลบทันที
		DestroyFaceImageFiles(s.cld, []string{storageKey})

		// แข่งกันอัปท่าเดียวกันสองคำขอพร้อมกัน — unique index เป็นด่านสุดท้าย
		if isUniqueViolation(err) {
			return nil, ErrFacePoseAlreadyExists
		}
		return nil, errors.New("ไม่สามารถบันทึกข้อมูลรูปใบหน้าได้")
	}

	return &image, nil
}

// ListMine คืนรูปทั้งหมดของนักเรียนที่ล็อกอินอยู่ พร้อมสถานะแต่ละท่า
func (s *FaceImageService) ListMine(userID uint) ([]models.FaceImage, error) {
	customerID, err := ResolveCustomerID(s.db, userID)
	if err != nil {
		return nil, err
	}

	var images []models.FaceImage
	if err := s.db.Where("customer_id = ?", customerID).
		Order("id asc").Find(&images).Error; err != nil {
		return nil, errors.New("ไม่สามารถดึงข้อมูลรูปใบหน้าได้")
	}
	return images, nil
}

// OpenRaw ตรวจสิทธิ์แล้วคืนสตรีมของไฟล์รูป ให้ controller ส่งต่อให้ client
// ผู้เรียกต้องปิด ReadCloser ที่ได้เสมอ
func (s *FaceImageService) OpenRaw(userID uint, role models.UserRole, imageID uint) (io.ReadCloser, string, error) {
	if s.cld == nil {
		return nil, "", ErrFaceStorageUnavailable
	}

	image, err := s.findOwned(userID, role, imageID)
	if err != nil {
		return nil, "", err
	}

	body, contentType, err := s.cld.DownloadPrivateImage(context.Background(), image.StorageKey)
	if err != nil {
		log.Printf("ดึงรูปใบหน้า id=%d จาก Cloudinary ไม่สำเร็จ: %v", imageID, err)
		return nil, "", errors.New("ไม่สามารถเปิดรูปใบหน้าได้")
	}
	return body, contentType, nil
}

// Delete ลบรูปหนึ่งใบ ทั้งแถวในฐานและไฟล์จริงบน Cloudinary
func (s *FaceImageService) Delete(userID uint, role models.UserRole, imageID uint) error {
	image, err := s.findOwned(userID, role, imageID)
	if err != nil {
		return err
	}

	// ลบแถวก่อนแล้วค่อยลบไฟล์ (เหตุผลเดียวกับที่อธิบายไว้ใน photo_storage.go)
	if err := s.db.Delete(&models.FaceImage{}, image.ID).Error; err != nil {
		return errors.New("ไม่สามารถลบรูปใบหน้าได้")
	}
	DestroyFaceImageFiles(s.cld, []string{image.StorageKey})
	return nil
}

// findOwned ตรวจสิทธิ์ — แอดมินเข้าถึงได้เพราะต้องเปิดดูตอนตรวจอนุมัติ คนอื่นต้องเป็นเจ้าของ
//
// ⚠️ ตอบ 403 ไม่ใช่ 404 เมื่อไม่ใช่ของตัวเอง — id เป็นเลขเรียงที่เดาต่อได้
// ถ้าตอบต่างกันจะไล่นับได้ว่าใครลงทะเบียนใบหน้าไว้บ้าง
func (s *FaceImageService) findOwned(userID uint, role models.UserRole, imageID uint) (*models.FaceImage, error) {
	var image models.FaceImage
	if err := s.db.First(&image, imageID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrFaceImageNotFound
		}
		return nil, errors.New("ไม่สามารถดึงข้อมูลรูปใบหน้าได้")
	}

	if role == models.AdminRole {
		return &image, nil
	}

	customerID, err := ResolveCustomerID(s.db, userID)
	if err != nil || image.CustomerID != customerID {
		return nil, ErrFaceImageForbidden
	}
	return &image, nil
}

// ─── ฝั่งแอดมิน: ตรวจอนุมัติรูป ───

// ListForAdmin คืนรูปพร้อมชื่อเจ้าของ · status ว่าง = ทุกสถานะ
// เรียงเก่าสุดก่อนเพราะเป็นคิว คนที่รอนานที่สุดควรได้ตรวจก่อน
func (s *FaceImageService) ListForAdmin(status string) ([]dto.AdminFaceImageDTO, error) {
	if status != "" && !isKnownFaceStatus(models.FaceImageStatus(status)) {
		return nil, ErrInvalidFaceStatus
	}

	q := s.db.Table("face_images AS fi").
		Select(`fi.id, fi.customer_id, c.nickname, c.member_code,
		        fi.pose, fi.status, fi.reject_reason,
		        fi.quality_score, fi.liveness_score,
		        fi.verified_by, fi.verified_at, fi.created_at,
		        (fi.storage_key <> '') AS has_file`).
		Joins("LEFT JOIN customers c ON c.id = fi.customer_id").
		Order("fi.created_at asc")

	if status != "" {
		q = q.Where("fi.status = ?", status)
	}

	var out []dto.AdminFaceImageDTO
	if err := q.Scan(&out).Error; err != nil {
		return nil, errors.New("ไม่สามารถดึงรายการรูปใบหน้าได้")
	}
	return out, nil
}

// Review — approve → ready · reject → rejected + ลบไฟล์ทิ้ง
// (ไม่มีเหตุให้เก็บภาพที่ระบบจะไม่ใช้ ยิ่งเก็บยิ่งเสี่ยง) แต่คงแถวไว้ให้นักเรียนเห็นเหตุผล
func (s *FaceImageService) Review(adminUserID, imageID uint, action, reason string) (*models.FaceImage, error) {
	var image models.FaceImage
	if err := s.db.First(&image, imageID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrFaceImageNotFound
		}
		return nil, errors.New("ไม่สามารถดึงข้อมูลรูปใบหน้าได้")
	}

	now := time.Now()
	updates := map[string]any{"verified_by": adminUserID, "verified_at": now}

	switch action {
	case "approve":
		updates["status"] = models.FaceImageReady
		updates["reject_reason"] = ""
	case "reject":
		if strings.TrimSpace(reason) == "" {
			return nil, ErrRejectReasonRequired
		}
		updates["status"] = models.FaceImageRejected
		updates["reject_reason"] = strings.TrimSpace(reason)
		// ล้าง key ในฐานพร้อมกัน ไม่งั้นจะเหลือแถวที่ชี้ไปหาไฟล์ที่ลบไปแล้ว
		updates["storage_key"] = ""
	default:
		return nil, ErrInvalidReviewAction
	}

	if err := s.db.Model(&models.FaceImage{}).Where("id = ?", imageID).
		Updates(updates).Error; err != nil {
		return nil, errors.New("ไม่สามารถบันทึกผลการตรวจได้")
	}

	// ลบไฟล์หลังอัปเดตแถวสำเร็จเท่านั้น (เหตุผลเดียวกับที่อื่นในไฟล์นี้)
	if action == "reject" {
		DestroyFaceImageFiles(s.cld, []string{image.StorageKey})
	}

	if err := s.db.First(&image, imageID).Error; err != nil {
		return nil, errors.New("ไม่สามารถดึงข้อมูลรูปใบหน้าได้")
	}
	return &image, nil
}

func isKnownFaceStatus(s models.FaceImageStatus) bool {
	switch s {
	case models.FaceImagePending, models.FaceImageAwaitingReview,
		models.FaceImageReady, models.FaceImageRejected:
		return true
	}
	return false
}

// DeleteCustomerFaceImages ลบรูปทั้งหมดของนักเรียนคนหนึ่งภายใน tx ที่ให้มา
// แล้วคืน StorageKey ให้ผู้เรียกไปลบไฟล์ต่อ "หลัง commit"
//
// ⚠️ แยกสองขั้นเพราะ Cloudinary rollback ไม่ได้ — ถ้าลบไฟล์ใน tx แล้ว tx rollback
// จะเหลือแถวที่ชี้ไปหาไฟล์ที่หายไปแล้ว
func DeleteCustomerFaceImages(tx *gorm.DB, customerID uint) ([]string, error) {
	var keys []string
	if err := tx.Model(&models.FaceImage{}).
		Where("customer_id = ?", customerID).
		Pluck("storage_key", &keys).Error; err != nil {
		return nil, errors.New("ไม่สามารถดึงรายการรูปใบหน้าที่ต้องลบได้")
	}
	if len(keys) == 0 {
		return nil, nil
	}

	// face_images ไม่มี DeletedAt อยู่แล้ว Delete จึงเป็นการลบจริงเสมอ
	if err := tx.Where("customer_id = ?", customerID).
		Delete(&models.FaceImage{}).Error; err != nil {
		return nil, errors.New("ไม่สามารถลบรูปใบหน้าได้")
	}
	return keys, nil
}

// DestroyFaceImageFiles ลบไฟล์บน Cloudinary — เรียกหลัง commit เท่านั้น
//
// ไม่คืน error โดยตั้งใจ (เหมือน RemovePhotoFiles) แต่ต้อง log เสมอ เพราะการลบ
// ข้อมูลชีวภาพไม่สำเร็จแบบเงียบ ๆ ทำให้ตรวจย้อนหลังไม่ได้ว่าลบจริงหรือยัง
func DestroyFaceImageFiles(cld *CloudinaryService, keys []string) {
	if cld == nil {
		return
	}

	ctx := context.Background()
	for _, key := range keys {
		if key == "" {
			continue
		}
		if err := cld.DestroyPrivateImage(ctx, key); err != nil {
			log.Printf("[PDPA] ลบไฟล์ใบหน้าบน Cloudinary ไม่สำเร็จ %s: %v — ต้องตามลบด้วยมือ", key, err)
		}
	}
}

// ─── งานสคีมาเฉพาะ postgres — เรียกจาก cmd/migrate และ cmd/init เท่านั้น ───
// (ไม่เรียกใน newTestDB ที่ใช้ sqlite) วางท้ายไฟล์แบบเดียวกับ member_code.go

// EnableVectorExtension — ⚠️ ต้องเรียกก่อน AutoMigrate ไม่งั้นสร้างคอลัมน์ vector(512) ไม่ได้
func EnableVectorExtension(db *gorm.DB) error {
	return db.Exec("CREATE EXTENSION IF NOT EXISTS vector").Error
}

// EnsureFaceImageIndexes สร้าง hnsw index หลัง AutoMigrate
// ops ต้องตรงกับตัวดำเนินการที่ query ใช้ (<=>) ไม่งั้น postgres ไม่หยิบ index ไปใช้
func EnsureFaceImageIndexes(db *gorm.DB) error {
	return db.Exec(`
		CREATE INDEX IF NOT EXISTS idx_face_images_embedding
		ON face_images USING hnsw (embedding vector_cosine_ops)
	`).Error
}
