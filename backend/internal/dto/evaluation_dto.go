package dto

import "time"

type CreateEvaluationRequest struct {
	CustomerID uint   `json:"customer_id" binding:"required"`
	Assessment string `json:"assessment" binding:"required"`
	VideoURL   string `json:"video_url"`
}

type EvaluationResponse struct {
	ID         uint      `json:"id"`
	CustomerID uint      `json:"customer_id"`
	CoachID    uint      `json:"coach_id"`
	CoachName  string    `json:"coach_name"`
	Assessment string    `json:"assessment"`
	VideoURL   string    `json:"video_url,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
}

// EvaluableStudentResponse คือนักเรียนที่โค้ชคนนี้ประเมินได้ (ลงทะเบียนเรียนกับโค้ชคนนี้อยู่จริง)
type EvaluableStudentResponse struct {
	CustomerID     uint   `json:"customer_id"`
	Nickname       string `json:"nickname"`
	ProfilePicture string `json:"profile_picture,omitempty"`
}

// StudentMediaSummaryResponse คือนักเรียนหนึ่งคน พร้อมจำนวนรูป/วิดีโอที่ถูกแท็กไว้ — ใช้แสดงเป็น
// ลิสต์ "โฟลเดอร์เสมือน" ในหน้าแอดมิน (admin/detect/media) ให้เห็นว่าใครมีโพสต์รอดูบ้างโดยไม่ต้อง
// กดเข้าไปเช็คทีละคน
type StudentMediaSummaryResponse struct {
	CustomerID     uint   `json:"customer_id"`
	Nickname       string `json:"nickname"`
	ProfilePicture string `json:"profile_picture,omitempty"`
	PhotoCount     int64  `json:"photo_count"`
	VideoCount     int64  `json:"video_count"`
}

// EvaluableCourseResponse คือคอร์สที่โค้ชคนนี้มีตารางสอนอยู่จริง
type EvaluableCourseResponse struct {
	CourseID   uint   `json:"course_id"`
	CourseName string `json:"course_name"`
}
