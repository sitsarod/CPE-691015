package services

import (
	"log"
	"os"
	"path"
	"path/filepath"
	"strings"

	"CPE-691015/internal/models"

	"gorm.io/gorm"
)

// ─────────────────────────────────────────────────────────────────────────────
// การล้างข้อมูลส่วนตัวตอนลบบัญชี (PDPA ม.22 เก็บเท่าที่จำเป็น / ม.37(3) ลบเมื่อหมดเหตุ)
//
// การลบบัญชีเป็น soft delete แถวยังอยู่เพื่อให้เอกสารการเงินย้อนหลัง join หาชื่อเจ้าของได้
// แต่ "หาชื่อเจ้าของได้" ต้องการแค่ชื่อกับเลขบัญชี ไม่ต้องใช้เลขบัตรประชาชน ที่อยู่ หรือ LINE
// ฟิลด์ที่ไม่มีใครใช้ต่อจึงล้างทิ้งตอนลบ
//
// ⚠️ ไม่มีทางกู้คืน — ระบบไม่มี restore/undelete อยู่แล้ว การล้างจึงไม่ได้ทำให้เสีย
// ความสามารถอะไรที่เคยมี แต่แปลว่ากดลบผิดแล้วจบจริง
// ─────────────────────────────────────────────────────────────────────────────

// erasureFiles คือไฟล์ที่ต้องลบ "หลัง" transaction commit
//
// แยกสามกลุ่มเพราะอยู่คนละที่และลบด้วยวิธีต่างกัน
type erasureFiles struct {
	photos   []string // ตาราง photos → โฟลเดอร์ uploads/faces
	uploads  []string // รูปโปรไฟล์ ฯลฯ → โฟลเดอร์ uploads
	faceKeys []string // ตาราง face_images → Cloudinary
}

func (f *erasureFiles) merge(other erasureFiles) {
	f.photos = append(f.photos, other.photos...)
	f.uploads = append(f.uploads, other.uploads...)
	f.faceKeys = append(f.faceKeys, other.faceKeys...)
}

// endFaceConsent บันทึกว่าความยินยอมสิ้นสุดเพราะบัญชีถูกลบ
//
// ⚠️ ก่อนหน้านี้เส้นทางลบบัญชีลบรูปใบหน้าแต่ไม่เขียนอะไรลง biometric_consents
// ประวัติจึงค้างที่ "granted" ตลอดไป = เอกสารบอกว่ายังยินยอมอยู่ทั้งที่ข้อมูลถูกลบแล้ว
// และไม่มีบันทึกว่าข้อมูลชีวภาพถูกทำลายเมื่อไหร่
//
// เขียนเฉพาะคนที่กำลังยินยอมอยู่ คนที่ไม่เคยให้จะได้ไม่มีแถว withdrawn ที่ไม่ตรงความจริง
func endFaceConsent(tx *gorm.DB, subject *consentSubject, actorUserID uint) error {
	if subject.Status != models.FaceConsentGranted {
		return nil
	}
	return writeConsentTx(tx, subject, actorUserID, models.ConsentWithdrawn, ConsentMeta{})
}

// scrubCoachPII ล้างข้อมูลส่วนตัวของโค้ชที่ไม่ได้ใช้ต่อหลังลบบัญชี
//
// เก็บไว้: nickname + ชื่อ-นามสกุล (รายงานการเงินต้องหาชื่อเจ้าของเงิน),
// bank_account (expenses ไม่ได้เก็บเลขบัญชีเอง อ้างจากตารางนี้ทางเดียว),
// member_code (index คุม WHERE member_code <> ” นับแถวที่ลบแล้วด้วย ล้างแล้วรหัสจะถูกออกซ้ำ),
// payment_type/pay_rate (ComputeCoachPayroll ยังอ่านตอนคิดย้อนหลัง)
func scrubCoachPII(tx *gorm.DB, coachID uint) error {
	return tx.Model(&models.Coach{}).Where("id = ?", coachID).
		Updates(map[string]interface{}{
			"uid":             "", // เลขบัตรประชาชน
			"address":         "",
			"phone":           "",
			"line_id":         "",
			"facebook":        "",
			"profile_picture": "",
			"home_image":      "",
			"bio":             "",
			"specialization":  "",
			"coach_license":   "",
			"payment_info":    "",
			"prompt_pay":      "",
			"feature_on_home": false,
			// ลบแล้วต้องไม่ค้างเป็นหัวหน้าโค้ช ไม่งั้นตำแหน่งจะว่างโดยไม่มีใครรู้
			// และตั้งคนใหม่ได้แต่ของเก่ายังถือธงอยู่ในฐาน
			"is_head_coach": false,

			// birth_date เป็นคอลัมน์ date — ใส่ "" แล้ว postgres ฟ้อง invalid input syntax
			"birth_date": gorm.Expr("NULL"),

			// ⚠️ personal_qr_code เป็น unique ธรรมดา ไม่ใช่ partial index แบบ uid/email
			// ล้างเป็น "" แล้วลบคนที่สองจะชนทันที ต้องเป็น NULL
			"personal_qr_code": gorm.Expr("NULL"),
		}).Error
}

