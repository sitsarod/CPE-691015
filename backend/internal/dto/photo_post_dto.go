package dto

import "time"

type DetectedPhotoResponse struct {
	ID         uint      `json:"id"`
	CustomerID uint      `json:"customer_id"`
	RawPhotoID uint      `json:"raw_photo_id"`
	PhotoURL   string    `json:"photo_url"`
	CreatedAt  time.Time `json:"created_at"`
}

// DetectedStudentSuggestion คือนักเรียนที่ระบบเดาว่าอยู่ในรูป/วิดีโอ — ยังไม่ได้บันทึกอะไรทั้งสิ้น
// โค้ชต้องตรวจทานแล้วกดยืนยันผ่าน /photo-posts/:id/assign หรือ /videos/:id/assign อีกทีถึงจะถูกแท็กจริง
type DetectedStudentSuggestion struct {
	CustomerID uint    `json:"customer_id"`
	Nickname   string  `json:"nickname"`
	Confidence float64 `json:"confidence"` // เปอร์เซ็นต์ (0–100) ให้หน้าเว็บเอาไปโชว์ได้ตรง ๆ
	// BBox คือกรอบใบหน้า [x1, y1, x2, y2] เป็นพิกเซล — ของรูปต้นฉบับ (ฝั่งรูป) หรือของ FrameImage
	// ด้านล่าง (ฝั่งวิดีโอ) ให้หน้าเว็บวาดกรอบ/ชื่อทับตอนโค้ชตรวจทาน (ไม่ได้ฝังลงไฟล์จริง) —
	// nil ถ้าจับคู่ไม่ได้ตำแหน่งใบหน้า
	BBox []float64 `json:"bbox,omitempty"`
	// FrameImage คือเฟรมวิดีโอที่ย่อขนาดแล้ว (JPEG base64 ไม่มี data URL prefix) ของเฟรมที่แมตช์
	// คนนี้ได้คะแนนดีที่สุด — มีเฉพาะที่มาจากวิดีโอเท่านั้น (รูปไม่ต้องใช้ เพราะหน้าเว็บมีไฟล์
	// ต้นฉบับอยู่แล้ว) bbox ข้างบนอ้างอิงรูปนี้เสมอ (ไม่ใช่เฟรมต้นฉบับก่อนย่อ)
	FrameImage string `json:"frame_image,omitempty"`
}

type UploadPhotoPostResponse struct {
	RawPhotoID uint   `json:"raw_photo_id"`
	PhotoURL   string `json:"photo_url"`

	// FaceCount คือจำนวนใบหน้าทั้งหมดที่เจอในรูป (รวมที่จับคู่กับนักเรียนไม่ได้)
	// ใช้บอกโค้ชว่า "เจอ 5 หน้า จับคู่ได้ 3 คน" จะได้รู้ว่าต้องแท็กเองอีกกี่คน
	FaceCount int                         `json:"face_count"`
	Students  []DetectedStudentSuggestion `json:"students"`

	// FaceTagError มีค่าเฉพาะตอนจำแนกใบหน้าอัตโนมัติล้มเหลวจริง ๆ (เช่น ไฟล์เสียหาย/face-service ล่ม)
	// ไม่ใช่แค่ "ไม่เจอใครที่รู้จัก" — ดูคอมเมนต์เต็มที่ dto.UploadVideoResponse.FaceTagError
	FaceTagError string `json:"face_tag_error,omitempty"`
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
