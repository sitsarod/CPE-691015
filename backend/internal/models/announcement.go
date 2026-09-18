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
	// Link คือลิงก์ที่แนบมากับประกาศ (ไม่บังคับ) เช่น ลิงก์สมัคร/รายละเอียดเพิ่มเติมภายนอก
	Link string `json:"link" gorm:"type:text"`

	// Visibility กำหนดว่าใครเห็นประกาศนี้ได้บ้าง:
	//   "all"    = ทั้งผู้เยี่ยมชม (ยังไม่ล็อกอิน) และสมาชิกที่ล็อกอินแล้ว (ค่าเริ่มต้น)
	//   "guest"  = เฉพาะผู้เยี่ยมชมที่ยังไม่ล็อกอิน (หน้าแรกสาธารณะ)
	//   "member" = เฉพาะสมาชิกที่ล็อกอินแล้ว (แดชบอร์ดลูกค้า)
	Visibility string `json:"visibility" gorm:"type:varchar(20);not null;default:'all'"`

	UserID uint  `json:"user_id" gorm:"not null"`
	User   *User `json:"user,omitempty" gorm:"foreignKey:UserID"`

	CategoryID uint      `json:"category_id" gorm:"not null"`
	Category   *Category `json:"category,omitempty" gorm:"foreignKey:CategoryID"`

	StartDate time.Time `json:"start_date"`
	EndDate   time.Time `json:"end_date"`
	ViewCount uint      `json:"view_count" gorm:"default:0"`

	// IsPinned = แอดมินปักหมุดประกาศนี้ให้ลอยอยู่บนสุดของรายการ (เช่น ข่าวด่วน/ปิดปรับปรุง)
	IsPinned bool `json:"is_pinned" gorm:"not null;default:false"`
}
