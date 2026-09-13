package services

import (
	"fmt"
	"testing"
	"time"

	"CPE-691015/internal/models"

	"gorm.io/gorm"
)

// เทสชุดนี้คุม markCoachAbsentees — ตัวที่ "ตัดเงิน" โค้ชโดยตรง
//
// ─── ทำไมถึงสำคัญ ───
//
// ตอนปิดรอบเช็คชื่อ ฟังก์ชันนี้สร้างแถว absent ให้โค้ชทุกคนที่มีตารางงานแต่ไม่ได้สแกน
// แถว absent ทำให้คาบนั้นไม่ถูกนับเป็นค่าจ้าง (ดู classSessionForScheduleSQL)
//
// ⚠️ ฟังก์ชันนี้ไม่เคยมีเทสเลย ทั้งที่ตัดเงินคนจริง ๆ
// ถ้ามันมาร์คเกิน = โค้ชที่มาสอนไม่ได้เงิน · ถ้ามาร์คขาด = โค้ชที่ไม่มาได้เงิน
// ทั้งสองทางไม่มี error ให้ใครเห็น

const absCoachA = uint(801)
const absCoachB = uint(802)

func newAbsenteeDB(t *testing.T) *gorm.DB {
	return newTestDB(t,
		&models.WorkSchedule{}, &models.AttendanceSession{}, &models.CoachAttendance{},
		&models.Package{}, &models.PackageSchedule{}, &models.Course{},
		&models.Coach{}, &models.User{}, &models.Expense{}, &models.Notification{},
	)
}

func seedAbsCoach(t *testing.T, db *gorm.DB, coachID uint) {
	t.Helper()
	// ⚠️ uid / QR ประจำตัว ต้องไม่ซ้ำกัน (มี unique index จริงบนสองคอลัมน์นี้)
	// ปล่อยว่างไว้ = โค้ชคนที่สองสร้างไม่ขึ้น แล้วเทสจะฟ้องผิดจุด
	mustCreate(t, db, &models.Coach{
		Model: gorm.Model{ID: coachID}, Nickname: "เทส", Status: coachStatusActive,
		PaymentType: PaymentTypePerSession, PayRate: 300,
		Uid:            fmt.Sprintf("abs-uid-%d", coachID),
		PersonalQRCode: fmt.Sprintf("abs-qr-%d", coachID),
		MemberCode:     fmt.Sprintf("ABS%04d", coachID),
	})
}

// absSession สร้างรอบเช็คชื่อของคาบหนึ่ง (ยังไม่ปิด)
func absSession(t *testing.T, db *gorm.DB, date, start, end string, pkgID uint) models.AttendanceSession {
	t.Helper()
	d, _ := time.Parse("2006-01-02", date)
	s := models.AttendanceSession{
		PackageID: pkgID, SessionDate: d,
		Status: models.AttendanceSessionOpen, OpenedAt: time.Now(), OpenedByUserID: 1,
		ScheduleStartTime: start, ScheduleEndTime: end,
	}
	mustCreate(t, db, &s)
	if err := db.Exec(`UPDATE attendance_sessions SET session_date = ? WHERE id = ?`,
		date, s.ID).Error; err != nil {
		t.Fatalf("ปรับรูปแบบวันที่ของรอบเช็คชื่อไม่สำเร็จ: %v", err)
	}
	return s
}

func absWS(t *testing.T, db *gorm.DB, coachID uint, date, start, end string, pkgID uint) {
	t.Helper()
	p := pkgID
	ws := models.WorkSchedule{
		CoachID: coachID, CourseID: 1, PackageID: &p,
		Date: date, StartTime: start, EndTime: end,
		Description: "ทดสอบ", PayRateSnapshot: 300,
	}
	mustCreate(t, db, &ws)
	db.Exec(`UPDATE work_schedules SET date = ? WHERE id = ?`, date, ws.ID)
}

func absRecords(t *testing.T, db *gorm.DB, sessionID uint) map[uint]models.AttendanceStatus {
	t.Helper()
	var rows []models.CoachAttendance
	if err := db.Where("attendance_session_id = ?", sessionID).Find(&rows).Error; err != nil {
		t.Fatalf("ดึงบันทึกเช็คชื่อของโค้ชไม่สำเร็จ: %v", err)
	}
	out := map[uint]models.AttendanceStatus{}
	for _, r := range rows {
		out[r.CoachID] = r.Status
	}
	return out
}

// ─── 1. มาร์คเฉพาะคนที่มีตารางงานและยังไม่ได้เช็คชื่อ ───────────────────────

