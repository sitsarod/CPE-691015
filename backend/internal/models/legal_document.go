package models

import "gorm.io/gorm"

type LegalDocumentKey string

const (
	LegalDocFaceConsent     LegalDocumentKey = "face_consent"
	LegalDocEnrollmentTerms LegalDocumentKey = "enrollment_terms"
)

// LegalDocumentRevision คือเนื้อหาหนึ่งฉบับของเอกสารที่ผู้ใช้ต้องกดยอมรับ
//
// ⚠️ ห้ามแก้แถวเดิม ทุกการบันทึกต้องเพิ่มแถวใหม่ — ความยินยอมอ้างเลข Version ไว้
// ถ้าเขียนทับ จะพิสูจน์ย้อนหลังไม่ได้ว่าผู้ใช้เห็นข้อความอะไรตอนกดยอมรับ
type LegalDocumentRevision struct {
	gorm.Model

	DocKey   LegalDocumentKey `json:"doc_key" gorm:"type:varchar(40);not null;uniqueIndex:uniq_legal_doc_revision"`
	Revision uint             `json:"revision" gorm:"not null;uniqueIndex:uniq_legal_doc_revision"`

	// Version เปลี่ยนเฉพาะเมื่อแก้สาระ (ต้องยอมรับใหม่) · แก้คำผิดได้ Revision ใหม่แต่ Version เดิม
	Version string `json:"version" gorm:"type:varchar(40);not null"`

	// Content = เนื้อหาเป็น JSON ตามโครงของเอกสารแต่ละชนิด (ดู dto.FaceConsentContent, dto.EnrollmentTermsContent)
	Content string `json:"content" gorm:"type:text;not null"`

	RequiresReconsent bool  `json:"requires_reconsent"`
	CreatedByUserID   *uint `json:"created_by_user_id"`
}
