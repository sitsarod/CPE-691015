package dto

import "time"

type DetectedVideoResponse struct {
	ID         uint      `json:"id"`
	CustomerID uint      `json:"customer_id"`
	RawVideoID uint      `json:"raw_video_id"`
	VideoURL   string    `json:"video_url"`
	CreatedAt  time.Time `json:"created_at"`
}

type UploadVideoResponse struct {
	RawVideoID uint   `json:"raw_video_id"`
	VideoURL   string `json:"video_url"`

	// FaceCount คือจำนวนใบหน้าทั้งหมดที่เจอจากทุกเฟรมที่สุ่มตรวจ (คนเดิมโผล่หลายเฟรมนับซ้ำได้
	// จึงมากกว่าจำนวนคนจริงในคลิปได้ — ดูคอมเมนต์ที่ FaceTaggingService.DetectStudentsInVideo)
	FaceCount int                         `json:"face_count"`
	Students  []DetectedStudentSuggestion `json:"students"`
}
