package models

import "gorm.io/gorm"

// HomeContent เก็บเนื้อหาหน้าแรกสาธารณะแบบ singleton (มีแถวเดียวเสมอ)
// แอดมินแก้ผ่านหน้า /admin/settings และหน้าแรกดึงไปแสดงแบบ dynamic
type HomeContent struct {
	gorm.Model

	// ส่วน "เกี่ยวกับเรา"
	AboutTitle    string `json:"about_title" gorm:"type:varchar(255)"`
	AboutContent  string `json:"about_content" gorm:"type:text"`
	AboutImageURL string `json:"about_image_url" gorm:"type:text"`

	// หัวข้อ/คำโปรยของแต่ละส่วน
	CoachesTitle    string `json:"coaches_title" gorm:"type:varchar(255)"`
	CoachesSubtitle string `json:"coaches_subtitle" gorm:"type:varchar(255)"`
	CoursesTitle    string `json:"courses_title" gorm:"type:varchar(255)"`
	CoursesSubtitle string `json:"courses_subtitle" gorm:"type:varchar(255)"`

	// ส่วนรีวิว featured (reuse ระบบรีวิวเดิม)
	ShowFeaturedReviews bool   `json:"show_featured_reviews" gorm:"default:false"`
	ReviewsTitle        string `json:"reviews_title" gorm:"type:varchar(255)"`
	ReviewsSubtitle     string `json:"reviews_subtitle" gorm:"type:varchar(255)"`

	// ลิงก์โซเชียลมีเดีย (เว้นว่าง = ไม่แสดงไอคอนช่องนั้นบนหน้าแรก)
	FacebookURL  string `json:"facebook_url" gorm:"type:varchar(255)"`
	InstagramURL string `json:"instagram_url" gorm:"type:varchar(255)"`
	TiktokURL    string `json:"tiktok_url" gorm:"type:varchar(255)"`
	YoutubeURL   string `json:"youtube_url" gorm:"type:varchar(255)"`
	LineURL      string `json:"line_url" gorm:"type:varchar(255)"`
}