// scrubCustomerPII ล้างข้อมูลส่วนตัวของผู้เรียน เหตุผลเดียวกับฝั่งโค้ช
//
// gender ต้องเป็น NULL ไม่ใช่ "" เพราะมี CHECK บังคับให้เป็น male/female เท่านั้น
// (NULL ผ่าน CHECK ได้ ค่าว่างไม่ผ่าน)
func scrubCustomerPII(tx *gorm.DB, customerID uint) error {
	return tx.Model(&models.Customer{}).Where("id = ?", customerID).
		Updates(map[string]interface{}{
			"phone_number":        "",
			"line_id":             "",
			"facebook":            "",
			"profile_picture":     "",
			"parent_email":        "",
			"parent_phone_number": "",

			"birth_date":       gorm.Expr("NULL"),
			"gender":           gorm.Expr("NULL"),
			"personal_qr_code": gorm.Expr("NULL"),
		}).Error
}

// scrubUserPII ล้างอีเมลกับรหัสผ่าน และไล่ token ที่ยังถืออยู่ออกจากระบบ
//
// เก็บชื่อ-นามสกุลไว้เพราะเป็นตัวที่รายงานย้อนหลังใช้อ้างถึงคน
func scrubUserPII(tx *gorm.DB, userID uint) error {
	return tx.Model(&models.User{}).Where("id = ?", userID).
		Updates(map[string]interface{}{
			"email":    "",
			"password": "",

			// บวกเลขรุ่น = token ที่ออกไปแล้วใช้ไม่ได้ทันที ไม่ต้องรอหมดอายุ
			"token_version": gorm.Expr("token_version + 1"),
		}).Error
}

// uploadFilePath แปลง URL ของไฟล์ที่อัปโหลดในระบบเป็นพาธบนดิสก์
//
// คืนค่าว่างถ้าไม่ใช่ไฟล์ในเครื่อง (เช่นอยู่บน Cloudinary ซึ่งต้องลบผ่าน API)
//
// ⚠️ Clean บนพาธที่ขึ้นต้นด้วย "/" resolve ../ ทิ้งทั้งหมด กันค่าในฐานที่ใส่ ../../
// มาสั่งลบไฟล์นอกโฟลเดอร์ uploads (วิธีเดียวกับ loadSlipImage)
func uploadFilePath(fileURL string) string {
	_, relative, found := strings.Cut(strings.TrimSpace(fileURL), "/uploads/")
	if !found {
		return ""
	}

	// ⚠️ ใช้ path.Clean ไม่ใช่ filepath.Clean — ค่าที่รับมาเป็น URL ซึ่งใช้ "/" เสมอ
	// ส่วน filepath บนวินโดวส์คืน "\\" ทำให้เทียบกับ "/" ไม่ตรงแล้วหลุดเงื่อนไขไป
	// แปลง "\\" เป็น "/" ก่อน เผื่อค่าในฐานใส่ ..\..\ มาแบบวินโดวส์
	relative = path.Clean("/" + strings.ReplaceAll(relative, "\\", "/"))
	if relative == "/" {
		return ""
	}
	return filepath.Join("uploads", filepath.FromSlash(relative))
}

// removeUploadedFiles ลบไฟล์ที่อัปโหลดไว้ในเครื่อง — ต้องเรียกหลัง commit เท่านั้น
//
// ไม่คืน error ด้วยเหตุผลเดียวกับ RemovePhotoFiles แต่ต้อง log เสมอ
func removeUploadedFiles(fileURLs []string) {
	for _, url := range fileURLs {
		path := uploadFilePath(url)
		if path == "" {
			continue
		}
		if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
			log.Printf("[PDPA] ลบไฟล์ %s ไม่สำเร็จ: %v — ต้องตามลบด้วยมือ", path, err)
		}
	}
}
