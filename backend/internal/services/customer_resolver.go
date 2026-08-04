package services

import (
	"errors"

	"CPE-691015/internal/models"
	"gorm.io/gorm"
)

// ─────────────────────────────────────────────────────────────────────────────
// ตัวแปลงระหว่าง users.id กับ customers.id
//
// ระบบมี "ลูกค้า" สองความหมาย:
//   - ตาราง billings, invoices, student_attendances       → อ้าง users.id
//   - ตาราง enrollments, photos, biometric_consents ฯลฯ   → อ้าง customers.id
//
// ข้อตกลง: API ทุกเส้นรับ-ส่ง users.id เสมอ (ตรงกับ claim user_id ใน JWT)
// การแปลงเป็น customers.id ทำที่ชั้น service เท่านั้น ผ่านฟังก์ชันสองตัวนี้
//
// ⚠️ ห้ามส่ง customers.id เข้า controllers.CheckIDOR เด็ดขาด — จะกลายเป็นช่องโหว่ IDOR ทันที
// ─────────────────────────────────────────────────────────────────────────────

var (
	ErrCustomerProfileNotFound = errors.New("ไม่พบโปรไฟล์ลูกค้าของผู้ใช้งานนี้")
	ErrCustomerNotFound        = errors.New("ไม่พบข้อมูลลูกค้า")
)

// ResolveCustomerID แปลง users.id → customers.id
func ResolveCustomerID(db *gorm.DB, userID uint) (uint, error) {
	var customer models.Customer
	if err := db.Where("user_id = ?", userID).First(&customer).Error; err != nil {
		return 0, ErrCustomerProfileNotFound
	}
	return customer.ID, nil
}

// ResolveUserID แปลง customers.id → users.id
func ResolveUserID(db *gorm.DB, customerID uint) (uint, error) {
	var customer models.Customer
	if err := db.First(&customer, customerID).Error; err != nil {
		return 0, ErrCustomerNotFound
	}
	return customer.UserID, nil
}
