package models

import (
	"gorm.io/gorm"
)

// AutoQAMode represents the matching strategy used to serve a bot response
type AutoQAMode string

const (
	AutoQAModeKeywordMatch AutoQAMode = "keyword_match"
	// AutoQAModeAdminReply ใช้กับ log ข้อความที่ "แอดมินตอบเอง" ในห้องแชท
	// (ไม่ใช่ template ในคลังความรู้) จึงไม่ปรากฏใน GetAllAutoQAs ที่กรอง session_id IS NULL
	AutoQAModeAdminReply AutoQAMode = "admin_reply"
)

// AutoQA stores the bot knowledge base (Q&A pairs) used to serve automated responses
type AutoQA struct {
	gorm.Model

	Mode AutoQAMode `json:"mode" gorm:"type:varchar(50)" valid:"required~mode is required,oneof(keyword_match admin_reply)~Invalid mode value"`

	Question        string `json:"question" gorm:"type:text" valid:"required~question is required"`
	SimilarQuestion string `json:"similar_question" gorm:"type:text"`
	Answer          string `json:"answer" gorm:"type:text" valid:"required~answer is required"`

	// ไฟล์/รูปแนบของข้อความในห้องแชท (ไม่บังคับ)
	// AttachmentURL ว่าง = ข้อความนี้ไม่มีไฟล์แนบ
	// AttachmentType: "image" (รูป) หรือ "file" (ไฟล์อื่น เช่น pdf) — ใช้เลือกวิธีแสดงผล
	// เจ้าของไฟล์คือผู้ส่งของแถวนั้น (question row = ลูกค้า, admin_reply row = แอดมิน)
	AttachmentURL  string `json:"attachment_url" gorm:"type:text"`
	AttachmentType string `json:"attachment_type" gorm:"type:varchar(20)"`
	AttachmentName string `json:"attachment_name" gorm:"type:varchar(255)"`

	// Optional FK — links the AutoQA response to the session it was triggered in
	SessionID   *uint        `json:"session_id" gorm:"index"`
	ChatSession *ChatSession `json:"chat_session,omitempty" gorm:"foreignKey:SessionID"`
}
