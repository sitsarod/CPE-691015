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
	QuestionID uint   `json:"question_id"`
	Text       string `json:"text" valid:"required~option text is required"`

	RecommendedCourseID *uint   `json:"recommended_course_id,omitempty"`
	RecommendedCourse   *Course `json:"-" gorm:"foreignKey:RecommendedCourseID"`


	RecommendedCourses []QuizOptionCourse `json:"recommended_courses" gorm:"foreignKey:OptionID;constraint:OnDelete:CASCADE;"`
}

type QuizOptionCourse struct {
	ID       uint    `json:"id" gorm:"primarykey"`
	OptionID uint    `json:"option_id" gorm:"index;not null"`
	CourseID uint    `json:"course_id" gorm:"index;not null"`
	Course   *Course `json:"course,omitempty" gorm:"foreignKey:CourseID"`
	Weight   int     `json:"weight" gorm:"default:1"`
}
