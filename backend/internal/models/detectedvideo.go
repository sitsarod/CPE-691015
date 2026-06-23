package models

import (
	"gorm.io/gorm"
)

type DetectedVideo struct {
	gorm.Model
	CustomerID 		uint   			`json:"customer_id" valid:"required~UserID is required"`
	Customer   		*Customer  		`json:"customer" gorm:"foreignKey:CustomerID"`

	RawVideoID 		uint   			`json:"raw_video_id" valid:"required~RawVideoID is required"`
	RawVideo   		*RawVideo  		`json:"raw_video" gorm:"foreignKey:RawVideoID"`

	VideoURL   		string 			`json:"videoUrl" valid:"required~Video URL is required,url~Invalid video URL format"` 


}