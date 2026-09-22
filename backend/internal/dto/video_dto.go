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

	// FaceTagError มีค่าเฉพาะตอนจำแนกใบหน้าอัตโนมัติล้มเหลวจริง ๆ (เช่น วิดีโอยาวเกิน/ไฟล์เสียหาย/
	// face-service ล่ม) ไม่ใช่แค่ "ไม่เจอใครที่รู้จัก" — ให้หน้าเว็บบอกโค้ชได้ว่าทำไมไม่มีการ์ดขึ้นเลย
	// แทนที่จะให้เห็นแผงตรวจทานว่างเปล่าเฉย ๆ จนเข้าใจผิดว่า AI ดูแล้วไม่เจอใครจริง ๆ
	FaceTagError string `json:"face_tag_error,omitempty"`
}
