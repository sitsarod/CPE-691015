package models

import (
	"gorm.io/gorm"
)

type RawVideo struct {
	gorm.Model

	// path เรียกดูวิดีโอจริง (/videos/:id/raw) — คำนวณจาก ID หลัง create เสร็จ ไม่ใช่ URL
	// ไฟล์สาธารณะแบบเดิมแล้ว ต้องผ่าน endpoint ที่เช็คสิทธิ์ก่อนเท่านั้น
	VideoURL string `json:"videoUrl"`

	// storage key ที่ MediaStorage ใช้เปิด/ลบไฟล์จริง — เป็นรายละเอียดภายใน ไม่ส่งออก JSON
	StorageKey string `json:"-" gorm:"type:varchar(255)"`

	// CoachID = โค้ชผู้อัปโหลด ใช้เช็คสิทธิ์ความเป็นเจ้าของ (nil = แอดมินอัปโหลดเอง ไม่ผูกกับโค้ชคนไหน)
	CoachID *uint  `json:"coach_id"`
	Coach   *Coach `json:"coach,omitempty" gorm:"foreignKey:CoachID"`
}
