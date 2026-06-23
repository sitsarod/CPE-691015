package models

import (
	"gorm.io/gorm"
)

type RawVideo struct {
	gorm.Model
	VideoURL  		string    	`json:"videoUrl" valid:"required~Video URL is required,url~Invalid video URL format"` // URL วิดีโอต้นฉบับ
}