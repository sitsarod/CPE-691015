package services

import (
	"fmt"
	"log"

	"gorm.io/gorm"
)

// EnsureCarryOverCourseScope เติมคอร์สให้แถวทบครั้งคงเหลือรุ่นเก่า แล้วสร้าง index ให้
func EnsureCarryOverCourseScope(db *gorm.DB) error {
	// ไม่กรอง deleted_at ของ packages โดยตั้งใจ (หลักเดียวกับ enrollmentCourseID)
	res := db.Exec(`
		UPDATE session_carry_overs AS sco
		SET course_id = p.course_id
		FROM enrollments AS e
		JOIN packages AS p ON p.id = e.package_id
		WHERE e.id = sco.from_enrollment_id
		  AND COALESCE(sco.course_id, 0) = 0
		  AND COALESCE(p.course_id, 0) <> 0
	`)
	if res.Error != nil {
		return fmt.Errorf("เติมคอร์สให้แถวทบครั้งคงเหลือไม่สำเร็จ: %w", res.Error)
	}
	if res.RowsAffected > 0 {
		log.Printf("[carryover] เติม course_id ย้อนหลังให้แถวทบครั้งคงเหลือ %d แถว", res.RowsAffected)
	}

	// คอลัมน์เป็น nullable แต่ models.SessionCarryOver.CourseID เป็น uint ธรรมดา
	// แถวที่เหลือ NULL จะทำให้การ Find เข้า struct พังทันที ต้องปิดให้เป็น 0
	if err := db.Exec(`
		UPDATE session_carry_overs SET course_id = 0 WHERE course_id IS NULL
	`).Error; err != nil {
		return fmt.Errorf("ปิดค่า course_id ที่ยังว่างไม่สำเร็จ: %w", err)
	}

	// แถวที่ถูกใช้ไปแล้วไม่ต้องฟ้อง — ครั้งถูกบวกเข้าใบปลายทางไปเรียบร้อยแล้ว
	type orphanRow struct {
		ID         uint
		CustomerID uint
		Sessions   uint
	}
	var orphans []orphanRow
	if err := db.Raw(`
		SELECT id, customer_id, sessions
		FROM session_carry_overs
		WHERE deleted_at IS NULL
		  AND course_id = 0
		  AND consumed_by_enrollment_id IS NULL
		ORDER BY id
	`).Scan(&orphans).Error; err != nil {
		return fmt.Errorf("ตรวจแถวทบครั้งคงเหลือที่ไม่รู้คอร์สไม่สำเร็จ: %w", err)
	}

	if len(orphans) > 0 {
		for _, o := range orphans {
			log.Printf("[carryover] ⚠️ แถว #%d: ลูกค้า #%d ทบไว้ %d ครั้ง แต่ระบุคอร์สไม่ได้",
				o.ID, o.CustomerID, o.Sessions)
		}
		log.Printf("[carryover] ⚠️ มีครั้งที่ทบไว้ %d แถวที่ระบุคอร์สไม่ได้ (แพ็กเกจต้นทางถูกลบ) — "+
			"แถวพวกนี้จะไม่ถูกนำไปใช้ ต้องเติม course_id ด้วยมือหรือตกลงกับลูกค้าใหม่", len(orphans))
	}

	return db.Exec(`
		CREATE INDEX IF NOT EXISTS idx_carry_over_claimable
		ON session_carry_overs (customer_id, course_id, expires_at)
		WHERE deleted_at IS NULL AND consumed_by_enrollment_id IS NULL
	`).Error
}
