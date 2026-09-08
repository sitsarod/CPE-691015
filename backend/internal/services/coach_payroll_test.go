package services

import (
	"testing"
	"time"

	"CPE-691015/internal/models"

	"gorm.io/gorm"
)

// เทสชุดนี้คุมกติกาที่ตัดสินว่า "โค้ชได้เงินกี่คาบ" (taughtScheduleScope)
//
// เป็นจุดที่ผิดแล้วเสียเงินจริงทุกครั้ง และเดิมไม่มีเทสคุมเลยแม้แต่ตัวเดียว
//
// ─── บั๊กที่เคยเกิด ───
//
// การนับคาบดูแค่ว่า "มีตารางงาน + รอบเช็คชื่อปิดแล้ว" โดยไม่ดูเลยว่าโค้ชมาไหม
// โค้ชที่ระบบมาร์คว่าขาดงานจึงยังได้ค่าจ้างเต็มทุกครั้ง
//
// ─── กติกาปัจจุบัน ───
//
//	มีแถว absent ชัดเจน  → ไม่นับ (ไม่ได้เงิน)
//	มีแถว present        → นับ
//	ไม่มีแถวเลย          → นับ (ดูเหตุผล "ผ่อนปรน" ที่ taughtSessionDates)

func newPayrollTestDB(t *testing.T) *gorm.DB {
	return newTestDB(t, &models.WorkSchedule{}, &models.AttendanceSession{}, &models.CoachAttendance{})
}

const payrollDay = "2026-01-05"

// seedClosedSession สร้างรอบเช็คชื่อที่ปิดแล้ว 1 รอบ พร้อมตารางงานของโค้ช แล้วคืน session id
//
// ⚠️ ทำไมต้อง UPDATE วันที่ด้วย raw SQL ตามหลัง
//
// query ค่าจ้าง join ด้วย a.session_date = work_schedules.date ซึ่งบนฐานจริง
// (postgres) เป็นคอลัมน์ชนิด date ทั้งคู่ จึงเทียบกันได้ตรง ๆ
//
// แต่ sqlite ที่ใช้ในเทสไม่มีชนิด date จริง มันเก็บตามที่ driver ส่งมา:
// WorkSchedule.Date เป็น string จึงได้ "2026-01-05" ส่วน AttendanceSession.SessionDate
// เป็น time.Time จึงได้ "2026-01-05 00:00:00+00:00" — คนละข้อความ join จึงไม่ติด
//
// จับให้เป็นข้อความเดียวกันก่อน เพื่อจำลองพฤติกรรมของ postgres
// (เป็นข้อจำกัดของ sqlite ล้วน ๆ ไม่ใช่บั๊กในโค้ดจริง)
func seedClosedSession(t *testing.T, db *gorm.DB, coachID uint, packageID uint) uint {
	t.Helper()

	day, _ := time.Parse("2006-01-02", payrollDay)
	session := models.AttendanceSession{
		PackageID:      packageID,
		SessionDate:    day,
		Status:         models.AttendanceSessionClosed,
		OpenedAt:       time.Now(),
		OpenedByUserID: 1,
	}
	mustCreate(t, db, &session)

	if err := db.Exec(`UPDATE attendance_sessions SET session_date = ? WHERE id = ?`,
		payrollDay, session.ID).Error; err != nil {
		t.Fatalf("ปรับรูปแบบวันที่ให้ตรงกันไม่สำเร็จ: %v", err)
	}

	pkg := packageID
	mustCreate(t, db, &models.WorkSchedule{
		CoachID: coachID, CourseID: 1, PackageID: &pkg,
		Date: payrollDay, StartTime: "09:00", EndTime: "10:00",
	})

	return session.ID
}

// markCoach บันทึกสถานะเช็คชื่อของโค้ชในรอบที่ระบุ
func markCoach(t *testing.T, db *gorm.DB, coachID, sessionID uint, status models.AttendanceStatus) {
	t.Helper()
	mustCreate(t, db, &models.CoachAttendance{
		CoachID:             coachID,
		AttendanceSessionID: sessionID,
		WorkDate:            time.Now(),
		CheckInTime:         time.Now(),
		Status:              status,
		IsScheduled:         true,
	})
}

// paidSessions นับจำนวนคาบที่โค้ชคนนี้จะได้เงิน
func paidSessions(t *testing.T, db *gorm.DB, coachID uint) int64 {
	t.Helper()
	var n int64
	if err := taughtScheduleScope(db, coachID).Count(&n).Error; err != nil {
		t.Fatalf("นับคาบที่ได้เงินไม่สำเร็จ: %v", err)
	}
	return n
}

// ─────────────────────────────────────────────────────────────────────────────

// โค้ชมาสอนจริง (เช็คชื่อไว้ว่า present) ต้องได้เงิน
//
// ด่านกันแก้เกินเลย — ถ้าเทสนี้พังแปลว่าเราตัดเงินคนที่มาทำงานจริง
// ซึ่งแย่กว่าบั๊กเดิมเสียอีก
func TestPresentCoachIsPaid(t *testing.T) {
	db := newPayrollTestDB(t)
	sessionID := seedClosedSession(t, db, 7, 3)
	markCoach(t, db, 7, sessionID, models.AttendanceStatusPresent)

	if got := paidSessions(t, db, 7); got != 1 {
		t.Fatalf("โค้ชที่มาสอนต้องได้เงิน 1 คาบ แต่ได้ %d", got)
	}
}

