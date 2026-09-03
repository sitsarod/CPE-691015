package models

import (
	"gorm.io/gorm"
)

// Photo คือรูปทั่วไปของนักเรียนหรือโค้ช (โปรไฟล์/แกลเลอรี) เท่านั้น
//
// ⚠️ "ไม่ใช่" ตารางข้อมูลชีวภาพ — รูปใบหน้าที่ใช้เช็คชื่อและ embedding
// ย้ายไปอยู่ face_images หมดแล้ว เพื่อให้ลบตามคำขอถอนความยินยอมได้แบบตารางเดียวจบ
type Photo struct {
	gorm.Model

	CustomerID uint      `json:"customer_id"`
	Customer   *Customer `json:"customer"`

	// pointer เพราะรูปหนึ่งใบมีเจ้าของฝั่งเดียว — เดิมเป็น uint + required
	// ซึ่งบังคับให้ทุกรูปต้องมีโค้ช เท่ากับบันทึกรูปของนักเรียนไม่ได้เลย
	CoachID *uint  `json:"coach_id"`
	Coach   *Coach `json:"coach"`

	PhotoURL string `json:"photoUrl" valid:"required~Photo URL is required,url~Invalid photo URL format"`
}
