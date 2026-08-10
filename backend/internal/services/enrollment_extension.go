package services

import (
	"errors"
	"strings"
	"time"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
	"gorm.io/gorm"
)

var (
	ErrExtensionNotStarted = errors.New("ไม่สามารถขยายเวลาได้ เนื่องจากการลงทะเบียนนี้ยังไม่เริ่มเรียน (ยังไม่มีวันหมดอายุให้ขยาย)")
	ErrExtensionReasonReq  = errors.New("กรุณาระบุเหตุผลในการขยายเวลา")
	ErrExtensionInvalid    = errors.New("จำนวนวันที่ขยายต้องอยู่ระหว่าง 1 ถึง 366 วัน")
	ErrExtensionCancelled  = errors.New("ไม่สามารถขยายเวลาให้การลงทะเบียนที่ถูกยกเลิกได้")
)

const maxExtendDays = 366

func (s *EnrollmentService) ExtendEnrollment(
	enrollmentID uint,
	adminUserID uint,
	req dto.ExtendEnrollmentReq,
) (*dto.ExtendEnrollmentRes, error) {
	if req.ExtendDays == 0 || req.ExtendDays > maxExtendDays {
		return nil, ErrExtensionInvalid
	}
	reason := strings.TrimSpace(req.Reason)
	if reason == "" {
		return nil, ErrExtensionReasonReq
	}

	var result dto.ExtendEnrollmentRes

	err := s.db.Transaction(func(tx *gorm.DB) error {
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

		previous := *enrollment.ExpiresAt

		base := previous
		now := time.Now()
		if base.Before(now) {
			base = now
		}
		newExpiresAt := base.AddDate(0, 0, int(req.ExtendDays))

		if enrollment.Status == models.EnrollmentStatusExpired {
			var pkg models.Package
			if err := tx.First(&pkg, enrollment.PackageID).Error; err != nil {
				return errors.New("ไม่พบข้อมูลแพ็กเกจของการลงทะเบียนนี้")
			}
			
			expireStaleEnrollments(tx)

			full, err := seatsFull(tx, enrollment.PackageID, pkg.MaxSeats)
			if err != nil {
				return err
			}
			if full {
				return ErrPackageSeatsFull
			}
		}

		updates := map[string]interface{}{"expires_at": newExpiresAt}
		if enrollment.Status == models.EnrollmentStatusExpired {
			updates["status"] = models.EnrollmentStatusActive
		}

		if err := tx.Model(&models.Enrollment{}).
			Where("id = ?", enrollment.ID).
			Updates(updates).Error; err != nil {
			return errors.New("ไม่สามารถขยายระยะเวลาเรียนได้")
		}

		record := models.EnrollmentExtension{
			EnrollmentID:      enrollment.ID,
			ExtendDays:        req.ExtendDays,
			Reason:            reason,
			PreviousExpiresAt: &previous,
			NewExpiresAt:      &newExpiresAt,
			ExtendedByUserID:  adminUserID,
		}
		if err := tx.Create(&record).Error; err != nil {
			return errors.New("ไม่สามารถบันทึกประวัติการขยายเวลาได้")
		}

		status := enrollment.Status
		if enrollment.Status == models.EnrollmentStatusExpired {
			status = models.EnrollmentStatusActive
		}

		result = dto.ExtendEnrollmentRes{
			EnrollmentID: enrollment.ID,
			Status:       string(status),
			ExpiresAt:    &newExpiresAt,
			DaysLeft:     dto.DaysLeft(&newExpiresAt),
			Extension:    dto.ToEnrollmentExtensionDTO(&record),
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
