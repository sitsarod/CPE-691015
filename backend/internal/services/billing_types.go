package services

import (
	"errors"
	"fmt"

	"CPE-691015/internal/models"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ชื่อประเภทบิลที่โค้ดอ้างถึงตรง ๆ — ต้องตรงกับแถวใน billing_types เสมอ
const (
	billingTypeCourseFee = "ค่าคอร์สเรียน"
	billingTypeCourtFee  = "ค่าเช่าสนาม"
)

// id ตรงกับรายการที่หน้าออกบิลของแอดมินใช้อยู่ (BILLING_TYPES ใน BillingIssueForm.tsx)
var defaultBillingTypes = []models.BillingType{
	{Model: gorm.Model{ID: 1}, BillingTypeName: billingTypeCourseFee},
	{Model: gorm.Model{ID: 2}, BillingTypeName: billingTypeCourtFee},
	{Model: gorm.Model{ID: 3}, BillingTypeName: "ค่าอุปกรณ์"},
	{Model: gorm.Model{ID: 4}, BillingTypeName: "ค่าพาไปแข่งขัน"},
	{Model: gorm.Model{ID: 5}, BillingTypeName: "อื่นๆ"},
}

// EnsureBillingTypes เติมประเภทบิลมาตรฐานที่ยังไม่มีในฐาน (รันซ้ำได้ ไม่แตะแถวเดิม)
func EnsureBillingTypes(db *gorm.DB) error {
	if err := db.Exec(`
		CREATE UNIQUE INDEX IF NOT EXISTS uniq_billing_types_name_active
		ON billing_types (billing_type_name) WHERE deleted_at IS NULL
	`).Error; err != nil {
		return fmt.Errorf("สร้าง index กันประเภทบิลซ้ำไม่สำเร็จ: %w", err)
	}

	for _, bt := range defaultBillingTypes {
		var existing int64
		if err := db.Model(&models.BillingType{}).
			Where("billing_type_name = ?", bt.BillingTypeName).
			Count(&existing).Error; err != nil {
			return fmt.Errorf("ตรวจสอบประเภทบิลไม่สำเร็จ: %w", err)
		}
		if existing > 0 {
			continue
		}
		// id ที่ตั้งไว้อาจถูกแถวอื่นใช้ไปแล้ว ปล่อยให้ฐานออกเลขใหม่แทนการล้มทั้งขั้นตอน
		row := bt
		if err := db.Clauses(clause.OnConflict{DoNothing: true}).Create(&row).Error; err != nil {
			row = models.BillingType{BillingTypeName: bt.BillingTypeName}
			if err := db.Create(&row).Error; err != nil {
				return fmt.Errorf("สร้างประเภทบิล %q ไม่สำเร็จ: %w", bt.BillingTypeName, err)
			}
		}
	}

	// การใส่ id เองไม่เลื่อน sequence ให้ ถ้าไม่ดันไปไว้หลังเลขสูงสุด
	// แถวถัดไปที่สร้างแบบไม่ระบุ id จะได้เลขที่ถูกใช้ไปแล้วแล้วชนกัน
	if err := db.Exec(`
		SELECT setval(pg_get_serial_sequence('billing_types', 'id'),
		              (SELECT COALESCE(MAX(id), 1) FROM billing_types))
	`).Error; err != nil {
		return fmt.Errorf("ปรับลำดับเลข id ของประเภทบิลไม่สำเร็จ: %w", err)
	}
	return nil
}

// billingTypeIDByName หาประเภทบิลตามชื่อ ถ้ายังไม่มีในฐานให้สร้างให้ทันที
// (กันไม่ให้การออกบิลพังทั้งใบเพียงเพราะยังไม่ได้รัน migrate)
func billingTypeIDByName(tx *gorm.DB, name string) (uint, error) {
	var bt models.BillingType
	err := tx.Where("billing_type_name = ?", name).First(&bt).Error
	if err == nil {
		return bt.ID, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return 0, fmt.Errorf("อ่านประเภทบิล %q ไม่สำเร็จ", name)
	}

	bt = models.BillingType{BillingTypeName: name}
	if err := tx.Create(&bt).Error; err != nil {
		// ชนกับคำขออื่นที่เพิ่งสร้างชื่อเดียวกัน — อ่านซ้ำแล้วใช้แถวนั้น
		if err := tx.Where("billing_type_name = ?", name).First(&bt).Error; err != nil {
			return 0, fmt.Errorf("สร้างประเภทบิล %q ไม่สำเร็จ", name)
		}
	}
	return bt.ID, nil
}
