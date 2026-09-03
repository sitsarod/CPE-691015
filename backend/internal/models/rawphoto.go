package models

import (
	"gorm.io/gorm"
)

// RawPhoto คือรูปต้นฉบับที่โค้ชอัปโหลด (อาจมีนักเรียนหลายคนอยู่ในรูปเดียว)
//
// ต่างจาก models.Photo ซึ่งเป็น "รูปยินยอมอ้างอิงใบหน้า" ของนักเรียน/โค้ชคนเดียว
// (ใช้เป็นแบบสำหรับเทียบใบหน้า) — RawPhoto คือรูปโพสต์ที่จะเอาไปโชว์ในโปรไฟล์
// ของนักเรียนที่ถูกแท็กอยู่ในรูป ผ่านตาราง DetectedPhoto
type RawPhoto struct {
	gorm.Model
	PhotoURL string `json:"photoUrl" valid:"required~Photo URL is required,url~Invalid photo URL format"`

	// CoachID = โค้ชผู้อัปโหลด ใช้เช็คสิทธิ์ความเป็นเจ้าของ (nil = แอดมินอัปโหลดเอง ไม่ผูกกับโค้ชคนไหน)
	CoachID *uint  `json:"coach_id"`
	Coach   *Coach `json:"coach,omitempty" gorm:"foreignKey:CoachID"`
}
