package models

import (
	"time"

	"gorm.io/gorm"
)

// Notification เก็บแจ้งเตือนต่อผู้ใช้ (per users.id)
//
// สถาปัตยกรรม: ฝั่งหน้าเว็บเป็นคน "derive" แจ้งเตือนจากข้อมูลที่มีอยู่ (บิลค้าง/สลิปรอตรวจ/ฯลฯ)
// แล้ว sync ขึ้นมาเก็บที่นี่ backend ทำหน้าที่เป็นคลังแจ้งเตือนแบบ generic + จำสถานะอ่าน (ReadAt)
// และเก็บประวัติย้อนหลังข้ามอุปกรณ์
//
// กันซ้ำด้วยชุด (UserID, Type, Signature): Type = ประเภท (เช่น "unpaid"),
// Signature = สถานะ ณ ตอนนั้น (เช่น "3:900") ถ้าสถานะเปลี่ยนจะถือเป็นแจ้งเตือนใหม่คนละแถว
type Notification struct {
	gorm.Model

	UserID uint `json:"user_id" gorm:"index:idx_notif_user_type_sig,priority:1"`

	Type      string `json:"type" gorm:"index:idx_notif_user_type_sig,priority:2"`
	Signature string `json:"signature" gorm:"index:idx_notif_user_type_sig,priority:3"`

	Title string `json:"title"`
	Body  string `json:"body"`
	Href  string `json:"href"`
	Tone  string `json:"tone"`

	// ReadAt = เวลาที่อ่าน (nil = ยังไม่อ่าน)
	ReadAt *time.Time `json:"read_at"`
}
