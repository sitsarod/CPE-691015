package models

import (
	"gorm.io/gorm"
)

type RawVideo struct {
	gorm.Model
	VideoURL  		string    	`json:"videoUrl" valid:"required~Video URL is required,url~Invalid video URL format"` // URL วิดีโอต้นฉบับ

	// CoachID = โค้ชผู้อัปโหลด ใช้เช็คสิทธิ์ความเป็นเจ้าของ (nil = แอดมินอัปโหลดเอง ไม่ผูกกับโค้ชคนไหน)
	CoachID *uint  `json:"coach_id"`
	Coach   *Coach `json:"coach,omitempty" gorm:"foreignKey:CoachID"`
}