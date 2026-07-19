package models

import "gorm.io/gorm"

type QuizQuestion struct {
	gorm.Model
	Text     string       `json:"text" valid:"required~question text is required"`
	Sequence int          `json:"sequence"`
	IsActive bool         `json:"is_active" gorm:"default:true"`
	Options  []QuizOption `json:"options" gorm:"foreignKey:QuestionID;constraint:OnDelete:CASCADE;"`
}

type QuizOption struct {
	gorm.Model
	QuestionID          uint    `json:"question_id"`
	Text                string  `json:"text" valid:"required~option text is required"`
	RecommendedCourseID *uint   `json:"recommended_course_id"`
	RecommendedCourse   *Course `json:"recommended_course,omitempty" gorm:"foreignKey:RecommendedCourseID"`
}
