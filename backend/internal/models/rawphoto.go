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

	// path เรียกดูรูปจริง (/photo-posts/:id/raw) — คำนวณจาก ID หลัง create เสร็จ ไม่ใช่ URL
	// ไฟล์สาธารณะแบบเดิมแล้ว ต้องผ่าน endpoint ที่เช็คสิทธิ์ก่อนเท่านั้น
	PhotoURL string `json:"photoUrl"`

	// storage key ที่ MediaStorage ใช้เปิด/ลบไฟล์จริง — เป็นรายละเอียดภายใน ไม่ส่งออก JSON
	StorageKey string `json:"-" gorm:"type:varchar(255)"`

	// CoachID = โค้ชผู้อัปโหลด ใช้เช็คสิทธิ์ความเป็นเจ้าของ (nil = แอดมินอัปโหลดเอง ไม่ผูกกับโค้ชคนไหน)
	CoachID *uint  `json:"coach_id"`
	Coach   *Coach `json:"coach,omitempty" gorm:"foreignKey:CoachID"`
}
