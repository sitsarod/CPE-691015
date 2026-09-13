package services

import (
	"errors"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
)

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
