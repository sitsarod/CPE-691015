package dto

import (
	"time"

	"CPE-691015/internal/models"
)


type ExtendEnrollmentReq struct {
	// ขยายเวลา — 0 หรือไม่ส่ง = ไม่ขยายเวลา
	ExtendDays uint `json:"extend_days" binding:"omitempty,max=366"`


	ExtendSessions uint `json:"extend_sessions" binding:"omitempty,max=100"`

	Reason string `json:"reason" binding:"required,min=3,max=500"`
}

type EnrollmentExtensionDTO struct {
	ID             uint   `json:"id"`
	EnrollmentID   uint   `json:"enrollment_id"`
	ExtendDays     uint   `json:"extend_days"`
	ExtendSessions uint   `json:"extend_sessions"`
	Reason         string `json:"reason"`

	PreviousExpiresAt *time.Time `json:"previous_expires_at"`
	NewExpiresAt      *time.Time `json:"new_expires_at"`

	PreviousTotalSessions uint `json:"previous_total_sessions"`
	NewTotalSessions      uint `json:"new_total_sessions"`

	ExtendedByUserID uint      `json:"extended_by_user_id"`
	ExtendedAt       time.Time `json:"extended_at"`
}

type ExtendEnrollmentRes struct {
	EnrollmentID uint       `json:"enrollment_id"`
	Status       string     `json:"status"`
	ExpiresAt    *time.Time `json:"expires_at"`
	DaysLeft     *int       `json:"days_left"`

	TotalSessions     uint `json:"total_sessions"`
	RemainingSessions uint `json:"remaining_sessions"`

	Extension EnrollmentExtensionDTO `json:"extension"`
}

func ToEnrollmentExtensionDTO(e *models.EnrollmentExtension) EnrollmentExtensionDTO {
	return EnrollmentExtensionDTO{
		ID:                    e.ID,
		EnrollmentID:          e.EnrollmentID,
		ExtendDays:            e.ExtendDays,
		ExtendSessions:        e.ExtendSessions,
		Reason:                e.Reason,
		PreviousExpiresAt:     e.PreviousExpiresAt,
		NewExpiresAt:          e.NewExpiresAt,
		PreviousTotalSessions: e.PreviousTotalSessions,
		NewTotalSessions:      e.NewTotalSessions,
		ExtendedByUserID:      e.ExtendedByUserID,
		ExtendedAt:            e.CreatedAt,
	}
}

func ToEnrollmentExtensionDTOs(items []models.EnrollmentExtension) []EnrollmentExtensionDTO {
	result := make([]EnrollmentExtensionDTO, 0, len(items))
	for i := range items {
		result = append(result, ToEnrollmentExtensionDTO(&items[i]))
	}
	return result
}
