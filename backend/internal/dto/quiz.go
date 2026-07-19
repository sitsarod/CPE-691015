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

type QuizOptionResponse struct {
	ID                  uint   `json:"id"`
	Text                string `json:"text"`
	RecommendedCourseID *uint  `json:"recommended_course_id"`
}

type QuizQuestionResponse struct {
	ID       uint                 `json:"id"`
	Text     string               `json:"text"`
	Sequence int                  `json:"sequence"`
	IsActive bool                 `json:"is_active"`
	Options  []QuizOptionResponse `json:"options"`
}
