package services

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
	"gorm.io/gorm"
)

var (
	ErrExtensionNotStarted = errors.New("ไม่สามารถขยายสิทธิ์ได้ เนื่องจากการลงทะเบียนนี้ยังไม่เริ่มเรียน")
	ErrExtensionReasonReq  = errors.New("กรุณาระบุเหตุผลในการขยายสิทธิ์")
	ErrExtensionCancelled  = errors.New("ไม่สามารถขยายสิทธิ์ให้การลงทะเบียนที่ถูกยกเลิกได้")
	ErrExtensionNoSessions = errors.New("ใบลงทะเบียนนี้ไม่มีครั้งคงเหลือให้ทบไปคอร์สถัดไป")

	ErrExtensionNotExpired  = errors.New("ขยายสิทธิ์ได้เฉพาะใบที่หมดอายุแล้ว — ใบนี้ยังเรียนได้ตามปกติ")
	ErrExtensionAlreadyDone = errors.New("ใบลงทะเบียนนี้ถูกขยายสิทธิ์ไปแล้ว ทบซ้ำอีกไม่ได้")

	ErrExtensionGraceOver = fmt.Errorf(
		"เลยช่วงผ่อนผัน %d วันหลังหมดอายุแล้ว จึงขยายสิทธิ์ให้ไม่ได้", dto.GracePeriodDays)
)

func (s *EnrollmentService) ExtendEnrollment(
	enrollmentID uint,
	adminUserID uint,
	req dto.ExtendEnrollmentReq,
) (*dto.ExtendEnrollmentRes, error) {
	reason := strings.TrimSpace(req.Reason)
	if reason == "" {
		return nil, ErrExtensionReasonReq
	}

	var result dto.ExtendEnrollmentRes

	err := s.db.Transaction(func(tx *gorm.DB) error {
		expireStaleEnrollments(tx)

		now := time.Now()

		var enrollment models.Enrollment
		if err := tx.First(&enrollment, enrollmentID).Error; err != nil {
			return ErrEnrollmentNotFound
		}

		if enrollment.Status == models.EnrollmentStatusCancelled {
			return ErrExtensionCancelled
		}

		if enrollment.ExpiresAt == nil {
			return ErrExtensionNotStarted
		}

		if now.Before(*enrollment.ExpiresAt) {
			return ErrExtensionNotExpired
		}

		if enrollment.Status != models.EnrollmentStatusExpired {
			return ErrExtensionNotExpired
		}

		previousRemaining := enrollment.RemainingSessions
		if previousRemaining == 0 {
			return ErrExtensionNoSessions
		}

		if now.After(enrollment.ExpiresAt.AddDate(0, 0, dto.GracePeriodDays)) {
			return ErrExtensionGraceOver
		}

		var alreadyGranted int64
		if err := tx.Model(&models.SessionCarryOver{}).
			Where("from_enrollment_id = ?", enrollment.ID).
			Count(&alreadyGranted).Error; err != nil {
			return errors.New("ไม่สามารถตรวจสอบประวัติการขยายสิทธิ์ได้")
		}
		if alreadyGranted > 0 {
			return ErrExtensionAlreadyDone
		}

		carriedOver := carryOverShare(previousRemaining)
		forfeited := previousRemaining - carriedOver

		deadline := now.AddDate(0, 0, carryOverWindowDays)
		if _, err := bankCarryOver(tx, &enrollment, carriedOver, deadline, adminUserID); err != nil {
			return err
		}

		record := models.EnrollmentExtension{
			EnrollmentID:      enrollment.ID,
			Reason:            reason,
			PreviousExpiresAt: enrollment.ExpiresAt,
			NewExpiresAt:      enrollment.ExpiresAt,

			PreviousTotalSessions: enrollment.TotalSessions,
			NewTotalSessions:      enrollment.TotalSessions,

			PreviousRemainingSessions: previousRemaining,
			NewRemainingSessions:      previousRemaining,
			CarriedOverSessions:       carriedOver,
			ForfeitedSessions:         forfeited,
			CarryOverExpiresAt:        &deadline,

			ExtendedByUserID: adminUserID,
		}
		if err := tx.Create(&record).Error; err != nil {
			return errors.New("ไม่สามารถบันทึกประวัติการขยายสิทธิ์ได้")
		}

		result = dto.ExtendEnrollmentRes{
			EnrollmentID:        enrollment.ID,
			Status:              string(enrollment.Status),
			ExpiresAt:           enrollment.ExpiresAt,
			DaysLeft:            dto.DaysLeft(enrollment.ExpiresAt),
			TotalSessions:       enrollment.TotalSessions,
			RemainingSessions:   previousRemaining,
			CarriedOverSessions: carriedOver,
			ForfeitedSessions:   forfeited,
			CarryOverExpiresAt:  &deadline,
			Extension:           dto.ToEnrollmentExtensionDTO(&record),
		}
		return nil
	})

	if err != nil {
		return nil, err
	}
	return &result, nil
}

func (s *EnrollmentService) GetEnrollmentExtensions(enrollmentID uint) ([]dto.EnrollmentExtensionDTO, error) {
	var items []models.EnrollmentExtension
	if err := s.db.
		Where("enrollment_id = ?", enrollmentID).
		Order("created_at DESC, id DESC").
		Find(&items).Error; err != nil {
		return nil, errors.New("ไม่สามารถดึงประวัติการขยายเวลาได้")
	}
	return dto.ToEnrollmentExtensionDTOs(items), nil
}
