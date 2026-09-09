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
	// แผนที่ที่ตั้ง — เก็บ Google Maps embed URL (src ของ iframe) แสดงแทนรูปในส่วน About
	MapEmbedURL string `json:"map_embed_url" gorm:"type:text"`

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

	// ข้อมูลติดต่อ (แสดงท้ายหน้า/footer) — เว้นว่างช่องไหน จะไม่แสดงบรรทัดนั้น
	SchoolName     string `json:"school_name" gorm:"type:varchar(255)"`     // ชื่อโรงเรียน/ธุรกิจ ใช้เป็นชื่อแบรนด์ + บรรทัดลิขสิทธิ์
	ContactAddress string `json:"contact_address" gorm:"type:text"`         // ที่อยู่
	ContactPhone   string `json:"contact_phone" gorm:"type:varchar(255)"`   // เบอร์โทร
	ContactEmail   string `json:"contact_email" gorm:"type:varchar(255)"`   // อีเมล
	OpeningHours   string `json:"opening_hours" gorm:"type:text"`           // เวลาทำการ (รองรับหลายบรรทัด)

	// เอกสารทางกฎหมาย (แสดงเป็นหน้าแยก /privacy, /terms และลิงก์ท้ายหน้า)
	PrivacyPolicy  string `json:"privacy_policy" gorm:"type:text"`  // นโยบายความเป็นส่วนตัว (PDPA)
	TermsOfService string `json:"terms_of_service" gorm:"type:text"` // ข้อกำหนดการใช้งาน

	// ---- เนื้อหาหลักหน้าแรก (แอดมินแก้ได้) — เว้นว่างช่องไหน หน้าแรกจะ fallback เป็นค่า default ในโค้ด ----
	// ส่วน Hero
	HeroEyebrow  string `json:"hero_eyebrow" gorm:"type:varchar(255)"` // ข้อความ eyebrow เหนือหัวเรื่อง
	HeroHeadline string `json:"hero_headline" gorm:"type:text"`        // หัวเรื่องใหญ่ (แบ่งบรรทัดด้วย \n)
	HeroSubtext  string `json:"hero_subtext" gorm:"type:text"`         // ย่อหน้าใต้หัวเรื่อง

	// ข้อความปิดท้ายส่วนต่างๆ
	CoursesFootnote string `json:"courses_footnote" gorm:"type:text"` // หมายเหตุใต้ตารางคอร์ส
	CoachesNote     string `json:"coaches_note" gorm:"type:text"`     // ข้อความปิดท้ายส่วนโค้ช

	// ส่วนภาพบรรยากาศ
	FacilityTitle    string `json:"facility_title" gorm:"type:varchar(255)"`    // หัวข้อ (default "ภาพบรรยากาศ")
	FacilitySubtitle string `json:"facility_subtitle" gorm:"type:varchar(255)"` // คำโปรยอังกฤษ (default "Facility")

	// CTA ท้ายหน้า (footer)
	FooterCtaTitle    string `json:"footer_cta_title" gorm:"type:varchar(255)"` // หัวข้อ CTA (แบ่งบรรทัดด้วย \n)
	FooterCtaSubtitle string `json:"footer_cta_subtitle" gorm:"type:text"`      // คำโปรยข้าง CTA

	// ---- ข้อมูลชุดซ้ำ เก็บเป็น JSON array (แปลงเป็น slice ที่ชั้น service) ----
	HeroStatsJSON     string `json:"-" gorm:"column:hero_stats;type:text"`         // []{value,label} สถิติใต้ hero
	CoachStatsJSON    string `json:"-" gorm:"column:coach_stats;type:text"`        // []{value,label} สถิติส่วนโค้ช
	FacilityTilesJSON string `json:"-" gorm:"column:facility_tiles;type:text"`     // []{label,wide} ช่องภาพบรรยากาศ
	FaqItemsJSON      string `json:"-" gorm:"column:faq_items;type:text"`          // []{question,answer} คำถามที่พบบ่อย
}
