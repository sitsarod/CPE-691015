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
//
// ⚠️ ไม่มี field URL ตรงๆ ให้ใช้เป็น <img src>/<video src> ได้ เพราะเนื้อไฟล์ต้องผ่าน endpoint
// ที่เช็คสิทธิ์ก่อนเสมอ (แนบ token) — frontend ต้องประกอบ path เองจาก type + raw_id
// แล้ว fetch เป็น blob (ดู PostMediaThumb.tsx ฝั่ง frontend)
type PostItem struct {
	ID        uint      `json:"id"`
	Type      string    `json:"type"`   // "photo" หรือ "video"
	RawID     uint      `json:"raw_id"` // raw_photo_id หรือ raw_video_id แล้วแต่ type
	CreatedAt time.Time `json:"created_at"`
}
