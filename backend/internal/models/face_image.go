package models

import (
	"time"
)

// FaceImageStatus — เส้นทางปกติ: pending → awaiting_review → ready
// ตกได้สองจังหวะ: ระบบตรวจไม่พบใบหน้า หรือแอดมินดูแล้วไม่ใช่เจ้าตัว
type FaceImageStatus string

const (
	FaceImagePending        FaceImageStatus = "pending"         // รอ worker สร้าง embedding
	FaceImageAwaitingReview FaceImageStatus = "awaiting_review" // รอแอดมินตรวจว่าเป็นเจ้าตัว
	FaceImageReady          FaceImageStatus = "ready"           // มีแต่สถานะนี้ที่ถูกนำไปเทียบตอนเช็คชื่อ
	FaceImageRejected       FaceImageStatus = "rejected"        // เหตุผลอยู่ใน RejectReason
)

// FacePose คือท่าที่ให้ถ่าย ถ่ายครบ 3 ท่าเพื่อให้จำได้แม้ตอนสแกนหันหน้าไม่ตรงกล้อง
type FacePose string

const (
	PoseFront FacePose = "front"
	PoseLeft  FacePose = "left"
	PoseRight FacePose = "right"
)

// FaceImage คือรูปใบหน้าอ้างอิงของนักเรียนหนึ่งใบ พร้อม embedding ที่คำนวณจากรูปนั้น
//
// ⚠️ เป็นข้อมูลชีวภาพตาม PDPA ม.26 จึงไม่ใช้ gorm.Model โดยตั้งใจ เพื่อไม่ให้มี DeletedAt:
// PDPA ต้องการการลบจริง และแถวที่ soft delete ยังกิน slot ของ unique (customer_id, pose)
// ทำให้คนที่ถอนความยินยอมแล้วกลับมาถ่ายท่าเดิมใหม่ไม่ได้
type FaceImage struct {
	ID        uint      `json:"id" gorm:"primarykey"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`

	CustomerID uint      `json:"customer_id" gorm:"not null;index;uniqueIndex:idx_face_customer_pose"`
	Customer   *Customer `json:"-" gorm:"foreignKey:CustomerID"`

	// public_id ของ Cloudinary (โหมด authenticated) ไม่ใช่ URL ที่เปิดตรงได้
	// ห้ามส่งออก JSON — การดูรูปต้องผ่าน endpoint ที่ตรวจสิทธิ์แล้ว proxy ให้
	StorageKey string `json:"-" gorm:"type:varchar(255);not null"`

	// unique (customer_id, pose) — กันอัปซ้ำท่าเดิม และกันใช้เป็นที่ฝากไฟล์ไม่จำกัด
	Pose   FacePose        `json:"pose" gorm:"type:varchar(10);not null;uniqueIndex:idx_face_customer_pose"`
	Status FaceImageStatus `json:"status" gorm:"type:varchar(20);not null;index;default:'pending'"`

	// รูปแบบข้อความของ pgvector: "[0.01,-0.23,...]" 512 ตัว (ห้ามใช้ exponent)
	// เป็น *string เพราะตอน pending ต้องเขียน NULL — string ว่างจะโดน postgres ปฏิเสธ
	Embedding *string `json:"-" gorm:"type:vector(512)"`

	// เก็บชื่อโมเดลทุกแถว เพราะ embedding ข้ามโมเดลเทียบกันไม่ได้
	EmbeddingModel string  `json:"embedding_model" gorm:"type:varchar(50)"`
	QualityScore   float64 `json:"quality_score"`

	// ผลตรวจว่าเป็นคนจริงตอนถ่าย — ยังไม่ได้ใช้ในเฟสแรก
	LivenessScore float64 `json:"liveness_score"`

	VerifiedBy   *uint      `json:"verified_by"` // users.id ของแอดมินที่ตรวจ
	VerifiedAt   *time.Time `json:"verified_at"`
	RejectReason string     `json:"reject_reason" gorm:"type:varchar(255)"`
}
