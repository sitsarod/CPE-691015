package models

import "gorm.io/gorm"

// AnnouncementBookmark เก็บว่า "ผู้ใช้คนไหนบันทึกประกาศไหนไว้อ่านทีหลัง"
// unique (user_id, announcement_id) กันบันทึกซ้ำ — ลบพร้อมประกาศ/ผู้ใช้ด้วย FK cascade
type AnnouncementBookmark struct {
	gorm.Model

	UserID         uint `json:"user_id" gorm:"not null;uniqueIndex:idx_user_announcement"`
	AnnouncementID uint `json:"announcement_id" gorm:"not null;uniqueIndex:idx_user_announcement"`

	User         *User         `json:"user,omitempty" gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE;"`
	Announcement *Announcement `json:"announcement,omitempty" gorm:"foreignKey:AnnouncementID;constraint:OnDelete:CASCADE;"`
}
