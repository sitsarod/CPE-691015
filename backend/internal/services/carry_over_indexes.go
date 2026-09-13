package services

import (
	"fmt"
	"log"
	"time"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
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

	if err := db.Exec(`
		CREATE INDEX IF NOT EXISTS idx_carry_over_claimable
		ON session_carry_overs (customer_id, course_id, expires_at)
		WHERE deleted_at IS NULL AND consumed_by_enrollment_id IS NULL
	`).Error; err != nil {
		return err
	}

	// ข้อมูลเก่าจากระบบขยายด้วยมืออาจทบซ้ำไว้แล้ว ถ้าสร้าง index ทับจะทำให้ migrate ล้มทั้งก้อน
	var dupes []struct {
		FromEnrollmentID uint
		RowCount         int
	}
	if err := db.Model(&models.SessionCarryOver{}).
		Select("from_enrollment_id, COUNT(*) AS row_count").
		Group("from_enrollment_id").
		Having("COUNT(*) > 1").
		Scan(&dupes).Error; err != nil {
		return fmt.Errorf("ตรวจหาใบที่ถูกทบซ้ำไม่สำเร็จ: %w", err)
	}
	if len(dupes) > 0 {
		for _, d := range dupes {
			log.Printf("[carryover] ⚠️ ใบลงทะเบียน #%d ถูกทบซ้ำ %d แถว", d.FromEnrollmentID, d.RowCount)
		}
		log.Printf("[carryover] ⚠️ ข้ามการสร้าง uniq_carry_over_from_enrollment เพราะมีใบที่ถูกทบซ้ำ %d ใบ — "+
			"ลบแถวที่เกินด้วยมือแล้วรัน migrate ใหม่", len(dupes))
		return nil
	}

	// หนึ่งใบทบได้ครั้งเดียว — ด่านสุดท้ายกันสองคำขอที่พลิกสถานะพร้อมกันแล้วทบซ้ำ
	return db.Exec(`
		CREATE UNIQUE INDEX IF NOT EXISTS uniq_carry_over_from_enrollment
		ON session_carry_overs (from_enrollment_id)
		WHERE deleted_at IS NULL
	`).Error
}

// BackfillCarryOverIntoRenewals ย้ายยอดทบที่ยังรออยู่เข้าใบที่สมัครต่อซึ่งเปิดสิทธิ์ไปแล้วก่อนเปลี่ยนมาบวกให้ทันที
func BackfillCarryOverIntoRenewals(db *gorm.DB) error {
	var pending []models.SessionCarryOver
	if err := db.
		Where("consumed_by_enrollment_id IS NULL AND course_id <> 0 AND expires_at > ?", time.Now()).
		Find(&pending).Error; err != nil {
		return fmt.Errorf("หายอดทบที่ยังรออยู่ไม่สำเร็จ: %w", err)
	}

	moved := 0
	for i := range pending {
		row := &pending[i]
		err := db.Transaction(func(tx *gorm.DB) error {
			var from models.Enrollment
			if err := tx.Unscoped().First(&from, row.FromEnrollmentID).Error; err != nil {
				return fmt.Errorf("ไม่พบใบต้นทาง #%d: %w", row.FromEnrollmentID, err)
			}

			renewal, err := activeRenewalEnrollment(tx, &from, row.CourseID)
			if err != nil || renewal == nil {
				return err
			}
			if err := applyCarryOverTo(tx, row, renewal); err != nil {
				return err
			}
			moved++
			return nil
		})
		if err != nil {
			log.Printf("[carryover] ยอดทบแถว #%d: ย้ายเข้าใบที่สมัครต่อไม่สำเร็จ: %v", row.ID, err)
		}
	}
	if moved > 0 {
		log.Printf("[carryover] ย้ายยอดทบเก่าเข้าใบที่สมัครต่อ %d แถว", moved)
	}
	return nil
}

// BackfillExpiredCarryOver ทบย้อนหลังให้ใบที่หมดอายุไปแล้วแต่ยังไม่เคยถูกทบ
//
// จำกัดไว้เฉพาะใบที่ยังอยู่ในช่วงผ่อนผันเดิม (แอดมินยังกดขยายให้ได้อยู่ก่อนเปลี่ยนมาทบเอง)
// ใบที่หมดอายุนานกว่านั้นไม่แตะ เพราะการแจกครั้งคืนย้อนหลังคือการแจกของที่ไม่มีใครอนุมัติ
func BackfillExpiredCarryOver(db *gorm.DB) error {
	cutoff := time.Now().AddDate(0, 0, -dto.GracePeriodDays)

	var due []models.Enrollment
	if err := db.
		Where("status = ? AND remaining_sessions > 1 AND expires_at > ?",
			models.EnrollmentStatusExpired, cutoff).
		Where("id NOT IN (?)",
			db.Unscoped().Model(&models.SessionCarryOver{}).Select("from_enrollment_id")).
		Find(&due).Error; err != nil {
		return fmt.Errorf("หาใบที่ยังไม่ถูกทบไม่สำเร็จ: %w", err)
	}

	for i := range due {
		if err := db.Transaction(func(tx *gorm.DB) error {
			return autoCarryOver(tx, &due[i])
		}); err != nil {
			log.Printf("[carryover] ใบลงทะเบียน #%d: ทบย้อนหลังไม่สำเร็จ: %v", due[i].ID, err)
		}
	}
	if len(due) > 0 {
		log.Printf("[carryover] ทบย้อนหลังให้ใบที่หมดอายุในช่วงผ่อนผัน %d ใบ", len(due))
	}
	return nil
}
