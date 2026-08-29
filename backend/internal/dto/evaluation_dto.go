package dto

import "time"

type CreateEvaluationRequest struct {
	CustomerID uint   `json:"customer_id" binding:"required"`
	Assessment string `json:"assessment" binding:"required"`
	// ไม่ใส่ "required" เพราะ 0 คือคะแนนที่ถูกต้อง (แย่ที่สุด) แต่ validator ถือว่า
	// zero-value ของ int เท่ากับ "ไม่ได้กรอก" — min=0,max=100 คุมช่วงค่าให้แล้วพอ
	Score      int    `json:"score" binding:"min=0,max=100"`
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

// EvaluableStudentResponse คือนักเรียนที่โค้ชคนนี้ประเมินได้ (ลงทะเบียนเรียนกับโค้ชคนนี้อยู่จริง)
type EvaluableStudentResponse struct {
	CustomerID     uint   `json:"customer_id"`
	Nickname       string `json:"nickname"`
	ProfilePicture string `json:"profile_picture,omitempty"`
}
