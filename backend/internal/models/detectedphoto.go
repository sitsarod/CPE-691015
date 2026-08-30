package models

import (
	"gorm.io/gorm"
)

// DetectedPhoto ผูกนักเรียนคนหนึ่งเข้ากับรูป (RawPhoto) ที่ตัวเองถูกแท็ก/ตรวจพบอยู่ในรูป
// รูปเดียวมีได้หลายแถว (หนึ่งแถวต่อนักเรียนหนึ่งคนที่อยู่ในรูปนั้น) — โครงเดียวกับ DetectedVideo
type DetectedPhoto struct {
	gorm.Model
	CustomerID uint      `json:"customer_id" valid:"required~CustomerID is required"`
	Customer   *Customer `json:"customer" gorm:"foreignKey:CustomerID"`

	RawPhotoID uint      `json:"raw_photo_id" valid:"required~RawPhotoID is required"`
	RawPhoto   *RawPhoto `json:"raw_photo" gorm:"foreignKey:RawPhotoID"`

	PhotoURL string `json:"photoUrl" valid:"required~Photo URL is required,url~Invalid photo URL format"`
}
