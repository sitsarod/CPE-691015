package services

import (
	"errors"
	"time"

	"CPE-691015/internal/models"
	"gorm.io/gorm"
)

const carryOverWindowDays = 90

func carryOverShare(remaining uint) uint {
	return (remaining + 1) / 2
}

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

	row := models.SessionCarryOver{
		CustomerID:       e.CustomerID,
		FromEnrollmentID: e.ID,
		Sessions:         sessions,
		ExpiresAt:        expiresAt,
		CreatedByUserID:  adminUserID,
	}
	if err := tx.Create(&row).Error; err != nil {
		return nil, errors.New("ไม่สามารถบันทึกครั้งที่ค้างไว้เพื่อทบคอร์สถัดไปได้")
	}
	return &row, nil
}

func consumeCarryOver(tx *gorm.DB, e *models.Enrollment) (uint, error) {
	var prior int64
	if err := tx.Model(&models.SessionCarryOver{}).
		Where("consumed_by_enrollment_id = ?", e.ID).
		Count(&prior).Error; err != nil {
		return 0, errors.New("ไม่สามารถตรวจสอบยอดที่ทบเข้าคอร์สนี้ได้")
	}
	if prior > 0 {
		return 0, nil
	}

	now := time.Now()

	claim := tx.Model(&models.SessionCarryOver{}).
		Where("customer_id = ? AND consumed_by_enrollment_id IS NULL", e.CustomerID).
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
	return total.Sum, nil
}
