package services

import "sync"

// notificationHub เป็น pub/sub ในหน่วยความจำ สำหรับส่งสัญญาณ "มีแจ้งเตือนใหม่"
// ไปยัง SSE stream ของผู้ใช้แต่ละคนแบบเรียลไทม์
//
// ออกแบบเป็น "สัญญาณเปล่า" (ไม่ส่ง payload) — พอ client ได้สัญญาณก็ไปเรียก
// GET /notifications เดิมเพื่อโหลดข้อมูลจริง (DB เป็น source of truth)
//
// ⚠️ เก็บ subscriber ไว้ในหน่วยความจำของ instance เดียว — ถ้าสเกลหลาย instance
// ต้องเสริม pub/sub กลาง (เช่น Redis) ให้ event ข้าม instance ถึงกันได้
type notificationHub struct {
	mu   sync.RWMutex
	subs map[uint]map[chan struct{}]bool
}

// NotifHub instance เดียวใช้ร่วมทั้งแอป (สร้าง notification → Publish, SSE handler → Subscribe)
var NotifHub = &notificationHub{subs: make(map[uint]map[chan struct{}]bool)}

// Subscribe เปิดช่องรับสัญญาณของผู้ใช้ (มี buffer กันสัญญาณตกหล่นช่วงสั้น ๆ)
func (h *notificationHub) Subscribe(userID uint) chan struct{} {
	ch := make(chan struct{}, 4)
	h.mu.Lock()
	if h.subs[userID] == nil {
		h.subs[userID] = make(map[chan struct{}]bool)
	}
	h.subs[userID][ch] = true
	h.mu.Unlock()
	return ch
}

// Unsubscribe ปิดช่องเมื่อ stream ตัดการเชื่อมต่อ
func (h *notificationHub) Unsubscribe(userID uint, ch chan struct{}) {
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

// Publish ส่งสัญญาณไปทุกช่องของผู้ใช้ (non-blocking — ถ้า buffer เต็มก็ข้าม
// เพราะ client จะ refetch ตามรอบ focus อยู่แล้ว จึงไม่พลาดข้อมูลจริง)
func (h *notificationHub) Publish(userID uint) {
	h.mu.RLock()
	chans := make([]chan struct{}, 0, len(h.subs[userID]))
	for ch := range h.subs[userID] {
		chans = append(chans, ch)
	}
	h.mu.RUnlock()

	for _, ch := range chans {
		select {
		case ch <- struct{}{}:
		default:
		}
	}
}
