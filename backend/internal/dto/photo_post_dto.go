package dto

import "time"

type DetectedPhotoResponse struct {
	ID         uint      `json:"id"`
	CustomerID uint      `json:"customer_id"`
	RawPhotoID uint      `json:"raw_photo_id"`
	PhotoURL   string    `json:"photo_url"`
	CreatedAt  time.Time `json:"created_at"`
}

type UploadPhotoPostResponse struct {
	RawPhotoID uint   `json:"raw_photo_id"`
	PhotoURL   string `json:"photo_url"`
}

// PostItem คือรายการโพสต์ที่รวมทั้งรูปและวิดีโอเข้าด้วยกัน สำหรับแท็บ Posts ในโปรไฟล์นักเรียน
type PostItem struct {
	ID        uint      `json:"id"`
	Type      string    `json:"type"` // "photo" หรือ "video"
	MediaURL  string    `json:"media_url"`
	CreatedAt time.Time `json:"created_at"`
}
