package models

import (
	"gorm.io/gorm"
)

type Package struct {
	gorm.Model
	Sessions_count uint `json:"sessions_count" valid:"required~sessionsCount is required"`
	Hours_count    uint `json:"hours_count" valid:"required~hoursCount is required"`
	Price          uint `json:"price" valid:"required~price is required"`

	CourseID uint    `json:"course_id" valid:"required~courseId is required"`
	Course   *Course `json:"course" gorm:"foreignKey:CourseID"`

	Enrollments []Enrollment `json:"enrollments" gorm:"foreignKey:PackageID"`
}
