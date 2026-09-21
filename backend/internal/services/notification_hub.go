package services

import "sync"

// notificationHub เป็น pub/sub ในหน่วยความจำ สำหรับส่งสัญญาณ "มีแจ้งเตือนใหม่"
// ไปยัง SSE stream ของผู้ใช้แต่ละคนแบบเรียลไทม์
//
// สัญญาณพก "ชนิด" ของแจ้งเตือนมาด้วย (เช่น "slip_uploaded") — client เอาไปกรองได้ว่า
// จะรีเฟรชหน้าตัวเองไหม แต่ payload ยังเป็นแค่ชนิด ไม่ใช่ข้อมูลจริง: พอได้สัญญาณก็ยังไป
// เรียก GET /notifications เดิมเพื่อโหลดข้อมูลจริง (DB เป็น source of truth)
//
// ⚠️ เก็บ subscriber ไว้ในหน่วยความจำของ instance เดียว — ถ้าสเกลหลาย instance
// ต้องเสริม pub/sub กลาง (เช่น Redis) ให้ event ข้าม instance ถึงกันได้
type notificationHub struct {
	mu   sync.RWMutex
	subs map[uint]map[chan string]bool
}

// NotifHub instance เดียวใช้ร่วมทั้งแอป (สร้าง notification → Publish, SSE handler → Subscribe)
var NotifHub = &notificationHub{subs: make(map[uint]map[chan string]bool)}

// Subscribe เปิดช่องรับสัญญาณของผู้ใช้ (มี buffer กันสัญญาณตกหล่นช่วงสั้น ๆ)
func (h *notificationHub) Subscribe(userID uint) chan string {
	ch := make(chan string, 4)
	h.mu.Lock()
	if h.subs[userID] == nil {
		h.subs[userID] = make(map[chan string]bool)
	}
	h.subs[userID][ch] = true
	h.mu.Unlock()
	return ch
}

// Unsubscribe ปิดช่องเมื่อ stream ตัดการเชื่อมต่อ
func (h *notificationHub) Unsubscribe(userID uint, ch chan string) {
	h.mu.Lock()
	if m := h.subs[userID]; m != nil {
		delete(m, ch)
		if len(m) == 0 {
			delete(h.subs, userID)
		}
	}
	h.mu.Unlock()
	close(ch)
}

// Publish ส่งสัญญาณ (พร้อมชนิด msg) ไปทุกช่องของผู้ใช้ (non-blocking — ถ้า buffer เต็มก็ข้าม
// เพราะ client จะ refetch ตามรอบ focus อยู่แล้ว จึงไม่พลาดข้อมูลจริง)
func (h *notificationHub) Publish(userID uint, msg string) {
	h.mu.RLock()
	chans := make([]chan string, 0, len(h.subs[userID]))
	for ch := range h.subs[userID] {
		chans = append(chans, ch)
	}
	h.mu.RUnlock()

	for _, ch := range chans {
		select {
		case ch <- msg:
		default:
		}
	}
}
