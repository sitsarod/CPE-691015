package dto

import (
	"time"

	"CPE-691015/internal/models"
)


type ExtendEnrollmentReq struct {

	ExtendDays uint `json:"extend_days" binding:"required,min=1,max=366"`
	Reason string `json:"reason" binding:"required,min=3,max=500"`
}

type EnrollmentExtensionDTO struct {
	ID           uint   `json:"id"`
	EnrollmentID uint   `json:"enrollment_id"`
	ExtendDays   uint   `json:"extend_days"`
	Reason       string `json:"reason"`

	PreviousExpiresAt *time.Time `json:"previous_expires_at"`
	NewExpiresAt      *time.Time `json:"new_expires_at"`

	ExtendedByUserID uint      `json:"extended_by_user_id"`
	ExtendedAt       time.Time `json:"extended_at"`
}
type ExtendEnrollmentRes struct {
	EnrollmentID uint                   `json:"enrollment_id"`
	Status       string                 `json:"status"`
	ExpiresAt    *time.Time             `json:"expires_at"`
	DaysLeft     *int                   `json:"days_left"`
	Extension    EnrollmentExtensionDTO `json:"extension"`
}

func ToEnrollmentExtensionDTO(e *models.EnrollmentExtension) EnrollmentExtensionDTO {
	return EnrollmentExtensionDTO{
		ID:                e.ID,
		EnrollmentID:      e.EnrollmentID,
		ExtendDays:        e.ExtendDays,
		Reason:            e.Reason,
		PreviousExpiresAt: e.PreviousExpiresAt,
		NewExpiresAt:      e.NewExpiresAt,
		ExtendedByUserID:  e.ExtendedByUserID,
		ExtendedAt:        e.CreatedAt,
	}
}

func ToEnrollmentExtensionDTOs(items []models.EnrollmentExtension) []EnrollmentExtensionDTO {
	result := make([]EnrollmentExtensionDTO, 0, len(items))
	for i := range items {
		result = append(result, ToEnrollmentExtensionDTO(&items[i]))
	}
	return result
}
