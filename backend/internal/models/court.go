package models

import (
	"gorm.io/gorm"
)

// Court = สนามที่ใช้สอน (admin เพิ่ม/แก้ชื่อ/ปิดใช้งาน/ลบ) · WorkSchedule ผูกด้วย court_id
// ชื่อไม่ซ้ำกันหลัง normalize — บังคับที่ CourtService ไม่ใช่ที่ index
type Court struct {
	gorm.Model

	Name     string `json:"name" gorm:"type:varchar(50);not null" valid:"required~name is required"`
	IsActive bool   `json:"is_active" gorm:"default:true"`
}
