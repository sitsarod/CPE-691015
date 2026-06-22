package models

import (
	"gorm.io/gorm"
)

type DayOfWeek string

const (
	Monday    DayOfWeek = "Monday"
	Tuesday   DayOfWeek = "Tuesday"
	Wednesday DayOfWeek = "Wednesday"
	Thursday  DayOfWeek = "Thursday"
	Friday    DayOfWeek = "Friday"
	Saturday  DayOfWeek = "Saturday"
	Sunday    DayOfWeek = "Sunday"
)

type WeeklySchedule struct {
	gorm.Model

	DayOfWeek DayOfWeek `json:"day_of_week" gorm:"type:varchar(20)" valid:"required~dayOfWeek is required"`
	StartTime string    `json:"start_time" gorm:"type:time" valid:"required~startTime is required"`
	EndTime   string    `json:"end_time" gorm:"type:time" valid:"required~endTime is required"`

	// Foreign Key
	EnrollmentID uint `json:"enrollment_id" valid:"required~enrollmentId is required"`

	Enrollment *Enrollment `json:"-" gorm:"foreignKey:EnrollmentID"`
}