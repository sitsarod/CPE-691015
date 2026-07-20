package models

import (
	"gorm.io/gorm"
)

type WorkSchedule struct {
	gorm.Model

	Date        string `json:"date" gorm:"type:date" valid:"required~date is required"`
	StartTime   string `json:"start_time" gorm:"type:time" valid:"required~startTime is required"`
	EndTime     string `json:"end_time" gorm:"type:time" valid:"required~endTime is required"`
	Description string `json:"description" gorm:"type:text" valid:"required~description is required"`
	Courtnumber string `json:"court_number" gorm:"type:varchar(10)" valid:"required~courtNumber is required"`

	CoachID uint   `json:"coach_id" gorm:"not null" valid:"required~coachId is required"`
	Coach   *Coach `json:"coach,omitempty" gorm:"foreignKey:CoachID;constraint:OnDelete:CASCADE;"`

	CourseID uint    `json:"course_id" gorm:"not null" valid:"required~courseId is required"`
	Course   *Course `json:"course,omitempty" gorm:"foreignKey:CourseID;constraint:OnDelete:CASCADE;"`
}