// ⭐ เทสหลักของบั๊กนี้ — โค้ชที่ถูกมาร์คว่าขาดงานต้องไม่ได้เงิน
func TestAbsentCoachIsNotPaid(t *testing.T) {
	db := newPayrollTestDB(t)
	sessionID := seedClosedSession(t, db, 7, 3)
	markCoach(t, db, 7, sessionID, models.AttendanceStatusAbsent)

	if got := paidSessions(t, db, 7); got != 0 {
		t.Fatalf("โค้ชที่ขาดงานต้องไม่ได้เงิน แต่ยังนับให้ %d คาบ", got)
	}
}

// ไม่มีแถวเช็คชื่อเลย = ยังนับให้ (กติกาแบบผ่อนปรน)
//
// คุ้มครองข้อมูลเก่าที่ปิดรอบไปก่อนระบบเช็คชื่อโค้ชจะมีผลบังคับ
// ถ้าเทสนี้พัง แปลว่ายอดค่าจ้างย้อนหลังทั้งระบบจะเปลี่ยนทันทีที่ deploy
func TestSessionWithoutAttendanceRecordIsStillPaid(t *testing.T) {
	db := newPayrollTestDB(t)
	seedClosedSession(t, db, 7, 3)

	if got := paidSessions(t, db, 7); got != 1 {
		t.Fatalf("คาบเก่าที่ไม่มีข้อมูลเช็คชื่อต้องยังได้เงิน แต่ได้ %d", got)
	}
}

// แอดมินแก้ absent → present ย้อนหลัง แล้วโค้ชต้องกลับมาได้เงิน
//
// นี่คือทางออกของเคส "มาสอนจริงแต่ลืมสแกน" ถ้าเทสนี้พัง แปลว่าโค้ชที่ลืมสแกน
// จะไม่มีทางได้เงินคืนเลย ซึ่งทำให้กติกา "ขาดงาน = ไม่ได้เงิน" ใช้จริงไม่ได้
func TestAdminCanRestorePayByFixingStatus(t *testing.T) {
	db := newPayrollTestDB(t)
	sessionID := seedClosedSession(t, db, 7, 3)
	markCoach(t, db, 7, sessionID, models.AttendanceStatusAbsent)

	if got := paidSessions(t, db, 7); got != 0 {
		t.Fatalf("ก่อนแก้ต้องไม่ได้เงิน แต่ได้ %d", got)
	}

	// แอดมินแก้สถานะย้อนหลัง (สิ่งที่ UpdateCoachAttendanceStatus ทำ)
	if err := db.Model(&models.CoachAttendance{}).
		Where("coach_id = ? AND attendance_session_id = ?", 7, sessionID).
		Update("status", models.AttendanceStatusPresent).Error; err != nil {
		t.Fatalf("แก้สถานะไม่สำเร็จ: %v", err)
	}

	if got := paidSessions(t, db, 7); got != 1 {
		t.Fatalf("แก้เป็นมาสอนแล้วต้องได้เงินคืน แต่ได้ %d", got)
	}
}

// รอบที่ยังไม่ปิดต้องไม่ถูกนับ — กติกาเดิมที่ต้องไม่หลุดไปตอนแก้
func TestOpenSessionIsNotPaidYet(t *testing.T) {
	db := newPayrollTestDB(t)

	day, _ := time.Parse("2006-01-02", payrollDay)
	session := models.AttendanceSession{
		PackageID: 3, SessionDate: day,
		Status: models.AttendanceSessionOpen, OpenedAt: time.Now(), OpenedByUserID: 1,
	}
	mustCreate(t, db, &session)
	db.Exec(`UPDATE attendance_sessions SET session_date = ? WHERE id = ?`, payrollDay, session.ID)

	pkg := uint(3)
	mustCreate(t, db, &models.WorkSchedule{
		CoachID: 7, CourseID: 1, PackageID: &pkg,
		Date: payrollDay, StartTime: "09:00", EndTime: "10:00",
	})
	markCoach(t, db, 7, session.ID, models.AttendanceStatusPresent)

	if got := paidSessions(t, db, 7); got != 0 {
		t.Fatalf("รอบที่ยังไม่ปิดต้องยังไม่ได้เงิน แต่นับให้ %d คาบ", got)
	}
}

// การขาดงานของโค้ชคนหนึ่ง ต้องไม่ไปตัดเงินโค้ชอีกคนที่สอนรอบเดียวกัน
//
// จุดที่พลาดได้ง่ายมากถ้าเขียน NOT EXISTS แล้วลืมผูก ca.coach_id
// กับแถวที่กำลังพิจารณา — จะกลายเป็น "รอบนี้มีใครขาดสักคน แล้วทุกคนอดหมด"
func TestAnotherCoachAbsenceDoesNotAffectMe(t *testing.T) {
	db := newPayrollTestDB(t)
	sessionID := seedClosedSession(t, db, 7, 3)

	// โค้ชคนที่สองสอนรอบเดียวกันแต่ขาดงาน
	pkg := uint(3)
	mustCreate(t, db, &models.WorkSchedule{
		CoachID: 8, CourseID: 1, PackageID: &pkg,
		Date: payrollDay, StartTime: "09:00", EndTime: "10:00",
	})
	markCoach(t, db, 8, sessionID, models.AttendanceStatusAbsent)
	markCoach(t, db, 7, sessionID, models.AttendanceStatusPresent)

	if got := paidSessions(t, db, 7); got != 1 {
		t.Errorf("โค้ชที่มาสอนต้องได้เงินแม้เพื่อนร่วมรอบจะขาด แต่ได้ %d", got)
	}
	if got := paidSessions(t, db, 8); got != 0 {
		t.Errorf("โค้ชที่ขาดต้องไม่ได้เงิน แต่ได้ %d", got)
	}
}
