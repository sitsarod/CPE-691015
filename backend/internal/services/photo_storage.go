package services

import (
	"log"
	"os"
	"path/filepath"
	"strings"

	"CPE-691015/internal/models"

	"gorm.io/gorm"
)

// ─────────────────────────────────────────────────────────────────────────────
// ลบภาพใบหน้า — ทั้งแถวในฐานข้อมูลและไฟล์จริงบนดิสก์
//
// ─── ปัญหาที่แก้ ───
//
// ระบบมี 3 ทางที่ทำให้ภาพใบหน้าต้องหายไป แต่เดิมลบไฟล์จริงแค่ทางเดียว:
//
//	กดลบรูปทีละใบ (PhotoController.DeletePhoto)  → ลบแถว + ลบไฟล์  ✓
//	ลบสมาชิก (UserService.DeleteUser)            → ลบแถวอย่างเดียว  ✗
//	ถอนความยินยอม (ConsentService.Withdraw)      → ไม่ลบอะไรเลย     ✗
//
// (PhotoController ถูกลบไปแล้วตอนย้ายรูปใบหน้าไป face_images เหลือใช้จริงสองทางล่าง)
//
// สองทางหลังเป็นปัญหาเพราะระบบขึ้นข้อความบอกผู้ใช้ไปแล้วว่า
// "ระบบจะลบภาพใบหน้าและข้อมูลที่เกี่ยวข้องทั้งหมด" แต่ไฟล์ยังอยู่ครบ
// ตาม PDPA คือยังเก็บข้อมูลชีวภาพไว้ทั้งที่ไม่มีฐานให้เก็บแล้ว
//
// ไฟล์นี้รวมตรรกะการลบไว้ที่เดียว ทั้งสามทางจะได้ใช้ตัวเดียวกัน
// ─────────────────────────────────────────────────────────────────────────────

// facesDir คือโฟลเดอร์ที่ระบบเก่าเคยเก็บภาพใบหน้าไว้
// ไม่มีใครเขียนลงที่นี่แล้ว แต่ยังต้องรู้จักพาธเพื่อตามลบไฟล์ที่ค้างจากของเดิม
const facesDir = "./uploads/faces"

// PhotoFilePath แปลง URL ของรูปเป็นพาธไฟล์บนดิสก์
//
// คืนค่าว่างถ้าเป็นไฟล์ที่ไม่ได้เก็บในเครื่อง (เช่นอยู่บน Cloudinary) หรือ URL ว่าง
//
// ⚠️ ใช้ filepath.Base เพื่อตัดส่วนพาธทั้งหมดทิ้ง เหลือแค่ชื่อไฟล์
// ถ้าเอาค่าจาก URL มาต่อพาธตรง ๆ คนที่แก้ค่าในฐานได้จะใส่ ../../ แล้วสั่งลบไฟล์
// นอกโฟลเดอร์นี้ได้ เช่นไฟล์ .env หรือไฟล์ระบบ
func PhotoFilePath(photoURL string) string {
	photoURL = strings.TrimSpace(photoURL)
	if photoURL == "" {
		return ""
	}

	// ไฟล์ที่ฝากไว้บนคลาวด์ต้องลบผ่าน API ของผู้ให้บริการ ลบด้วย os.Remove ไม่ได้
	// ตอนนี้ภาพใบหน้าเก็บในเครื่องทั้งหมด เงื่อนไขนี้จึงเป็นการกันไว้ล่วงหน้า
	if strings.Contains(photoURL, "res.cloudinary.com") {
		return ""
	}

	name := filepath.Base(photoURL)
	if name == "." || name == "/" || name == "" {
		return ""
	}
	return filepath.Join(facesDir, name)
}

// RemovePhotoFiles ลบไฟล์รูปตามรายการ URL ที่ให้มา
//
// ⚠️ ต้องเรียกหลังจาก transaction commit สำเร็จแล้วเท่านั้น
//
// การลบไฟล์ย้อนกลับไม่ได้ ถ้าลบไฟล์ระหว่างอยู่ใน transaction แล้ว transaction
// ถูก rollback ทีหลัง จะได้สถานะที่แถวยังอยู่แต่ไฟล์หายไปแล้ว ซึ่งซ่อมไม่ได้
// การรอให้ commit ผ่านก่อนแลกมาด้วยความเสี่ยงที่เบากว่ามาก คือถ้าลบไฟล์พลาด
// จะเหลือไฟล์กำพร้าที่ไม่มีแถวชี้ถึง ซึ่งตามเก็บทีหลังได้
//
// ไม่คืน error โดยตั้งใจ — ลบไฟล์ไม่สำเร็จไม่ควรทำให้การลบสมาชิกทั้งก้อนล้มเหลว
// แต่ "ต้องเขียน log เสมอ" เพราะการลบข้อมูลชีวภาพไม่สำเร็จแบบเงียบ ๆ
// คือสิ่งที่ทำให้ตรวจสอบย้อนหลังไม่ได้ว่าข้อมูลถูกลบจริงหรือยัง
func RemovePhotoFiles(photoURLs []string) {
	for _, url := range photoURLs {
		path := PhotoFilePath(url)
		if path == "" {
			continue
		}

		if err := os.Remove(path); err != nil {
			if os.IsNotExist(err) {
				// ไฟล์หายไปก่อนแล้ว ถือว่าได้ผลลัพธ์ที่ต้องการ ไม่ต้องเตือน
				continue
			}
			log.Printf("[PDPA] ลบไฟล์ภาพใบหน้าไม่สำเร็จ %s: %v — ต้องตามลบด้วยมือ", path, err)
		}
	}
}