func TestMarkCoachAbsenteesOnlyMarksUncheckedScheduledCoaches(t *testing.T) {
	db := newAbsenteeDB(t)
	const day = "2026-05-04"
	mustCreate(t, db, &models.Package{Model: gorm.Model{ID: 1}, SessionsCount: 8, CourseID: 1})
	seedAbsCoach(t, db, absCoachA)
	seedAbsCoach(t, db, absCoachB)

	sess := absSession(t, db, day, "10:00", "12:00", 1)
	absWS(t, db, absCoachA, day, "10:00", "12:00", 1) // มาสอน — สแกนแล้ว
	absWS(t, db, absCoachB, day, "10:00", "12:00", 1) // ไม่มา — ยังไม่สแกน

	// โค้ช A สแกนไว้แล้ว
	mustCreate(t, db, &models.CoachAttendance{
		CoachID: absCoachA, AttendanceSessionID: sess.ID,
		WorkDate: time.Now(), CheckInTime: time.Now(),
		Status: models.AttendanceStatusPresent, IsScheduled: true,
	})

	if err := NewAttendanceService(db).markCoachAbsentees(db, &sess, nil, time.Now()); err != nil {
		t.Fatalf("มาร์คขาดงานไม่สำเร็จ: %v", err)
	}

	got := absRecords(t, db, sess.ID)
	if got[absCoachA] != models.AttendanceStatusPresent {
		t.Fatalf("โค้ชที่สแกนแล้วต้องคงสถานะ present ห้ามถูกทับเป็น absent (ได้ %q)", got[absCoachA])
	}
	if got[absCoachB] != models.AttendanceStatusAbsent {
		t.Fatalf("โค้ชที่มีตารางงานแต่ไม่สแกน ต้องถูกมาร์ค absent (ได้ %q)", got[absCoachB])
	}
	if len(got) != 2 {
		t.Fatalf("ต้องมีบันทึก 2 แถวเท่านั้น แต่ได้ %d", len(got))
	}
}

// โค้ชที่ไม่มีตารางงานของคาบนี้ ต้องไม่ถูกมาร์คอะไรเลย
func TestMarkCoachAbsenteesIgnoresCoachesWithoutSchedule(t *testing.T) {
	db := newAbsenteeDB(t)
	const day = "2026-05-11"
	mustCreate(t, db, &models.Package{Model: gorm.Model{ID: 1}, SessionsCount: 8, CourseID: 1})
	seedAbsCoach(t, db, absCoachA)
	seedAbsCoach(t, db, absCoachB)

	sess := absSession(t, db, day, "10:00", "12:00", 1)
	absWS(t, db, absCoachA, day, "10:00", "12:00", 1)
	// absCoachB ไม่มีตารางงานของคาบนี้

	if err := NewAttendanceService(db).markCoachAbsentees(db, &sess, nil, time.Now()); err != nil {
		t.Fatalf("มาร์คขาดงานไม่สำเร็จ: %v", err)
	}

	got := absRecords(t, db, sess.ID)
	if _, marked := got[absCoachB]; marked {
		t.Fatalf("โค้ชที่ไม่ได้ถูกมอบหมายคาบนี้ ต้องไม่ถูกมาร์คอะไรเลย")
	}
}

// ─── 2. ต้องไม่ข้ามคาบ — มาร์คเฉพาะคาบของรอบนั้น ───────────────────────────

// ⚠️ โค้ชคนเดียวสอนสองคาบในวันเดียวกันได้ การปิดรอบคาบเช้าต้องไม่ไปแตะคาบบ่าย
// (เป็นอาการเดียวกับบั๊ก "absent แถวเดียวตัดเงินทุกคาบของวันนั้น")
func TestMarkCoachAbsenteesDoesNotTouchOtherSlots(t *testing.T) {
	db := newAbsenteeDB(t)
	const day = "2026-05-18"
	mustCreate(t, db, &models.Package{Model: gorm.Model{ID: 1}, SessionsCount: 8, CourseID: 1})
	seedAbsCoach(t, db, absCoachA)

	seedAbsCoach(t, db, absCoachB)

	morning := absSession(t, db, day, "10:00", "12:00", 1)
	afternoon := absSession(t, db, day, "14:00", "16:00", 1)
	absWS(t, db, absCoachA, day, "10:00", "12:00", 1) // สอนเช้าอย่างเดียว
	absWS(t, db, absCoachB, day, "14:00", "16:00", 1) // สอนบ่ายอย่างเดียว

	// ปิดเฉพาะรอบเช้า
	if err := NewAttendanceService(db).markCoachAbsentees(db, &morning, nil, time.Now()); err != nil {
		t.Fatalf("มาร์คขาดงานไม่สำเร็จ: %v", err)
	}

	got := absRecords(t, db, morning.ID)
	if got[absCoachA] != models.AttendanceStatusAbsent {
		t.Fatalf("โค้ชของคาบเช้าต้องถูกมาร์ค absent แต่ได้ %q", got[absCoachA])
	}
	// ⚠️ จุดสำคัญ — โค้ชคาบบ่ายต้องไม่ติดร่างแหไปด้วย
	// ถ้าการหาตารางงานไม่กรองเวลา คนที่สอนบ่ายจะโดนมาร์คขาดงานทั้งที่คาบยังไม่เริ่ม
	if st, marked := got[absCoachB]; marked {
		t.Fatalf("โค้ชที่สอนคาบบ่ายต้องไม่ถูกมาร์คตอนปิดรอบเช้า แต่ได้ %q", st)
	}
	if len(absRecords(t, db, afternoon.ID)) != 0 {
		t.Fatalf("คาบบ่ายยังไม่ถูกปิดรอบ ต้องไม่มีบันทึกอะไรเลย")
	}
}

