package services

import (
	"fmt"
	"log"

	"gorm.io/gorm"
)

// EnsureEnrollmentUniqueIndexes กันสมัครแพ็กเกจเดิมซ้ำซ้อน
//
// ⚠️ การนับก่อนเขียนใน EnrollCourse กันไม่ได้ แม้จะอยู่ในทรานแซกชัน — Postgres
// ระดับ READ COMMITTED ให้ COUNT เห็นเฉพาะแถวที่ commit แล้ว สองคำขอที่คาบเกี่ยว
// กันจึงนับเจอ 0 ได้ทั้งคู่ ต้องให้ฐานข้อมูลเป็นคนตัดสินว่าใครชนะ
//
// เงื่อนไขของ index ครอบเฉพาะสถานะที่ยังกินที่นั่ง — ใบที่หมดอายุหรือถูกยกเลิก
// ไม่กันการสมัครใหม่
func EnsureEnrollmentUniqueIndexes(db *gorm.DB) error {
	type duplicate struct {
		CustomerID uint
		PackageID  uint
		Total      int64
	}

	var dups []duplicate
	if err := db.Raw(`
		SELECT customer_id, package_id, COUNT(*) AS total
		FROM enrollments
		WHERE deleted_at IS NULL
		  AND status IN ('pending', 'awaiting_payment', 'active')
		GROUP BY customer_id, package_id
		HAVING COUNT(*) > 1
		ORDER BY customer_id, package_id
	`).Scan(&dups).Error; err != nil {
		return fmt.Errorf("ตรวจหาใบลงทะเบียนซ้ำไม่สำเร็จ: %w", err)
	}

	// ฟ้องให้ครบว่าใบไหนซ้ำ แล้วหยุด — ห้ามลบใบลงทะเบียนให้อัตโนมัติเด็ดขาด
	// เพราะแต่ละใบผูกกับบิลและประวัติการเรียน ต้องให้คนตัดสินว่าจะเก็บใบไหน
	if len(dups) > 0 {
		for _, d := range dups {
			log.Printf("[enrollment] ใบลงทะเบียนซ้ำ: ลูกค้า #%d แพ็กเกจ #%d จำนวน %d ใบ",
				d.CustomerID, d.PackageID, d.Total)
		}
		return fmt.Errorf(
			"มีใบลงทะเบียนซ้ำอยู่ %d คู่ (รายการด้านบน) ต้องยกเลิกใบส่วนเกินก่อน จึงจะสร้าง index กันซ้ำได้",
			len(dups))
	}

	return db.Exec(`
		CREATE UNIQUE INDEX IF NOT EXISTS uniq_enrollment_customer_package
		ON enrollments (customer_id, package_id)
		WHERE deleted_at IS NULL
		  AND status IN ('pending', 'awaiting_payment', 'active')
	`).Error
}
