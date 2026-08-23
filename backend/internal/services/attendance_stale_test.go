package services

import (
	"testing"
	"time"

	"CPE-691015/internal/models"
)

// bkk คืนเวลาตามนาฬิกาที่สนาม — ทั้งไฟล์นี้ตัดสินด้วยเขตเวลานี้เท่านั้น
func bkk(t *testing.T, value string) time.Time {
	t.Helper()
	parsed, err := time.ParseInLocation("2006-01-02 15:04", value, appLocation())
	if err != nil {
		t.Fatalf("อ่านเวลาทดสอบ %q ไม่ได้: %v", value, err)
	}
	return parsed
}

// staleSession สร้างรอบที่เปิดอยู่ของวันที่กำหนด พร้อมสแนปช็อตเวลาคาบ
func staleSession(t *testing.T, date, start, end string) *models.AttendanceSession {
	t.Helper()
	day, err := time.Parse("2006-01-02", date)
	if err != nil {
		t.Fatalf("อ่านวันที่ทดสอบ %q ไม่ได้: %v", date, err)
	}
	return &models.AttendanceSession{
		SessionDate:       day,
		Status:            models.AttendanceSessionOpen,
		ScheduleStartTime: start,
		ScheduleEndTime:   end,
	}
}

// เส้นตายต้องนับจากปลายคาบบวกเวลาผ่อนผัน — ไม่ใช่จากตอนที่แอดมินกดเปิดรอบ
func TestSessionScanDeadlineUsesClassEndPlusGrace(t *testing.T) {
	session := staleSession(t, "2026-08-24", "18:00", "20:00")

	// กดเปิดตั้งแต่ 17:45 — ถ้าเผลอนับเส้นตายจากตรงนี้จะปิดตั้งแต่ยังเรียนอยู่
	session.OpenedAt = bkk(t, "2026-08-24 17:45")

	deadline, ok := sessionScanDeadline(session)
	if !ok {
		t.Fatal("ควรคำนวณเส้นตายได้")
	}

	want := bkk(t, "2026-08-24 20:30") // 20:00 + ผ่อนผัน 30 นาที
	if !deadline.Equal(want) {
		t.Fatalf("เส้นตายควรเป็น %s แต่ได้ %s", want, deadline)
	}
}

// คาบข้ามเที่ยงคืนต้องไม่ถูกตัดสินว่าหมดเวลาตั้งแต่ยังไม่เริ่มเรียน
func TestSessionScanDeadlineHandlesOvernightClass(t *testing.T) {
	session := staleSession(t, "2026-08-24", "23:00", "01:00")

	deadline, ok := sessionScanDeadline(session)
	if !ok {
		t.Fatal("ควรคำนวณเส้นตายได้")
	}

	want := bkk(t, "2026-08-25 01:30") // ปลายคาบตกวันถัดไป
	if !deadline.Equal(want) {
		t.Fatalf("เส้นตายควรเป็น %s แต่ได้ %s", want, deadline)
	}
}

// ⚠️ สำคัญที่สุดในไฟล์นี้: ตัดสินว่า "หมดเวลา" เร็วไปแม้แต่นาทีเดียว
// = งานอัตโนมัติหักโควตาคนที่ยังเรียนอยู่
func TestIsStaleSessionRespectsGraceWindow(t *testing.T) {
	session := staleSession(t, "2026-08-24", "18:00", "20:00")

	cases := []struct {
		name string
		now  string
		want bool
	}{
		{"ระหว่างคาบ", "2026-08-24 19:00", false},
		{"เพิ่งจบคาบ ยังอยู่ในผ่อนผัน", "2026-08-24 20:15", false},
		{"นาทีสุดท้ายของผ่อนผัน", "2026-08-24 20:30", false},
		{"พ้นผ่อนผันแล้ว", "2026-08-24 20:31", true},
		{"ข้ามวันมาแล้ว", "2026-08-25 09:00", true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := isStaleSession(session, bkk(t, tc.now)); got != tc.want {
				t.Fatalf("ที่เวลา %s ควรได้ %v แต่ได้ %v", tc.now, tc.want, got)
			}
		})
	}
}

// รอบเก่าที่ไม่มีสแนปช็อตเวลาคาบ ต้องรอขึ้นวันใหม่ ไม่ใช่ปิดทันทีที่เจอ
func TestIsStaleSessionWithoutScheduleSnapshotWaitsForNextDay(t *testing.T) {
	session := staleSession(t, "2026-08-24", "", "")

	if isStaleSession(session, bkk(t, "2026-08-24 23:59")) {
		t.Fatal("ยังเป็นวันเดียวกันอยู่ ไม่ควรถูกปิดอัตโนมัติ")
	}
	if !isStaleSession(session, bkk(t, "2026-08-25 00:01")) {
		t.Fatal("ขึ้นวันใหม่แล้ว ควรถูกปิดอัตโนมัติ")
	}
}

// รอบที่ปิดไปแล้วต้องไม่ถูกนับว่าสแกนได้ แม้จะยังอยู่ในเวลาคาบก็ตาม
func TestCanScanNowRequiresOpenStatus(t *testing.T) {
	session := staleSession(t, "2026-08-24", "18:00", "20:00")
	session.OpenedAt = bkk(t, "2026-08-24 17:45")
	now := bkk(t, "2026-08-24 19:00")

	if !canScanNow(session, now) {
		t.Fatal("รอบเปิดอยู่และอยู่ในเวลาคาบ ควรสแกนได้")
	}

	session.Status = models.AttendanceSessionClosed
	if canScanNow(session, now) {
		t.Fatal("รอบปิดแล้ว ไม่ควรสแกนได้")
	}
}

// เลยเวลาแล้วสแกนไม่ได้ แต่รอบต้องยังเปิดอยู่เพื่อให้เข้าไปกดปิดได้ (ที่มาของแถบเตือน)
func TestCanScanNowFalseAfterClassWindow(t *testing.T) {
	session := staleSession(t, "2026-08-24", "18:00", "20:00")
	session.OpenedAt = bkk(t, "2026-08-24 17:45")

	if canScanNow(session, bkk(t, "2026-08-24 20:45")) {
		t.Fatal("เลยเวลาผ่อนผันแล้ว ไม่ควรสแกนได้")
	}
	if session.Status != models.AttendanceSessionOpen {
		t.Fatal("สถานะรอบต้องยังเป็น open — การหมดเวลาสแกนไม่ใช่การปิดรอบ")
	}
}
