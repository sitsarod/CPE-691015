package dto

import "time"

type AnnouncementDTO struct {
	ID          uint         `json:"id"`
	Title       string       `json:"title"`
	Content     string       `json:"content"`
	ImageURL    string       `json:"image_url"`
	Link        string       `json:"link"`
	Visibility  string       `json:"visibility"`
	UserID      uint         `json:"user_id"`
	User        *UserDTO     `json:"user"`
	CategoryID  uint         `json:"category_id"`
	Category    *CategoryDTO `json:"category"`
	StartDate   time.Time    `json:"start_date"`
	EndDate     time.Time    `json:"end_date"`
	ViewCount   uint         `json:"view_count"`
	IsPinned    bool         `json:"is_pinned"`
	CreatedAt   time.Time    `json:"created_at"`
	UpdatedAt   time.Time    `json:"updated_at"`
}

// PinAnnouncementReq สำหรับปักหมุด/ยกเลิกปักหมุดประกาศ (แอดมิน)
type PinAnnouncementReq struct {
	Pinned bool `json:"pinned"`
}

type UserDTO struct {
	ID        uint   `json:"id"`
	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`
	Email     string `json:"email"`
	Role      string `json:"role"`
}

type CategoryDTO struct {
	ID   uint   `json:"id"`
	Name string `json:"name"`
}

type CreateAnnouncementReq struct {
	Title      string    `json:"title" binding:"required"`
	Content    string    `json:"content"`
	ImageURL   string    `json:"image_url"`
	Link       string    `json:"link"`
	// ใครเห็นประกาศนี้ได้บ้าง: "all" | "guest" | "member" — เว้นว่างมา = ค่าเริ่มต้น "all"
	Visibility string    `json:"visibility"`
	// user_id ไม่รับจาก client อีกต่อไป — controller จะดึงจาก JWT ของแอดมินที่ล็อกอินอยู่
	// เพื่อกันการปลอมเจ้าของประกาศ (attribution) และให้ตรงกับตัวตนจริงเสมอ
	CategoryID uint      `json:"category_id" binding:"required"`
	StartDate  time.Time `json:"start_date" binding:"required"`
	EndDate    time.Time `json:"end_date" binding:"required"`
}

// UpdateAnnouncementReq ใช้ pointer ทุก field เพื่อแยก "ไม่ได้ส่งมา" (nil) ออกจาก
// "ส่งค่าว่างมาเพื่อล้างค่า" ("") — ทำให้ลบรูป/ล้างเนื้อหาได้จริง
//
// จงใจไม่มี UserID: การแก้ไขประกาศต้องไม่เปลี่ยนเจ้าของ (author) เดิม
type UpdateAnnouncementReq struct {
	Title      *string    `json:"title"`
	Content    *string    `json:"content"`
	ImageURL   *string    `json:"image_url"`
	Link       *string    `json:"link"`
	Visibility *string    `json:"visibility"`
	CategoryID *uint      `json:"category_id"`
	StartDate  *time.Time `json:"start_date"`
	EndDate    *time.Time `json:"end_date"`
}

type CreateCategoryReq struct {
	Name string `json:"name" binding:"required"`
}

type UpdateCategoryReq struct {
	Name string `json:"name" binding:"required"`
}