// deletePhotoRows ลบแถว photos ของเจ้าของที่ระบุ แล้วคืนรายการ URL ของไฟล์ที่ต้องลบตาม
//
// column ต้องเป็น "customer_id" หรือ "coach_id" เท่านั้น (ไม่ได้รับค่าจากผู้ใช้
// ทุกจุดที่เรียกส่งค่าคงที่มาเอง จึงไม่มีช่อง SQL injection)
func deletePhotoRows(tx *gorm.DB, column string, ownerID uint) ([]string, error) {
	var photos []models.Photo
	if err := tx.Where(column+" = ?", ownerID).Find(&photos).Error; err != nil {
		return nil, err
	}

	if len(photos) == 0 {
		return nil, nil
	}

	urls := make([]string, 0, len(photos))
	for _, p := range photos {
		urls = append(urls, p.PhotoURL)
	}

	// Unscoped = ลบออกจากตารางจริง ไม่ใช่ soft delete
	//
	// ต่างจากตารางอื่นที่เก็บแถวไว้เผื่อตรวจย้อนหลัง เพราะรูปของคนที่ขอให้ลบข้อมูล
	// ต้องหายจริงตาม PDPA — soft delete เท่ากับยังเก็บไว้ แค่ซ่อนจาก query
	if err := tx.Unscoped().Where(column+" = ?", ownerID).Delete(&models.Photo{}).Error; err != nil {
		return nil, err
	}

	return urls, nil
}

// DeleteCustomerPhotos ลบภาพใบหน้าทั้งหมดของผู้เรียน (customers.id)
func DeleteCustomerPhotos(tx *gorm.DB, customerID uint) ([]string, error) {
	return deletePhotoRows(tx, "customer_id", customerID)
}

// DeleteCoachPhotos ลบภาพใบหน้าทั้งหมดของโค้ช (coaches.id)
func DeleteCoachPhotos(tx *gorm.DB, coachID uint) ([]string, error) {
	return deletePhotoRows(tx, "coach_id", coachID)
}

// CleanupLegacyFacePhotos ล้างซากของระบบใบหน้าตัวเก่าออกจากตาราง photos
//
// photo_controller เดิมเขียน embedding ที่สุ่มจาก math/rand ลงคอลัมน์ face_embedding
// controller ถูกลบไปแล้ว แต่ AutoMigrate ไม่ลบคอลัมน์ให้ — ถ้าปล่อยไว้จะเหลือคอลัมน์
// ที่หน้าตาเหมือนข้อมูลชีวภาพจริงค้างในฐาน เสี่ยงมีคนหยิบไปใช้โดยไม่รู้ว่าเป็นค่ามั่ว
//
// เป็นคำสั่งเฉพาะ postgres เรียกจาก cmd/migrate เท่านั้น (รันซ้ำได้ ครั้งที่สองเป็น no-op)
//
// ⚠️ ลบแถวเฉพาะที่ชี้ไป /uploads/faces/ เป็นตัวกันพลาด เผื่อมีรูปโปรไฟล์/แกลเลอรี
// ถูกเพิ่มเข้ามาทีหลัง (ตอนนี้ทุกแถวมาจาก controller ตัวเก่าตัวเดียว)
func CleanupLegacyFacePhotos(db *gorm.DB) error {
	const legacyPattern = "%/uploads/faces/%"

	// อ่าน URL เก็บไว้ก่อนลบแถว เพื่อเอาไปตามลบไฟล์จริงบนดิสก์ต่อ
	var legacyURLs []string
	if err := db.Table("photos").
		Where("photo_url LIKE ?", legacyPattern).
		Pluck("photo_url", &legacyURLs).Error; err != nil {
		return err
	}

	if len(legacyURLs) > 0 {
		if err := db.Exec(`DELETE FROM photos WHERE photo_url LIKE ?`, legacyPattern).Error; err != nil {
			return err
		}
		// เรียกหลังลบแถวสำเร็จเท่านั้น (เหตุผลอยู่ที่ RemovePhotoFiles ด้านบน)
		RemovePhotoFiles(legacyURLs)
		log.Printf("ล้างรูปใบหน้าของระบบเก่าออกจากตาราง photos แล้ว %d แถว", len(legacyURLs))
	}

	statements := []string{
		`ALTER TABLE photos DROP COLUMN IF EXISTS face_embedding`,
		`ALTER TABLE photos DROP COLUMN IF EXISTS is_verified`,
	}
	for _, sql := range statements {
		if err := db.Exec(sql).Error; err != nil {
			return err
		}
	}
	return nil
}
