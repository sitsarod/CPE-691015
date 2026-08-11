package models

import (
	"time"
	"gorm.io/gorm"
)

type Announcement struct {
	gorm.Model
	
	Title   string `json:"title" gorm:"type:varchar(255);not null"`
	Content string `json:"content" gorm:"type:text"`
	ImageURL string `json:"image_url" gorm:"column:image_url;type:text"`
	
	UserID uint  `json:"user_id" gorm:"not null"`
	User   *User `json:"user,omitempty" gorm:"foreignKey:UserID"`
	
	CategoryID uint      `json:"category_id" gorm:"not null"`
	Category   *Category `json:"category,omitempty" gorm:"foreignKey:CategoryID"`
	
	StartDate time.Time `json:"start_date"`
	EndDate   time.Time `json:"end_date"`
	ViewCount uint      `json:"view_count" gorm:"default:0"`
}