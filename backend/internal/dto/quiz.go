package dto

type CreateQuizQuestionReq struct {
	Text     string `json:"text" binding:"required"`
	Sequence int    `json:"sequence"`
	IsActive *bool  `json:"is_active"`
}

type UpdateQuizQuestionReq struct {
	Text     *string `json:"text"`
	Sequence *int    `json:"sequence"`
	IsActive *bool   `json:"is_active"`
}

type CreateQuizOptionReq struct {
	Text                string `json:"text" binding:"required"`
	RecommendedCourseID *uint  `json:"recommended_course_id"`
}


type AddOptionCourseReq struct {
	CourseID uint `json:"course_id" binding:"required"`
	Weight   int  `json:"weight" binding:"omitempty,min=1,max=5"`
}

type OptionCourseResponse struct {
	ID         uint    `json:"id"`
	CourseID   uint    `json:"course_id"`
	CourseName string  `json:"course_name"`
	Weight     int     `json:"weight"`
}

type QuizOptionResponse struct {
	ID                  uint                   `json:"id"`
	Text                string                 `json:"text"`
	RecommendedCourseID *uint                  `json:"recommended_course_id,omitempty"`
	RecommendedCourses  []OptionCourseResponse `json:"recommended_courses"`
}


type QuizRecommendReq struct {
	OptionIDs []uint `json:"option_ids"`
}

type RecommendedCourseDTO struct {
	CourseID     uint `json:"course_id"`
	Score        int  `json:"score"`
	MatchPercent int  `json:"match_percent"`
}

type QuizRecommendResponse struct {
	Data     []RecommendedCourseDTO `json:"data"`
	Fallback bool                   `json:"fallback"`
}

type QuizQuestionResponse struct {
	ID       uint                 `json:"id"`
	Text     string               `json:"text"`
	Sequence int                  `json:"sequence"`
	IsActive bool                 `json:"is_active"`
	Options  []QuizOptionResponse `json:"options"`
}
