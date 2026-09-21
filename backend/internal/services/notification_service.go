package services

import (
	"errors"
	"log"
	"time"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"

	"gorm.io/gorm"
)

const notificationHistoryLimit = 100

type NotificationService struct {
	db *gorm.DB
}

func NewNotificationService(db *gorm.DB) *NotificationService {
	return &NotificationService{db: db}
}

// Sync บันทึกแจ้งเตือนที่หน้าเว็บ derive มา — เพิ่มเฉพาะชุด (user, type, signature) ที่ยังไม่มี
// ทำให้แถวเดิมไม่ถูกสร้างซ้ำ และไม่ไปแตะสถานะอ่านของแถวเก่า
//
// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ ปัจจุบัน "ยังไม่มีใครเรียกใช้" — ระบบแจ้งเตือนเปลี่ยนเป็น event-driven เต็มตัวแล้ว
// (backend สร้าง notification เองผ่าน CreateNotification/NotifyAdmins ตอนเกิด event จริง)
// จงใจเก็บ path นี้ไว้ใช้ในอนาคต สำหรับแจ้งเตือนที่ "backend ไม่รู้/ไม่ควรรู้" ซึ่ง
// event-driven หรือ cron ทำแทนไม่ได้ เช่น:
//   1. สิ่งที่รู้เฉพาะฝั่ง client — เบราว์เซอร์/อุปกรณ์ไม่รองรับกล้อง, ปิดสิทธิ์กล้อง ฯลฯ
//      (หน้าเว็บ derive แล้ว POST /notifications/sync ขึ้นมาเก็บ)
//   2. การเตือนย้ำแบบสรุป (standing reminder) ที่ derive จาก state ปัจจุบันตอนเปิดเว็บ
//      เช่น "คุณมีบิลค้าง 3 ใบ" (signature ผูกกับจำนวน/ยอด → เปลี่ยนแล้วเด้งใหม่)
// การ dedup ด้วย (user, type, signature) ทำให้ยิงซ้ำได้ปลอดภัย ไม่เกิดแถวซ้ำ
// ─────────────────────────────────────────────────────────────────────────────
func (s *NotificationService) Sync(userID uint, items []dto.SyncNotificationItem) error {
	if userID == 0 || len(items) == 0 {
		return nil
	}

	return s.db.Transaction(func(tx *gorm.DB) error {
		for _, it := range items {
			if it.Type == "" || it.Signature == "" {
				continue
			}

			var count int64
			if err := tx.Model(&models.Notification{}).
				Where("user_id = ? AND type = ? AND signature = ?", userID, it.Type, it.Signature).
				Count(&count).Error; err != nil {
				return err
			}
			if count > 0 {
				continue // มีอยู่แล้ว ไม่สร้างซ้ำ
			}

			n := models.Notification{
				UserID:    userID,
				Type:      it.Type,
				Signature: it.Signature,
				Title:     it.Title,
				Body:      it.Body,
				Href:      it.Href,
				Tone:      it.Tone,
			}
			if err := tx.Create(&n).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

// List คืนแจ้งเตือนของผู้ใช้ เรียงใหม่→เก่า (จำกัดจำนวนกันโตเกิน)
func (s *NotificationService) List(userID uint) ([]models.Notification, error) {
	var list []models.Notification
	err := s.db.
		Where("user_id = ?", userID).
		Order("created_at DESC").
		Limit(notificationHistoryLimit).
		Find(&list).Error
	return list, err
}

// UnreadCount จำนวนที่ยังไม่อ่าน
func (s *NotificationService) UnreadCount(userID uint) (int64, error) {
	var count int64
	err := s.db.Model(&models.Notification{}).
		Where("user_id = ? AND read_at IS NULL", userID).
		Count(&count).Error
	return count, err
}

// MarkRead ทำเครื่องหมายว่าอ่านแล้วรายการเดียว (ตรวจความเป็นเจ้าของด้วย user_id)
func (s *NotificationService) MarkRead(userID uint, id uint) error {
	now := time.Now()
	res := s.db.Model(&models.Notification{}).
		Where("id = ? AND user_id = ? AND read_at IS NULL", id, userID).
		Update("read_at", now)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		// อาจถูกอ่านไปแล้ว หรือไม่ใช่ของผู้ใช้คนนี้
		var count int64
		if err := s.db.Model(&models.Notification{}).
			Where("id = ? AND user_id = ?", id, userID).Count(&count).Error; err != nil {
			return err
		}
		if count == 0 {
			return errors.New("ไม่พบการแจ้งเตือน")
		}
	}
	return nil
}

// MarkAllRead ทำเครื่องหมายว่าอ่านทั้งหมด
func (s *NotificationService) MarkAllRead(userID uint) error {
	now := time.Now()
	return s.db.Model(&models.Notification{}).
		Where("user_id = ? AND read_at IS NULL", userID).
		Update("read_at", now).Error
}

// Clear ลบประวัติแจ้งเตือนทั้งหมดของผู้ใช้ (soft delete ตาม gorm)
func (s *NotificationService) Clear(userID uint) error {
	return s.db.Where("user_id = ?", userID).Delete(&models.Notification{}).Error
}

// ─────────────────────────────────────────────────────────────────────────────
// Event-driven helpers — เรียกจาก service อื่นเวลาเกิด event จริง
//
// ออกแบบเป็น best-effort: ไม่คืน error (แค่ log) เพื่อไม่ให้การแจ้งเตือนล้มเหลว
// ไปทำให้ operation หลัก (ออกบิล/ยืนยันสลิป/อนุมัติ ฯลฯ) พังตาม
// ควรเรียก "หลัง" transaction หลัก commit แล้ว โดยใช้ db หลัก (ไม่ใช่ tx)
// ─────────────────────────────────────────────────────────────────────────────

// CreateNotification สร้างแจ้งเตือน 1 รายการให้ผู้ใช้ กันซ้ำด้วย (user, type, signature)
func CreateNotification(db *gorm.DB, userID uint, ntype, signature, title, body, href, tone string) {
	if db == nil || userID == 0 || ntype == "" || signature == "" {
		return
	}
	var count int64
	if err := db.Model(&models.Notification{}).
		Where("user_id = ? AND type = ? AND signature = ?", userID, ntype, signature).
		Count(&count).Error; err != nil {
		log.Printf("[notify] ตรวจแจ้งเตือนซ้ำไม่สำเร็จ (user=%d type=%s): %v", userID, ntype, err)
		return
	}
	if count > 0 {
		return
	}
	n := models.Notification{
		UserID:    userID,
		Type:      ntype,
		Signature: signature,
		Title:     title,
		Body:      body,
		Href:      href,
		Tone:      tone,
	}
	if err := db.Create(&n).Error; err != nil {
		log.Printf("[notify] สร้างแจ้งเตือนไม่สำเร็จ (user=%d type=%s): %v", userID, ntype, err)
		return
	}
	// ส่งสัญญาณเรียลไทม์ไปยัง SSE stream ของผู้ใช้ (ถ้ากำลังเปิดเว็บอยู่)
	// พก ntype ไปด้วย ให้ client กรองได้ว่าจะรีเฟรชหน้าตัวเองไหม
	NotifHub.Publish(userID, ntype)
}

// NotifyAdmins ส่งแจ้งเตือนเดียวกันให้แอดมินทุกคน
func NotifyAdmins(db *gorm.DB, ntype, signature, title, body, href, tone string) {
	if db == nil {
		return
	}
	var adminIDs []uint
	if err := db.Model(&models.User{}).
		Where("role = ?", models.AdminRole).
		Pluck("id", &adminIDs).Error; err != nil {
		log.Printf("[notify] ดึงรายชื่อแอดมินไม่สำเร็จ: %v", err)
		return
	}
	for _, id := range adminIDs {
		CreateNotification(db, id, ntype, signature, title, body, href, tone)
	}
}
