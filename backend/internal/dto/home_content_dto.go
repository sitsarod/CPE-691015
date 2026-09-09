package dto

import "time"

// HeroSlideDTO รูปสไลด์บนหน้าแรก
type HeroSlideDTO struct {
	ID        uint   `json:"id"`
	ImageURL  string `json:"image_url"`
	Caption   string `json:"caption"`
	LinkURL   string `json:"link_url"`
	SortOrder int    `json:"sort_order"`
	IsActive  bool   `json:"is_active"`
}

// PublicCoachDTO ข้อมูลโค้ชแบบ public สำหรับแสดงส่วนบุคลากรบนหน้าแรก
type PublicCoachDTO struct {
	ID             uint   `json:"id"`
	FirstName      string `json:"firstName"`
	LastName       string `json:"lastName"`
	Nickname       string `json:"nickname"`
	Specialization string `json:"specialization"`
	CoachLicense   string `json:"coach_license"`
	ProfilePicture string `json:"profile_picture"`
	HomeImage      string `json:"home_image"` // รูปโชว์การ์ดโค้ชหน้าแรก (แอดมินตั้งเอง)
	Bio            string `json:"bio"`        // รายละเอียดเพิ่มเติม แสดงตอนคลิกโค้ชในหน้าแรก
	FeatureOnHome  bool   `json:"feature_on_home"`
}

// StatItem หนึ่งช่องสถิติ (ใช้ทั้งสถิติใต้ hero และสถิติส่วนโค้ช)
type StatItem struct {
	Value string `json:"value"`
	Label string `json:"label"`
}

// FacilityTileItem หนึ่งช่องภาพในส่วนภาพบรรยากาศ (wide = ช่องกว้าง/สูง 2 แถวใน mosaic)
type FacilityTileItem struct {
	Label    string `json:"label"`
	Wide     bool   `json:"wide"`
	ImageURL string `json:"image_url"` // รูปจริงของช่อง (ว่าง = แสดง placeholder)
}

// FaqItem หนึ่งข้อคำถามที่พบบ่อย
type FaqItem struct {
	Question string `json:"question"`
	Answer   string `json:"answer"`
}

// HomeContentDTO เนื้อหาหน้าแรกทั้งหมด (ส่วน content แบบ singleton)
type HomeContentDTO struct {
	ID                  uint      `json:"id"`
	AboutTitle          string    `json:"about_title"`
	AboutContent        string    `json:"about_content"`
	AboutImageURL       string    `json:"about_image_url"`
	MapEmbedURL         string    `json:"map_embed_url"`
	CoachesTitle        string    `json:"coaches_title"`
	CoachesSubtitle     string    `json:"coaches_subtitle"`
	CoursesTitle        string    `json:"courses_title"`
	CoursesSubtitle     string    `json:"courses_subtitle"`
	ShowFeaturedReviews bool      `json:"show_featured_reviews"`
	ReviewsTitle        string    `json:"reviews_title"`
	ReviewsSubtitle     string    `json:"reviews_subtitle"`
	FacebookURL         string    `json:"facebook_url"`
	InstagramURL        string    `json:"instagram_url"`
	TiktokURL           string    `json:"tiktok_url"`
	YoutubeURL          string    `json:"youtube_url"`
	LineURL             string    `json:"line_url"`
	SchoolName          string    `json:"school_name"`
	ContactAddress      string    `json:"contact_address"`
	ContactPhone        string    `json:"contact_phone"`
	ContactEmail        string    `json:"contact_email"`
	OpeningHours        string    `json:"opening_hours"`
	PrivacyPolicy       string    `json:"privacy_policy"`
	TermsOfService      string    `json:"terms_of_service"`

	// เนื้อหาหลักหน้าแรก
	HeroEyebrow       string `json:"hero_eyebrow"`
	HeroHeadline      string `json:"hero_headline"`
	HeroSubtext       string `json:"hero_subtext"`
	CoursesFootnote   string `json:"courses_footnote"`
	CoachesNote       string `json:"coaches_note"`
	FacilityTitle     string `json:"facility_title"`
	FacilitySubtitle  string `json:"facility_subtitle"`
	FooterCtaTitle    string `json:"footer_cta_title"`
	FooterCtaSubtitle string `json:"footer_cta_subtitle"`

	// ข้อมูลชุดซ้ำ (แปลงจาก JSON ในฐานข้อมูลเป็น slice)
	HeroStats     []StatItem         `json:"hero_stats"`
	CoachStats    []StatItem         `json:"coach_stats"`
	FacilityTiles []FacilityTileItem `json:"facility_tiles"`
	FaqItems      []FaqItem          `json:"faq_items"`

	UpdatedAt time.Time `json:"updated_at"`
}

