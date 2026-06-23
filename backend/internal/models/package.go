package models

import (
	"gorm.io/gorm"
)

type Package struct {
	gorm.Model

	SessionsCount uint    `json:"sessions_count" valid:"required~sessionsCount is required"`
	HoursCount    uint    `json:"hours_count" valid:"required~hoursCount is required"`
	Price         float64 `json:"price" gorm:"type:decimal(10,2)" valid:"required~price is required"`

	CourseID uint    `json:"course_id" valid:"required~courseId is required"`
	Course   *Course `json:"course,omitempty" gorm:"foreignKey:CourseID"`

	Enrollments []Enrollment `json:"enrollments" gorm:"foreignKey:PackageID;constraint:OnDelete:CASCADE;"`
}
