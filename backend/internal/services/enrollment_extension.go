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
	ErrExtensionInvalid    = errors.New("จำนวนวันที่ขยายต้องไม่เกิน 366 วัน และจำนวนครั้งต้องไม่เกิน 100 ครั้ง")
	ErrExtensionEmpty      = errors.New("กรุณาระบุจำนวนวันหรือจำนวนครั้งที่ต้องการขยาย อย่างน้อยหนึ่งอย่าง")
	ErrExtensionCancelled  = errors.New("ไม่สามารถขยายเวลาให้การลงทะเบียนที่ถูกยกเลิกได้")
)

const (
	maxExtendDays     = 366
	maxExtendSessions = 100
)

func (s *EnrollmentService) ExtendEnrollment(
	enrollmentID uint,
	adminUserID uint,
	req dto.ExtendEnrollmentReq,
) (*dto.ExtendEnrollmentRes, error) {
	if req.ExtendDays > maxExtendDays || req.ExtendSessions > maxExtendSessions {
		return nil, ErrExtensionInvalid
	}

	if req.ExtendDays == 0 && req.ExtendSessions == 0 {
		return nil, ErrExtensionEmpty
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

		newExpiresAt := previous
		if req.ExtendDays > 0 {
			base := previous
			now := time.Now()
			if base.Before(now) {
				base = now
			}
			newExpiresAt = base.AddDate(0, 0, int(req.ExtendDays))
		}

		previousTotal := enrollment.TotalSessions
		newTotal := previousTotal + req.ExtendSessions
		newRemaining := enrollment.RemainingSessions + req.ExtendSessions

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
		if req.ExtendSessions > 0 {
			updates["total_sessions"] = newTotal
			updates["remaining_sessions"] = newRemaining
		}
		if enrollment.Status == models.EnrollmentStatusExpired {
			updates["status"] = models.EnrollmentStatusActive
		}

		if err := tx.Model(&models.Enrollment{}).
			Where("id = ?", enrollment.ID).
			Updates(updates).Error; err != nil {
			return errors.New("ไม่สามารถขยายสิทธิ์เรียนได้")
		}

		record := models.EnrollmentExtension{
			EnrollmentID:          enrollment.ID,
			ExtendDays:            req.ExtendDays,
			ExtendSessions:        req.ExtendSessions,
			Reason:                reason,
			PreviousExpiresAt:     &previous,
			NewExpiresAt:          &newExpiresAt,
			PreviousTotalSessions: previousTotal,
			NewTotalSessions:      newTotal,
			ExtendedByUserID:      adminUserID,
		}
		if err := tx.Create(&record).Error; err != nil {
			return errors.New("ไม่สามารถบันทึกประวัติการขยายสิทธิ์ได้")
		}

		status := enrollment.Status
		if enrollment.Status == models.EnrollmentStatusExpired {
			status = models.EnrollmentStatusActive
		}

		result = dto.ExtendEnrollmentRes{
			EnrollmentID:      enrollment.ID,
			Status:            string(status),
			ExpiresAt:         &newExpiresAt,
			DaysLeft:          dto.DaysLeft(&newExpiresAt),
			TotalSessions:     newTotal,
			RemainingSessions: newRemaining,
			Extension:         dto.ToEnrollmentExtensionDTO(&record),
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