// ─── 3. ปิดรอบซ้ำต้องไม่สร้างแถวซ้ำ ──────────────────────────────────────────

// ด่านจริงของเรื่องนี้คือ unique index (coach_id, attendance_session_id)
// โค้ดฝั่ง go แค่ข้ามคนที่เช็คชื่อแล้วเพื่อไม่ให้ยิง insert เปล่า ๆ
// ถ้าลบด่านฝั่ง go ออก เทสยังผ่านเพราะ DB กันไว้ให้ — ห้ามลบ index ตัวนี้
func TestMarkCoachAbsenteesIsIdempotent(t *testing.T) {
	db := newAbsenteeDB(t)
	const day = "2026-05-25"
	mustCreate(t, db, &models.Package{Model: gorm.Model{ID: 1}, SessionsCount: 8, CourseID: 1})
	seedAbsCoach(t, db, absCoachA)

	sess := absSession(t, db, day, "10:00", "12:00", 1)
	absWS(t, db, absCoachA, day, "10:00", "12:00", 1)

	svc := NewAttendanceService(db)
	for i := 0; i < 2; i++ {
		if err := svc.markCoachAbsentees(db, &sess, nil, time.Now()); err != nil {
			t.Fatalf("มาร์คขาดงานรอบที่ %d ไม่สำเร็จ: %v", i+1, err)
		}
	}

	var n int64
	db.Model(&models.CoachAttendance{}).Where("attendance_session_id = ?", sess.ID).Count(&n)
	if n != 1 {
		t.Fatalf("ต้องมีบันทึกแถวเดียว แต่ได้ %d — แถวซ้ำแปลว่าปิดรอบสองครั้งแล้วข้อมูลเพี้ยน", n)
	}
}

// ─── 4. ผลต่อค่าจ้าง — ปลายทางที่แท้จริงของฟังก์ชันนี้ ──────────────────────

// ⚠️ นี่คือเหตุผลที่ฟังก์ชันนี้สำคัญ: แถว absent = ไม่ได้เงิน
func TestMarkCoachAbsenteesRemovesPayForAbsentCoachOnly(t *testing.T) {
	db := newAbsenteeDB(t)
	const day = "2026-06-01"
	mustCreate(t, db, &models.Package{Model: gorm.Model{ID: 1}, SessionsCount: 8, CourseID: 1})
	seedAbsCoach(t, db, absCoachA)
	seedAbsCoach(t, db, absCoachB)

	sess := absSession(t, db, day, "10:00", "12:00", 1)
	absWS(t, db, absCoachA, day, "10:00", "12:00", 1)
	absWS(t, db, absCoachB, day, "10:00", "12:00", 1)

	// A มาสอนจริง (สแกนแล้ว) · B ไม่มา
	mustCreate(t, db, &models.CoachAttendance{
		CoachID: absCoachA, AttendanceSessionID: sess.ID,
		WorkDate: time.Now(), CheckInTime: time.Now(),
		Status: models.AttendanceStatusPresent, IsScheduled: true,
	})

	svc := NewAttendanceService(db)
	if err := svc.markCoachAbsentees(db, &sess, nil, time.Now()); err != nil {
		t.Fatalf("มาร์คขาดงานไม่สำเร็จ: %v", err)
	}
	// ปิดรอบเพื่อให้เข้าเงื่อนไขการคิดเงิน
	if err := db.Model(&models.AttendanceSession{}).Where("id = ?", sess.ID).
		Update("status", models.AttendanceSessionClosed).Error; err != nil {
		t.Fatalf("ปิดรอบไม่สำเร็จ: %v", err)
	}

	payA, err := ComputeCoachPayroll(db, absCoachA, time.Now())
	if err != nil {
		t.Fatalf("คิดค่าจ้างโค้ช A ไม่สำเร็จ: %v", err)
	}
	if payA.SessionsDone != 1 || payA.Expected != 300 {
		t.Fatalf("โค้ชที่มาสอนต้องได้เงิน 1 คาบ 300 บาท แต่ได้ %d คาบ %.2f บาท",
			payA.SessionsDone, payA.Expected)
	}

	payB, err := ComputeCoachPayroll(db, absCoachB, time.Now())
	if err != nil {
		t.Fatalf("คิดค่าจ้างโค้ช B ไม่สำเร็จ: %v", err)
	}
	if payB.SessionsDone != 0 || payB.Expected != 0 {
		t.Fatalf("โค้ชที่ถูกมาร์คขาดงานต้องไม่ได้เงิน แต่ได้ %d คาบ %.2f บาท",
			payB.SessionsDone, payB.Expected)
	}
}
