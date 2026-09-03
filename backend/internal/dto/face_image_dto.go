package dto

import "time"

// AdminFaceImageDTO คือรูปหนึ่งใบในมุมของแอดมิน — แนบชื่อ/รหัสนักเรียนมาด้วย
// จะได้ไม่ต้องยิงถามทีละคน
//
// ⚠️ ไม่มี StorageKey และ Embedding — ข้อมูลชีวภาพห้ามหลุดออก API
// การดูรูปต้องผ่าน GET /api/face-images/:id/raw ที่ตรวจสิทธิ์ทุกครั้ง
type AdminFaceImageDTO struct {
	ID         uint   `json:"id"`
	CustomerID uint   `json:"customer_id"`
	Nickname   string `json:"nickname"`
	MemberCode string `json:"member_code"`

	Pose         string `json:"pose"`
	Status       string `json:"status"`
	RejectReason string `json:"reject_reason"`

	QualityScore  float64 `json:"quality_score"`
	LivenessScore float64 `json:"liveness_score"`

	VerifiedBy *uint      `json:"verified_by"`
	VerifiedAt *time.Time `json:"verified_at"`
	CreatedAt  time.Time  `json:"created_at"`

	// รูปที่ถูกปฏิเสธจะถูกลบไฟล์ทิ้ง เหลือแต่แถวไว้บอกเหตุผล
	// หน้าเว็บเช็คค่านี้ก่อน จะได้ไม่ยิงขอรูปที่ไม่มีอยู่แล้วขึ้น error เปล่า ๆ
	HasFile bool `json:"has_file"`
}

// FaceImageReviewRequest คือคำสั่งตรวจรูปจากแอดมิน
type FaceImageReviewRequest struct {
	Action string `json:"action" binding:"required,oneof=approve reject"`
	Reason string `json:"reason"`
}
