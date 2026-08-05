package dto

import "time"

type CreateEvaluationRequest struct {
	CustomerID uint   `json:"customer_id" binding:"required"`
	Assessment string `json:"assessment" binding:"required"`
	Score      int    `json:"score" binding:"required,min=0,max=100"`
	VideoURL   string `json:"video_url"`
}

type EvaluationResponse struct {
	ID         uint      `json:"id"`
	CustomerID uint      `json:"customer_id"`
	CoachID    uint      `json:"coach_id"`
	CoachName  string    `json:"coach_name"`
	Assessment string    `json:"assessment"`
	Score      int       `json:"score"`
	VideoURL   string    `json:"video_url,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
}
