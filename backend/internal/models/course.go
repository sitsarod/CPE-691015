package models

import (
	"gorm.io/gorm"
)

type CourseStatus string

const (
	CourseStatusActive   CourseStatus = "active"
	CourseStatusInactive CourseStatus = "inactive"
	CourseStatusDraft    CourseStatus = "draft"
)

type Course struct {
	gorm.Model

	CourseName    string         `json:"course_name" gorm:"type:varchar(100)" valid:"required~courseName is required"`
	Description   string         `json:"description" gorm:"type:text" valid:"required~description is required"`
	Status        CourseStatus   `json:"status" gorm:"type:varchar(20);not null;default:'draft'"`

	LearningOutcomes string `json:"-" gorm:"type:text"`

	UserID        uint           `json:"user_id" valid:"required~userID is required"`
	User          *User          `json:"user" gorm:"foreignKey:UserID"`
	
	Packages      []Package      `json:"packages" gorm:"foreignKey:CourseID;constraint:OnDelete:CASCADE;"`
	WorkSchedules []WorkSchedule `json:"work_schedules" gorm:"foreignKey:CourseID;constraint:OnDelete:CASCADE;"`
}
