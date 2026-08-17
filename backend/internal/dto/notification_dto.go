package dto

import (
	"time"

	"CPE-691015/internal/models"
)

// NotificationDTO รูปแบบข้อมูลแจ้งเตือนที่ส่งกลับหน้าเว็บ
type NotificationDTO struct {
	ID        uint      `json:"id"`
	Type      string    `json:"type"`
	Signature string    `json:"signature"`
	Title     string    `json:"title"`
	Body      string    `json:"body"`
	Href      string    `json:"href"`
	Tone      string    `json:"tone"`
	Read      bool      `json:"read"`
	CreatedAt time.Time `json:"created_at"`
}

// ToNotificationDTO แปลง model → DTO
func ToNotificationDTO(n *models.Notification) NotificationDTO {
	return NotificationDTO{
		ID:        n.ID,
		Type:      n.Type,
		Signature: n.Signature,
		Title:     n.Title,
		Body:      n.Body,
		Href:      n.Href,
		Tone:      n.Tone,
		Read:      n.ReadAt != nil,
		CreatedAt: n.CreatedAt,
	}
}

// ToNotificationDTOs แปลงรายการ
func ToNotificationDTOs(list []models.Notification) []NotificationDTO {
	out := make([]NotificationDTO, 0, len(list))
	for i := range list {
		out = append(out, ToNotificationDTO(&list[i]))
	}
	return out
}

// SyncNotificationItem หนึ่งรายการที่หน้าเว็บ derive แล้วส่งมา sync
//
// ⚠️ ยังไม่ถูกใช้ ณ ตอนนี้ (ระบบเป็น event-driven) — เก็บไว้ใช้อนาคตกับแจ้งเตือน
// ที่ backend ไม่รู้ เช่น เบราว์เซอร์ไม่รองรับกล้อง หรือ standing reminder ที่ derive
// ฝั่ง client ดูรายละเอียดที่ services.NotificationService.Sync
type SyncNotificationItem struct {
	Type      string `json:"type" binding:"required"`
	Signature string `json:"signature" binding:"required"`
	Title     string `json:"title" binding:"required"`
	Body      string `json:"body"`
	Href      string `json:"href"`
	Tone      string `json:"tone"`
}

// SyncNotificationsReq payload ของ POST /notifications/sync
type SyncNotificationsReq struct {
	Items []SyncNotificationItem `json:"items"`
}
