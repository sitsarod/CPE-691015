package models

import "gorm.io/gorm"

// HeroSlide รูปสไลด์ของ HeroSlider บนหน้าแรก จัดลำดับด้วย SortOrder
type HeroSlide struct {
	gorm.Model

	ImageURL  string `json:"image_url" gorm:"type:text;not null"`
	Caption   string `json:"caption" gorm:"type:varchar(255)"`
	LinkURL   string `json:"link_url" gorm:"type:text"`
	SortOrder int    `json:"sort_order" gorm:"default:0"`
	IsActive  bool   `json:"is_active" gorm:"default:true"`

	// จุดโฟกัสของภาพเป็น % (0-100) ใช้เป็น object-position ตอนครอปแสดงบนหน้าแรก
	// ค่าเริ่มต้น 50/50 = กึ่งกลางภาพ (เท่าพฤติกรรมเดิมก่อนมีฟีเจอร์นี้)
	FocalX int `json:"focal_x" gorm:"default:50"`
	FocalY int `json:"focal_y" gorm:"default:50"`

	// ระดับซูมของภาพเป็น % (100 = ขนาดปกติไม่ซูม, 300 = ซูม 3 เท่า) ใช้เป็น transform: scale()
	// ซูมรอบ ๆ จุดโฟกัส จึงต้องมากับ FocalX/Y เสมอ ค่าเริ่มต้น 100 = พฤติกรรมเดิมก่อนมีฟีเจอร์นี้
	Zoom int `json:"zoom" gorm:"default:100"`
}
