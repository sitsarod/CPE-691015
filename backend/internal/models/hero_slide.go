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
}
