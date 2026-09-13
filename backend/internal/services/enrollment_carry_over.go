package services

import (
	"errors"
	"fmt"
	"log"
	"time"

	"CPE-691015/internal/models"
	"gorm.io/gorm"
)

const carryOverWindowDays = 90

// ErrCarryOverCourseUnknown = ตามกลับไปหาคอร์สของใบลงทะเบียนไม่ได้ (แพ็กเกจถูกลบ)
var ErrCarryOverCourseUnknown = errors.New("ไม่พบคอร์สของใบลงทะเบียนนี้ (แพ็กเกจอาจถูกลบไปแล้ว) จึงทบครั้งคงเหลือให้ไม่ได้")

// carryOverShare = ครึ่งหนึ่งของครั้งคงเหลือ ปัดตก · เหลือ 1 ครั้งจึงทบไม่ได้เลย
func carryOverShare(remaining uint) uint {
	return remaining / 2
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

// systemUserID = ผู้สั่งของงานที่ไม่มีมนุษย์กด · แยกจากแอดมินตัวจริงที่ id เริ่มที่ 1
const systemUserID = 0

// autoCarryOver ทบครั้งคงเหลือให้คอร์สเดิมทันทีที่ใบหมดอายุ ต้องเรียกภายใน transaction
//
// หาคอร์สไม่เจอ (แพ็กเกจถูกลบ) ข้ามไปเฉย ๆ ไม่คืน error — ลองใหม่กี่รอบก็ไม่หาย
// ถ้าคืน error ใบนี้จะถูกถอยกลับเป็น active ค้างไปตลอด
func autoCarryOver(tx *gorm.DB, e *models.Enrollment) error {
	carried := carryOverShare(e.RemainingSessions)
	if carried == 0 {
		return nil
	}

	var granted int64
	if err := tx.Model(&models.SessionCarryOver{}).
		Where("from_enrollment_id = ?", e.ID).
		Count(&granted).Error; err != nil {
		return err
	}
	if granted > 0 {
		return nil
	}

	deadline := time.Now().AddDate(0, 0, carryOverWindowDays)
	row, err := bankCarryOver(tx, e, carried, deadline, systemUserID)
	if err != nil {
		if errors.Is(err, ErrCarryOverCourseUnknown) {
			log.Printf("[carryover] ใบลงทะเบียน #%d: %v — ข้ามการทบ", e.ID, err)
			return nil
		}
		return err
	}

	reason := "ระบบทบครั้งคงเหลือให้อัตโนมัติเมื่อสิทธิ์หมดอายุ"
	renewal, err := activeRenewalEnrollment(tx, e, row.CourseID)
	if err != nil {
		return err
	}
	if renewal != nil {
		if err := applyCarryOverTo(tx, row, renewal); err != nil {
			return err
		}
		reason = fmt.Sprintf("ระบบทบครั้งคงเหลือเข้าใบที่สมัครต่อ #%d อัตโนมัติ", renewal.ID)
	}

	if err := recordCarryOverHistory(tx, e, carried, deadline, reason); err != nil {
		return err
	}

	log.Printf("[carryover] ใบลงทะเบียน #%d: หมดอายุพร้อมครั้งเหลือ %d — ทบให้ %d ริบ %d",
		e.ID, e.RemainingSessions, carried, e.RemainingSessions-carried)
	return nil
}

// activeRenewalEnrollment หาใบที่สมัครต่อในคอร์สเดียวกันซึ่งเปิดสิทธิ์ไปแล้ว (สร้างหลังใบเดิม) · ไม่มีคืน nil
func activeRenewalEnrollment(tx *gorm.DB, e *models.Enrollment, courseID uint) (*models.Enrollment, error) {
	var found []models.Enrollment
	if err := tx.Model(&models.Enrollment{}).
		Joins("JOIN packages ON packages.id = enrollments.package_id").
		Where("enrollments.customer_id = ? AND enrollments.status = ? AND enrollments.id <> ?",
			e.CustomerID, models.EnrollmentStatusActive, e.ID).
		Where("enrollments.created_at > ? AND enrollments.expires_at >= ?",
			e.CreatedAt, startOfLocalDay(nowLocal())).
		Where("packages.course_id = ?", courseID).
		Order("enrollments.created_at ASC").
		Limit(1).
		Find(&found).Error; err != nil {
		return nil, errors.New("ไม่สามารถค้นหาใบที่สมัครต่อได้")
	}
	if len(found) == 0 {
		return nil, nil
	}
	return &found[0], nil
}

// applyCarryOverTo บวกยอดที่ทบเข้าใบที่สมัครต่อทันที และปิดยอดนั้นว่าถูกใช้แล้ว
func applyCarryOverTo(tx *gorm.DB, row *models.SessionCarryOver, target *models.Enrollment) error {
	claim := tx.Model(&models.SessionCarryOver{}).
		Where("id = ? AND consumed_by_enrollment_id IS NULL", row.ID).
		Updates(map[string]any{
			"consumed_by_enrollment_id": target.ID,
			"consumed_at":               time.Now(),
		})
	if claim.Error != nil {
		return errors.New("ไม่สามารถบันทึกการทบครั้งเข้าใบที่สมัครต่อได้")
	}
	if claim.RowsAffected == 0 {
		return nil
	}

	// เช็กสถานะซ้ำตอนบวก — ใบอาจเรียนครบไปหลังจากที่อ่านมา ถ้าบวกเข้าใบ completed ครั้งจะหายไปเฉย ๆ
	res := tx.Model(&models.Enrollment{}).
		Where("id = ? AND status = ?", target.ID, models.EnrollmentStatusActive).
		Updates(map[string]any{
			"total_sessions":     gorm.Expr("total_sessions + ?", row.Sessions),
			"remaining_sessions": gorm.Expr("remaining_sessions + ?", row.Sessions),
		})
	if res.Error != nil {
		return errors.New("ไม่สามารถบวกครั้งที่ทบเข้าใบที่สมัครต่อได้")
	}
	if res.RowsAffected == 0 {
		return fmt.Errorf("ใบที่สมัครต่อ #%d ไม่ได้อยู่ในสถานะกำลังเรียนแล้ว", target.ID)
	}

	log.Printf("[carryover] ใบลงทะเบียน #%d: บวก %d ครั้งที่ทบจากใบ #%d เข้าทันที",
		target.ID, row.Sessions, row.FromEnrollmentID)
	return nil
}

// recordCarryOverHistory เก็บบันทึกว่าใบนี้ทบไปกี่ครั้ง ริบไปกี่ครั้ง ให้แอดมินย้อนดูได้
func recordCarryOverHistory(tx *gorm.DB, e *models.Enrollment, carried uint, deadline time.Time, reason string) error {
	record := models.EnrollmentExtension{
		EnrollmentID: e.ID,
		Reason:       reason,

		PreviousExpiresAt: e.ExpiresAt,
		NewExpiresAt:      e.ExpiresAt,

		PreviousTotalSessions: e.TotalSessions,
		NewTotalSessions:      e.TotalSessions,

		PreviousRemainingSessions: e.RemainingSessions,
		NewRemainingSessions:      e.RemainingSessions,
		CarriedOverSessions:       carried,
		ForfeitedSessions:         e.RemainingSessions - carried,
		CarryOverExpiresAt:        &deadline,

		ExtendedByUserID: systemUserID,
	}
	if err := tx.Create(&record).Error; err != nil {
		return errors.New("ไม่สามารถบันทึกประวัติการทบครั้งคงเหลือได้")
	}
	return nil
}

// carriedOverSessions คืนจำนวนครั้งที่ทบไว้จากแต่ละใบ เฉพาะที่ยังไม่ถูกใช้และยังไม่หมดอายุ
func carriedOverSessions(db *gorm.DB, enrollmentIDs []uint) (map[uint]uint, error) {
	out := map[uint]uint{}
	if len(enrollmentIDs) == 0 {
		return out, nil
	}

	type carriedRow struct {
		FromEnrollmentID uint
		Sessions         uint
	}
	var rows []carriedRow
	if err := db.Model(&models.SessionCarryOver{}).
		Select("from_enrollment_id, SUM(sessions) AS sessions").
		Where("from_enrollment_id IN ?", enrollmentIDs).
		Where("consumed_by_enrollment_id IS NULL AND expires_at > ?", time.Now()).
		Group("from_enrollment_id").
		Scan(&rows).Error; err != nil {
		return nil, errors.New("ไม่สามารถตรวจสอบประวัติการทบครั้งคงเหลือได้")
	}

	for _, r := range rows {
		out[r.FromEnrollmentID] = r.Sessions
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
