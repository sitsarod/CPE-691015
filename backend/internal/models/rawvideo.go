package models

import (
	"gorm.io/gorm"
)

type RawVideo struct {
	gorm.Model
	VideoURL  		string    	`json:"videoUrl"` 
}