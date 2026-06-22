package models

import (
	"gorm.io/gorm"
)

type DetectedVideo struct {
	gorm.Model
	CustomerID uint   `json:"customerId"`
	RawVideoID uint   `json:"rawVideoId"` 
	VideoURL   string `json:"videoUrl"` 
}