// PublicHomeDTO ก้อนข้อมูลรวมที่หน้าแรกสาธารณะดึงไปแสดงในครั้งเดียว
type PublicHomeDTO struct {
	Content         HomeContentDTO   `json:"content"`
	Slides          []HeroSlideDTO   `json:"slides"`
	FeaturedCoaches []PublicCoachDTO `json:"featured_coaches"`
}

// UpdateHomeContentReq แอดมินแก้เนื้อหาส่วน content (ทุกฟิลด์ optional)
// ใช้ pointer เพื่อแยก "ไม่ส่งมา" ออกจาก "ส่งค่าว่าง/false" ได้อย่างชัดเจน
type UpdateHomeContentReq struct {
	AboutTitle          *string `json:"about_title"`
	AboutContent        *string `json:"about_content"`
	AboutImageURL       *string `json:"about_image_url"`
	MapEmbedURL         *string `json:"map_embed_url"`
	CoachesTitle        *string `json:"coaches_title"`
	CoachesSubtitle     *string `json:"coaches_subtitle"`
	CoursesTitle        *string `json:"courses_title"`
	CoursesSubtitle     *string `json:"courses_subtitle"`
	ShowFeaturedReviews *bool   `json:"show_featured_reviews"`
	ReviewsTitle        *string `json:"reviews_title"`
	ReviewsSubtitle     *string `json:"reviews_subtitle"`
	FacebookURL         *string `json:"facebook_url"`
	InstagramURL        *string `json:"instagram_url"`
	TiktokURL           *string `json:"tiktok_url"`
	YoutubeURL          *string `json:"youtube_url"`
	LineURL             *string `json:"line_url"`
	SchoolName          *string `json:"school_name"`
	ContactAddress      *string `json:"contact_address"`
	ContactPhone        *string `json:"contact_phone"`
	ContactEmail        *string `json:"contact_email"`
	OpeningHours        *string `json:"opening_hours"`
	PrivacyPolicy       *string `json:"privacy_policy"`
	TermsOfService      *string `json:"terms_of_service"`

	// เนื้อหาหลักหน้าแรก
	HeroEyebrow       *string `json:"hero_eyebrow"`
	HeroHeadline      *string `json:"hero_headline"`
	HeroSubtext       *string `json:"hero_subtext"`
	CoursesFootnote   *string `json:"courses_footnote"`
	CoachesNote       *string `json:"coaches_note"`
	FacilityTitle     *string `json:"facility_title"`
	FacilitySubtitle  *string `json:"facility_subtitle"`
	FooterCtaTitle    *string `json:"footer_cta_title"`
	FooterCtaSubtitle *string `json:"footer_cta_subtitle"`

	// ข้อมูลชุดซ้ำ (nil = ไม่แก้; ส่ง [] = ล้างเป็นว่าง)
	HeroStats     *[]StatItem         `json:"hero_stats"`
	CoachStats    *[]StatItem         `json:"coach_stats"`
	FacilityTiles *[]FacilityTileItem `json:"facility_tiles"`
	FaqItems      *[]FaqItem          `json:"faq_items"`
}

// CreateHeroSlideReq เพิ่มรูปสไลด์ใหม่
type CreateHeroSlideReq struct {
	ImageURL  string `json:"image_url" binding:"required"`
	Caption   string `json:"caption"`
	LinkURL   string `json:"link_url"`
	SortOrder int    `json:"sort_order"`
	IsActive  *bool  `json:"is_active"`
}

// UpdateHeroSlideReq แก้ไขรูปสไลด์
type UpdateHeroSlideReq struct {
	ImageURL  *string `json:"image_url"`
	Caption   *string `json:"caption"`
	LinkURL   *string `json:"link_url"`
	SortOrder *int    `json:"sort_order"`
	IsActive  *bool   `json:"is_active"`
}

// ReorderHeroSlidesReq จัดลำดับรูปสไลด์ตามลำดับ id ที่ส่งมา
type ReorderHeroSlidesReq struct {
	OrderedIDs []uint `json:"ordered_ids" binding:"required"`
}

// FeatureCoachReq เลือก/ยกเลิกให้โค้ชแสดงบนหน้าแรก
type FeatureCoachReq struct {
	FeatureOnHome bool `json:"feature_on_home"`
}
