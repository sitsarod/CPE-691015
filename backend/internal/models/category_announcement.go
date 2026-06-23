package models

import (
	"gorm.io/gorm"
)

type Category struct {
	gorm.Model
	Name          string         `json:"name" gorm:"type:varchar(100);not null"`
	
	Announcements []Announcement `json:"announcements" gorm:"foreignKey:CategoryID;constraint:OnDelete:CASCADE;"`
}