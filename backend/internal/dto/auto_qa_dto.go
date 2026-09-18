package dto

import "time"

type AutoQADTO struct {
	ID              uint      `json:"id"`
	Mode            string    `json:"mode"`
	Question        string    `json:"question"`
	SimilarQuestion string    `json:"similar_question"`
	Answer          string    `json:"answer"`
	AttachmentURL   string    `json:"attachment_url,omitempty"`
	AttachmentType  string    `json:"attachment_type,omitempty"`
	AttachmentName  string    `json:"attachment_name,omitempty"`
	SessionID       *uint     `json:"session_id,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// PublicAutoQADTO เป็นรูปแบบย่อสำหรับส่งออกสาธารณะ (quick replies บนหน้าเว็บ)
// จงใจไม่มี similar_question และ mode เพื่อไม่เปิดเผยคีย์เวิร์ด/กลไกจับคู่หลังบ้าน
type PublicAutoQADTO struct {
	ID       uint   `json:"id"`
	Question string `json:"question"`
	Answer   string `json:"answer"`
}

type CreateAutoQAReq struct {
	Mode            string `json:"mode" binding:"required,oneof=keyword_match"`
	Question        string `json:"question" binding:"required"`
	SimilarQuestion string `json:"similar_question"`
	Answer          string `json:"answer" binding:"required"`
}

// UpdateAutoQAReq ใช้ pointer ทุกฟิลด์ เพื่อแยก "ไม่ได้ส่งฟิลด์นี้มา" (nil = ไม่แก้)
// ออกจาก "ส่งค่าว่างมาเพื่อล้างค่า" (&"" = ตั้งเป็นค่าว่าง) — จำเป็นกับ similar_question
// เพื่อให้แอดมินลบคีย์เวิร์ดทั้งหมดออกได้จริง (เดิมใช้ string ธรรมดาจึงล้างไม่ได้)
type UpdateAutoQAReq struct {
	Mode            *string `json:"mode"`
	Question        *string `json:"question"`
	SimilarQuestion *string `json:"similar_question"`
	Answer          *string `json:"answer"`
}

type ChatSessionDTO struct {
	ID         uint        `json:"id"`
	GuestName  string      `json:"guest_name"`
	GuestEmail string      `json:"guest_email"`
	GuestPhone string      `json:"guest_phone"`
	Status     string      `json:"status"`
	// AccessToken ส่งกลับให้เจ้าของห้อง "เฉพาะตอนสร้างห้อง" เพื่อเก็บไว้ใช้ยืนยันสิทธิ์เข้าถึงภายหลัง
	// (กัน IDOR) — ไม่แนบในรายการฝั่งแอดมินหรือตอนดึงห้องซ้ำ omitempty จึงไม่โผล่เมื่อว่าง
	AccessToken string      `json:"access_token,omitempty"`
	UserID     *uint       `json:"user_id,omitempty"`
	User       *UserDTO    `json:"user,omitempty"`
	AutoQAs    []AutoQADTO `json:"auto_qas,omitempty"`
	CreatedAt  time.Time   `json:"created_at"`
	UpdatedAt  time.Time   `json:"updated_at"`
}

// CreateChatSessionReq — ทุกฟิลด์เป็น optional
// ผู้ใช้ที่ไม่ได้ล็อกอินจะเริ่มแชทแบบไม่ระบุตัวตน (ไม่เก็บชื่อ/อีเมล/เบอร์)
// ผู้ใช้ที่ล็อกอินแล้วฝั่งหน้าเว็บจะส่งข้อมูลจากบัญชีมาให้ พร้อม user_id
type CreateChatSessionReq struct {
	GuestName  string `json:"guest_name"`
	GuestEmail string `json:"guest_email"`
	GuestPhone string `json:"guest_phone"`
	UserID     *uint  `json:"user_id"`
}

type UpdateChatSessionReq struct {
	Status string `json:"status" binding:"required,oneof=active closed"`
}

// AskQuestionReq — question ไม่บังคับแล้ว เพราะอาจส่งเป็นรูป/ไฟล์แนบอย่างเดียวได้
// (service จะตรวจเองว่าต้องมีอย่างน้อยข้อความหรือไฟล์แนบ)
type AskQuestionReq struct {
	Question       string `json:"question"`
	AttachmentURL  string `json:"attachment_url"`
	AttachmentType string `json:"attachment_type"`
	AttachmentName string `json:"attachment_name"`
}

type AskQuestionResponse struct {
	Answer string     `json:"answer"`
	Match  *AutoQADTO `json:"match,omitempty"`
}

// AdminReplyReq — answer ไม่บังคับ เพราะแอดมินอาจส่งไฟล์แนบอย่างเดียวได้
type AdminReplyReq struct {
	Answer         string `json:"answer"`
	AttachmentURL  string `json:"attachment_url"`
	AttachmentType string `json:"attachment_type"`
	AttachmentName string `json:"attachment_name"`
}

// ChatUploadResponse ผลลัพธ์การอัปโหลดไฟล์แนบในแชท
type ChatUploadResponse struct {
	URL  string `json:"url"`
	Type string `json:"type"` // "image" | "file"
	Name string `json:"name"`
}

// EditMessageReq สำหรับแก้ไขข้อความของลูกค้าในห้องแชท (แก้เฉพาะข้อความ)
type EditMessageReq struct {
	Question string `json:"question"`
}

