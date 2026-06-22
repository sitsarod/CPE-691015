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

	CourseName  string       `json:"course_name" gorm:"type:varchar(100)" valid:"required~courseName is required"`
	Description string       `json:"description" gorm:"type:text" valid:"required~description is required"`
	Status      CourseStatus `json:"status" gorm:"type:varchar(20);not null;default:'Draft'"`

	CreatedBy uint `json:"created_by" valid:"required~createdBy is required"`

	Packages []Package `json:"packages" gorm:"foreignKey:CourseID"`
}
