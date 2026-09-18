package models

import (
	"gorm.io/gorm"
)

// ChatSessionStatus represents the current state of a chat session
type ChatSessionStatus string

const (
	ChatSessionStatusActive ChatSessionStatus = "active"
	ChatSessionStatusClosed ChatSessionStatus = "closed"
)

// ChatSession stores chat conversations and captures guest identity details for CRM usage
type ChatSession struct {
	gorm.Model

	GuestName  string `json:"guest_name" gorm:"type:varchar(255)" valid:"required~guest_name is required"`
	GuestEmail string `json:"guest_email" gorm:"type:varchar(255)" valid:"required~guest_email is required,email~Invalid email format"`
	GuestPhone string `json:"guest_phone" gorm:"type:varchar(20)" valid:"required~guest_phone is required"`

	// AccessToken เป็นกุญแจลับสุ่มประจำห้องแชท ใช้ยืนยันสิทธิ์เข้าถึงห้องแทนการเดา ID
	// (กัน IDOR — ID เป็นเลขเรียงลำดับ เดาได้ง่าย) ทุก endpoint สาธารณะของแชทต้องแนบ token นี้
	// json:"-" กันหลุดออกไปกับ response ตัวโมเดล — จะส่งให้เจ้าของห้องเฉพาะตอนสร้างผ่าน DTO เท่านั้น
	AccessToken string `json:"-" gorm:"column:access_token;type:varchar(64);uniqueIndex"`

	Status ChatSessionStatus `json:"status" gorm:"type:varchar(20);default:'active'" valid:"required~status is required,oneof(active closed)~Invalid status value"`

	// Optional FK — allows NULL for guest users who are not logged in
	UserID *uint `json:"user_id" gorm:"index"`
	User   *User `json:"user,omitempty" gorm:"foreignKey:UserID"`

	// Relationship — messages logged within this session
	AutoQAs []AutoQA `json:"auto_qas" gorm:"foreignKey:SessionID;constraint:OnDelete:CASCADE;"`
}
