package dto

import (
	"time"

	"CPE-691015/internal/models"
)

type EnrollmentExtensionDTO struct {
	ID           uint `json:"id"`
	EnrollmentID uint `json:"enrollment_id"`

	Reason string `json:"reason"`

	PreviousExpiresAt *time.Time `json:"previous_expires_at"`
	NewExpiresAt      *time.Time `json:"new_expires_at"`

	PreviousTotalSessions uint `json:"previous_total_sessions"`
	NewTotalSessions      uint `json:"new_total_sessions"`

	PreviousRemainingSessions uint       `json:"previous_remaining_sessions"`
	NewRemainingSessions      uint       `json:"new_remaining_sessions"`
	CarriedOverSessions       uint       `json:"carried_over_sessions"`
	ForfeitedSessions         uint       `json:"forfeited_sessions"`
	CarryOverExpiresAt        *time.Time `json:"carry_over_expires_at"`

	ExtendedByUserID uint      `json:"extended_by_user_id"`
	ExtendedAt       time.Time `json:"extended_at"`
}

func ToEnrollmentExtensionDTO(e *models.EnrollmentExtension) EnrollmentExtensionDTO {
	return EnrollmentExtensionDTO{
		ID:                    e.ID,
		EnrollmentID:          e.EnrollmentID,
		Reason:                e.Reason,
		PreviousExpiresAt:     e.PreviousExpiresAt,
		NewExpiresAt:          e.NewExpiresAt,
		PreviousTotalSessions: e.PreviousTotalSessions,
		NewTotalSessions:      e.NewTotalSessions,

		PreviousRemainingSessions: e.PreviousRemainingSessions,
		NewRemainingSessions:      e.NewRemainingSessions,
		CarriedOverSessions:       e.CarriedOverSessions,
		ForfeitedSessions:         e.ForfeitedSessions,
		CarryOverExpiresAt:        e.CarryOverExpiresAt,

		ExtendedByUserID: e.ExtendedByUserID,
		ExtendedAt:       e.CreatedAt,
	}
}

func ToEnrollmentExtensionDTOs(items []models.EnrollmentExtension) []EnrollmentExtensionDTO {
	result := make([]EnrollmentExtensionDTO, 0, len(items))
	for i := range items {
		result = append(result, ToEnrollmentExtensionDTO(&items[i]))
	}
	return result
}
