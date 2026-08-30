package services

import (
	"testing"

	"CPE-691015/internal/models"
)

// เทสนี้คุมช่องโหว่ที่เจอ: ตอนนักเรียนถอนความยินยอมเก็บข้อมูลใบหน้า ระบบต้องลบ
// "หลักฐานว่าเคยถูกจำแนกใบหน้า" (DetectedVideo/DetectedPhoto) ของนักเรียนคนนั้นออกด้วย
// ไม่ใช่ลบแค่ Photo (รูปยินยอมอ้างอิง) เฉย ๆ — ส่วน RawVideo/RawPhoto (ไฟล์ต้นฉบับ)
// ต้องไม่ถูกลบ เพราะอาจมีนักเรียนคนอื่นที่ยังยินยอมอยู่ถูกแท็กอยู่ในสื่อชิ้นเดียวกันด้วย
func TestWithdrawCascadesDeleteDetectionLinksButKeepsRawMedia(t *testing.T) {
	db := newTestDB(t,
		&models.User{}, &models.Customer{}, &models.BiometricConsent{},
		&models.Photo{}, &models.RawVideo{}, &models.DetectedVideo{},
		&models.RawPhoto{}, &models.DetectedPhoto{},
	)

	user := models.User{Role: models.CustomerRole, Email: "withdraw-test@example.com"}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("สร้างผู้ใช้ไม่สำเร็จ: %v", err)
	}

	customer := models.Customer{
		UserID:            user.ID,
		Gender:            models.GenderMale,
		PersonalQRCode:    "qr-withdraw-cascade",
		FaceConsentStatus: models.FaceConsentGranted,
	}
	if err := db.Create(&customer).Error; err != nil {
		t.Fatalf("สร้างนักเรียนไม่สำเร็จ: %v", err)
	}

	rawVideo := models.RawVideo{VideoURL: "http://x/v.mp4"}
	db.Create(&rawVideo)
	db.Create(&models.DetectedVideo{CustomerID: customer.ID, RawVideoID: rawVideo.ID, VideoURL: rawVideo.VideoURL})

	rawPhoto := models.RawPhoto{PhotoURL: "http://x/p.jpg"}
	db.Create(&rawPhoto)
	db.Create(&models.DetectedPhoto{CustomerID: customer.ID, RawPhotoID: rawPhoto.ID, PhotoURL: rawPhoto.PhotoURL})

	svc := NewConsentService(db)
	if _, err := svc.Withdraw(user.ID, ConsentMeta{}); err != nil {
		t.Fatalf("ถอนความยินยอมควรผ่าน แต่ได้: %v", err)
	}

	var dvCount, dpCount int64
	db.Model(&models.DetectedVideo{}).Where("customer_id = ?", customer.ID).Count(&dvCount)
	db.Model(&models.DetectedPhoto{}).Where("customer_id = ?", customer.ID).Count(&dpCount)
	if dvCount != 0 {
		t.Errorf("ควรลบ DetectedVideo ของนักเรียนที่ถอนความยินยอมแล้วหมด แต่เหลือ %d แถว", dvCount)
	}
	if dpCount != 0 {
		t.Errorf("ควรลบ DetectedPhoto ของนักเรียนที่ถอนความยินยอมแล้วหมด แต่เหลือ %d แถว", dpCount)
	}

	// ไฟล์ต้นฉบับต้องยังอยู่ — อาจมีนักเรียนคนอื่นที่ยังยินยอมอยู่ถูกแท็กอยู่ในสื่อเดียวกัน
	var rawVideoCount, rawPhotoCount int64
	db.Model(&models.RawVideo{}).Where("id = ?", rawVideo.ID).Count(&rawVideoCount)
	db.Model(&models.RawPhoto{}).Where("id = ?", rawPhoto.ID).Count(&rawPhotoCount)
	if rawVideoCount != 1 {
		t.Errorf("ไม่ควรลบ RawVideo (ไฟล์ต้นฉบับ) แต่หายไป")
	}
	if rawPhotoCount != 1 {
		t.Errorf("ไม่ควรลบ RawPhoto (ไฟล์ต้นฉบับ) แต่หายไป")
	}

	var status models.Customer
	db.First(&status, customer.ID)
	if status.FaceConsentStatus != models.FaceConsentWithdrawn {
		t.Errorf("สถานะความยินยอมควรเป็น withdrawn แต่ได้ %s", status.FaceConsentStatus)
	}
}
