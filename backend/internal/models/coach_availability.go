package models

import (
	"gorm.io/gorm"
)

type CoachAvailability struct {
	gorm.Model

	DayOfWeek string `json:"day_of_week" gorm:"type:varchar(10);not null" valid:"required~dayOfWeek is required"`
	StartTime string `json:"start_time" gorm:"type:time;not null" valid:"required~startTime is required"`
	EndTime   string `json:"end_time" gorm:"type:time;not null" valid:"required~endTime is required"`

	CoachID uint   `json:"coach_id" gorm:"not null"`
	Coach   *Coach `json:"coach,omitempty" gorm:"foreignKey:CoachID;constraint:OnDelete:CASCADE;"`
}
