package models

import (
	"gorm.io/gorm"
)

// Court = สนามที่ใช้สอน (admin จัดการรายการเอง: เพิ่ม/แก้ชื่อ/ลบ)
// WorkSchedule เก็บชื่อสนามเป็น string (court_number) ตารางนี้เป็นเพียง "รายการตัวเลือก" ที่ admin ดูแลได้
type Court struct {
	gorm.Model

	Name     string `json:"name" gorm:"type:varchar(50);not null" valid:"required~name is required"`
	IsActive bool   `json:"is_active" gorm:"default:true"`
}
