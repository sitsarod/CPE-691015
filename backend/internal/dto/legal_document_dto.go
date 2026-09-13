package dto

import (
	"encoding/json"
	"time"
)

// FaceConsentContent คือส่วนของประกาศเก็บข้อมูลใบหน้าที่แอดมินแก้ได้
// ข้อมูลผู้ควบคุมข้อมูลมาจากหัวข้อข้อมูลติดต่อ ส่วนอ้างอิงมาตรากฎหมายคงไว้ในโค้ด
type FaceConsentContent struct {
	Title            string   `json:"title"`
	Summary          string   `json:"summary"`
	DataCollected    []string `json:"data_collected"`
	Purposes         []string `json:"purposes"`
	NotUsedFor       []string `json:"not_used_for"`
	Disclosure       []string `json:"disclosure"`
	Retention        string   `json:"retention"`
	Rights           []string `json:"rights"`
	DeclineNotice    string   `json:"decline_notice"`
	WithdrawalNotice string   `json:"withdrawal_notice"`
}

type EnrollmentTermsContent struct {
	Title    string                   `json:"title"`
	Sections []EnrollmentTermsSection `json:"sections"`
}

// LegalDocumentDTO คือเอกสารฉบับปัจจุบันที่หน้าตั้งค่าของแอดมินใช้แก้ไข
type LegalDocumentDTO struct {
	Key       string          `json:"key"`
	Version   string          `json:"version"`
	Revision  uint            `json:"revision"`
	UpdatedAt time.Time       `json:"updated_at"`
	Content   json.RawMessage `json:"content"`
}

type UpdateLegalDocumentReq struct {
	Content json.RawMessage `json:"content" binding:"required"`

	// RequiresReconsent = แก้สาระสำคัญ ต้องขึ้นเวอร์ชันใหม่และให้ผู้ใช้ยอมรับใหม่
	RequiresReconsent bool `json:"requires_reconsent"`

	// BaseRevision = ฉบับที่แอดมินเปิดมาแก้ · ไม่ตรงกับล่าสุดแปลว่ามีคนบันทึกทับไปก่อน
	BaseRevision uint `json:"base_revision" binding:"required"`
}
