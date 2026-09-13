package services

import (
	"errors"
	"log"
	"time"

	"CPE-691015/internal/models"
	"gorm.io/gorm"
)

const carryOverWindowDays = 90

// ErrCarryOverCourseUnknown = ตามกลับไปหาคอร์สของใบลงทะเบียนไม่ได้ (แพ็กเกจถูกลบ)
var ErrCarryOverCourseUnknown = errors.New("ไม่พบคอร์สของใบลงทะเบียนนี้ (แพ็กเกจอาจถูกลบไปแล้ว) จึงทบครั้งคงเหลือให้ไม่ได้")

func carryOverShare(remaining uint) uint {
	return (remaining + 1) / 2
}

// enrollmentCourseID หาคอร์สที่ใบลงทะเบียนสังกัด · Unscoped เพราะแพ็กเกจของใบเก่าถูกลบไปแล้วได้
func enrollmentCourseID(tx *gorm.DB, e *models.Enrollment, pkg *models.Package) (uint, error) {
	if pkg != nil && pkg.CourseID != 0 {
		return pkg.CourseID, nil
	}
	if e.Package != nil && e.Package.CourseID != 0 {
		return e.Package.CourseID, nil
	}

	var courseID uint
	res := tx.Unscoped().Model(&models.Package{}).
		Select("course_id").
		Where("id = ?", e.PackageID).
		Scan(&courseID)
	if res.Error != nil {
		return 0, errors.New("ไม่สามารถอ่านคอร์สของใบลงทะเบียนได้")
	}

	if res.RowsAffected == 0 || courseID == 0 {
		return 0, ErrCarryOverCourseUnknown
	}
	return courseID, nil
}

// bankCarryOver ฝากครั้งคงเหลือไว้ให้คอร์สเดิม
func bankCarryOver(
	tx *gorm.DB,
	e *models.Enrollment,
	sessions uint,
	expiresAt time.Time,
	adminUserID uint,
) (*models.SessionCarryOver, error) {
	if sessions == 0 {
		return nil, nil
	}

	courseID, err := enrollmentCourseID(tx, e, nil)
	if err != nil {
		return nil, err
	}

	row := models.SessionCarryOver{
		CustomerID:       e.CustomerID,
		CourseID:         courseID,
		FromEnrollmentID: e.ID,
		Sessions:         sessions,
		ExpiresAt:        expiresAt,
		CreatedByUserID:  adminUserID,
	}
	if err := tx.Create(&row).Error; err != nil {
		return nil, errors.New("ไม่สามารถบันทึกครั้งที่ค้างไว้เพื่อทบให้คอร์สเดิมได้")
	}
	return &row, nil
}

// carriedOverEnrollmentIDs คืนเซ็ตของใบที่ถูกทบครั้งคงเหลือไปแล้ว
func carriedOverEnrollmentIDs(db *gorm.DB, enrollmentIDs []uint) (map[uint]bool, error) {
	out := map[uint]bool{}
	if len(enrollmentIDs) == 0 {
		return out, nil
	}

	var ids []uint
	if err := db.Model(&models.SessionCarryOver{}).
		Where("from_enrollment_id IN ?", enrollmentIDs).
		Distinct("from_enrollment_id").
		Pluck("from_enrollment_id", &ids).Error; err != nil {
		return nil, errors.New("ไม่สามารถตรวจสอบประวัติการทบครั้งคงเหลือได้")
	}

	for _, id := range ids {
		out[id] = true
	}
	return out, nil
}

// consumeCarryOver ดูดครั้งที่ฝากไว้ของคอร์สเดียวกันเข้าใบที่กำลังเปิดสิทธิ์
func consumeCarryOver(tx *gorm.DB, e *models.Enrollment, pkg *models.Package) (uint, error) {
	var prior int64
	if err := tx.Model(&models.SessionCarryOver{}).
		Where("consumed_by_enrollment_id = ?", e.ID).
		Count(&prior).Error; err != nil {
		return 0, errors.New("ไม่สามารถตรวจสอบยอดที่ทบเข้าคอร์สนี้ได้")
	}
	if prior > 0 {
		return 0, nil
	}

	// ต่างจาก bankCarryOver โดยตั้งใจ — ตรงนี้อยู่กลางทางเปิดสิทธิ์เรียน ล้มไม่ได้
	courseID, err := enrollmentCourseID(tx, e, pkg)
	if err != nil {
		if errors.Is(err, ErrCarryOverCourseUnknown) {
			log.Printf("[carryover] ใบลงทะเบียน #%d (แพ็กเกจ #%d): อ่านคอร์สไม่ออก ข้ามการทบครั้งคงเหลือ",
				e.ID, e.PackageID)
			return 0, nil
		}
		return 0, err
	}

	now := time.Now()

	// ⚠️ เงื่อนไข course_id ห้ามถอด — ไม่งั้นครั้งของคอร์สถูกไปโผล่ในคอร์สแพงโดยไม่มีใครอนุมัติ
	claim := tx.Model(&models.SessionCarryOver{}).
		Where("customer_id = ? AND course_id = ? AND consumed_by_enrollment_id IS NULL",
			e.CustomerID, courseID).
		Where("expires_at > ?", now).
		Where("from_enrollment_id <> ?", e.ID).
		Updates(map[string]interface{}{
			"consumed_by_enrollment_id": e.ID,
			"consumed_at":               now,
		})
	if claim.Error != nil {
		return 0, errors.New("ไม่สามารถทบครั้งที่ค้างไว้เข้าคอร์สนี้ได้")
	}
	if claim.RowsAffected == 0 {
		return 0, nil
	}

	var total struct{ Sum uint }
	if err := tx.Model(&models.SessionCarryOver{}).
		Select("COALESCE(SUM(sessions), 0) AS sum").
		Where("consumed_by_enrollment_id = ?", e.ID).
		Scan(&total).Error; err != nil {
		return 0, errors.New("ไม่สามารถอ่านยอดครั้งที่ทบเข้าคอร์สนี้ได้")
	}

	log.Printf("[carryover] ใบลงทะเบียน #%d: ทบ %d ครั้งจากคอร์ส #%d เข้ามา (%d ก้อน)",
		e.ID, total.Sum, courseID, claim.RowsAffected)

	return total.Sum, nil
}
