package services

import (
	"testing"
	"time"

	"CPE-691015/internal/models"

	"gorm.io/gorm"
)

// เทสชุดนี้คุมกติกา "คลาสเดียวกันคืออะไร" ให้ทุกส่วนของระบบตอบตรงกัน
//
// ─── ที่มา ───
//
// โรงเรียนขายคอร์สเดียวกันเป็นหลาย package (เช่น 8 ครั้ง กับ 12 ครั้ง)
// นักเรียนสองกลุ่มเรียนพร้อมกัน ห้องเดียว เวลาเดียว โค้ชคนเดียวสอน
// = สอน 1 ครั้ง ต้องได้เงิน 1 คาบ
//
// ระบบจึงต้องรู้ว่า "หลาย package ที่ course + วัน + เวลา ตรงกัน = คลาสเดียว"
// ซึ่งมีสองที่ที่ต้องตอบเหมือนกัน แต่เคยตอบคนละแบบ:
//
//	classScheduleScope   (หาว่าใครสอนคาบนี้)  → course + วัน + เวลา
//	taughtScheduleScope  (นับคาบเพื่อจ่ายเงิน) → package_id
//
// ตราบใดที่ยังใช้คนละกติกา จะมีเคสที่หน้าจอบอกว่าโค้ชสอน แต่ระบบไม่จ่ายเงิน

func newClassMergeTestDB(t *testing.T) *gorm.DB {
	return newTestDB(t, &models.WorkSchedule{}, &models.AttendanceSession{},
		&models.CoachAttendance{}, &models.Package{}, &models.PackageSchedule{})
}

// mergedClass คือคลาสหนึ่งคาบที่มีหลาย package เรียนพร้อมกัน
type mergedClass struct {
	date       string
	weekday    string
	courseID   uint
	packageIDs []uint
	anchor     uint
}

// seedMergedClass สร้าง package หลายตัวที่เรียน course/วัน/เวลา เดียวกัน
func seedMergedClass(t *testing.T, db *gorm.DB, date, start, end string, sessionCounts ...uint) mergedClass {
	t.Helper()

	d, err := time.Parse("2006-01-02", date)
	if err != nil {
		t.Fatalf("วันที่ทดสอบไม่ถูกต้อง: %v", err)
	}
	weekday := d.Weekday().String()

	const courseID = uint(1)
	ids := make([]uint, 0, len(sessionCounts))
	for _, n := range sessionCounts {
		pkg := models.Package{SessionsCount: n, CourseID: courseID}
		mustCreate(t, db, &pkg)
		mustCreate(t, db, &models.PackageSchedule{
			PackageID: pkg.ID, DayOfWeek: models.DayOfWeek(weekday),
			StartTime: start, EndTime: end,
		})
		ids = append(ids, pkg.ID)
	}

	anchor, err := classAnchorPackageID(db, courseID, weekday, start, end)
	if err != nil || anchor == nil {
		t.Fatalf("หา anchor package ไม่ได้: %v", err)
	}

	return mergedClass{date: date, weekday: weekday, courseID: courseID, packageIDs: ids, anchor: *anchor}
}

// assignCoach จำลองการที่แอดมินมอบหมายโค้ชให้คาบนี้ 1 ครั้ง (ได้ตารางงาน 1 แถว)
func assignCoach(t *testing.T, db *gorm.DB, c mergedClass, coachID uint, start, end string, packageID uint) {
	t.Helper()
	pkg := packageID
	mustCreate(t, db, &models.WorkSchedule{
		CoachID: coachID, CourseID: c.courseID, PackageID: &pkg,
		Date: c.date, StartTime: start, EndTime: end,
	})
	normalizeScheduleDate(t, db, c.date)
}

// openClosedSession เปิดรอบเช็คชื่อของคาบนี้แล้วปิดทันที (หลักฐานว่าคาบเกิดขึ้นจริง)
func openClosedSession(t *testing.T, db *gorm.DB, c mergedClass, packageID uint, start, end string) models.AttendanceSession {
	t.Helper()
	d, _ := time.Parse("2006-01-02", c.date)

	sess := models.AttendanceSession{
		PackageID: packageID, SessionDate: d,
		Status: models.AttendanceSessionClosed, OpenedAt: time.Now(), OpenedByUserID: 1,
		ScheduleStartTime: start, ScheduleEndTime: end,
	}
	mustCreate(t, db, &sess)

	// sqlite เก็บ time.Time เป็น "...T00:00:00Z" ส่วน string เก็บ "YYYY-MM-DD"
	// สองรูปแบบนี้ join กันไม่ติดทั้งที่เป็นวันเดียวกัน (postgres เป็น date ทั้งคู่จึงไม่มีปัญหา)
	// จับให้เป็นข้อความเดียวกันก่อน เพื่อจำลองพฤติกรรมของฐานจริง
	if err := db.Exec(`UPDATE attendance_sessions SET session_date = ? WHERE id = ?`,
		c.date, sess.ID).Error; err != nil {
		t.Fatalf("ปรับรูปแบบวันที่ของรอบเช็คชื่อไม่สำเร็จ: %v", err)
	}
	return sess
}

func normalizeScheduleDate(t *testing.T, db *gorm.DB, date string) {
	t.Helper()
	if err := db.Exec(`UPDATE work_schedules SET date = ? WHERE date <> ?`, date, date).Error; err != nil {
		t.Fatalf("ปรับรูปแบบวันที่ของตารางงานไม่สำเร็จ: %v", err)
	}
}

// paidSessionCount นับจำนวนคาบที่โค้ชคนนี้จะได้เงิน
func paidSessionCount(t *testing.T, db *gorm.DB, coachID uint) int64 {
	t.Helper()
	var n int64
	if err := taughtScheduleScope(db, coachID).Count(&n).Error; err != nil {
		t.Fatalf("นับคาบที่ได้เงินไม่สำเร็จ: %v", err)
	}
	return n
}

// ─────────────────────────────────────────────────────────────────────────────

// คลาสที่รวมสอง package = สอน 1 ครั้ง ต้องได้เงิน 1 คาบ
func TestMergedClassPaysOnce(t *testing.T) {
	db := newClassMergeTestDB(t)
	c := seedMergedClass(t, db, "2026-01-05", "18:00", "20:00", 8, 12)

	assignCoach(t, db, c, 7, "18:00", "20:00", c.anchor)
	openClosedSession(t, db, c, c.anchor, "18:00", "20:00")

	if got := paidSessionCount(t, db, 7); got != 1 {
		t.Fatalf("คลาสรวมสองแพ็กเกจต้องได้เงิน 1 คาบ แต่ได้ %d", got)
	}
}

// ⭐ สอนคนละเวลาในวันเดียวกัน = สอนจริง 2 รอบ ต้องได้เงิน 2 คาบ
//
// ด่านกันแก้เกินเลย — ถ้าใครเผลอไปยุบด้วย DISTINCT บนวันที่ เทสนี้จะพังทันที
func TestTwoSlotsSameDayPayTwice(t *testing.T) {
	db := newClassMergeTestDB(t)

	early := seedMergedClass(t, db, "2026-01-05", "16:00", "18:00", 8)
	late := seedMergedClass(t, db, "2026-01-05", "19:00", "21:00", 8)

	assignCoach(t, db, early, 7, "16:00", "18:00", early.anchor)
	assignCoach(t, db, late, 7, "19:00", "21:00", late.anchor)
	openClosedSession(t, db, early, early.anchor, "16:00", "18:00")
	openClosedSession(t, db, late, late.anchor, "19:00", "21:00")

	if got := paidSessionCount(t, db, 7); got != 2 {
		t.Fatalf("สอนสองรอบคนละเวลาต้องได้เงิน 2 คาบ แต่ได้ %d", got)
	}
}

// โค้ชเช็คชื่อที่รอบของ package พี่น้อง ต้องไม่สร้างตารางงานแถวใหม่
//
// เคยเป็นทางที่ทำให้จ่ายสองเท่า: ค้นด้วย (coach, package, date) แล้วไม่เจอแถวของ
// package ตัวแทน จึงสร้างใหม่ให้ กลายเป็นวันเดียวมีสองแถว
func TestScanAtSiblingPackageDoesNotDuplicateSchedule(t *testing.T) {
	db := newClassMergeTestDB(t)
	c := seedMergedClass(t, db, "2026-01-05", "18:00", "20:00", 8, 12)

	assignCoach(t, db, c, 7, "18:00", "20:00", c.anchor)

	sibling := c.packageIDs[len(c.packageIDs)-1]
	if sibling == c.anchor {
		t.Fatal("เทสนี้ต้องใช้ package ที่ไม่ใช่ตัวแทน")
	}
	sess := openClosedSession(t, db, c, sibling, "18:00", "20:00")

	svc := &AttendanceService{db: db}
	existed, err := svc.ensureCoachWorkSchedule(db, 7, &sess)
	if err != nil {
		t.Fatalf("ensureCoachWorkSchedule ล้มเหลว: %v", err)
	}
	if !existed {
		t.Error("ต้องเจอตารางงานเดิมของคลาสนี้ ไม่ใช่สร้างแถวใหม่")
	}

	var rows int64
	db.Model(&models.WorkSchedule{}).Where("coach_id = ?", 7).Count(&rows)
	if rows != 1 {
		t.Fatalf("ตารางงานต้องมีแถวเดียว แต่มี %d แถว (= จ่ายเงินซ้ำ)", rows)
	}
}

// ⭐ ลบ package ที่เป็นตัวแทนของคลาสทิ้ง แล้วโค้ชต้องยังได้เงินเหมือนเดิม
//
// anchor คือ package id ที่ต่ำสุดที่ยังไม่ถูกลบ พอ package ตัวแทนถูกลบ
// anchor จะเลื่อนไปตัวถัดไป แต่ตารางงานที่ assign ไว้แล้วยังชี้ตัวเก่าอยู่
// ถ้าการคิดเงินยังจับคู่ด้วย package_id จะหาคู่ไม่เจอ → โค้ชได้เงิน 0 แบบไม่มี error
func TestPayrollSurvivesAnchorPackageDeletion(t *testing.T) {
	db := newClassMergeTestDB(t)
	c := seedMergedClass(t, db, "2026-01-05", "18:00", "20:00", 8, 12)

	// แอดมินมอบหมายโค้ชไว้ตอนที่ตัวแทนยังเป็น package เดิม
	assignCoach(t, db, c, 7, "18:00", "20:00", c.anchor)

	// แล้วเลิกขายแพ็กเกจตัวแทนนั้น
	if err := db.Delete(&models.Package{}, c.anchor).Error; err != nil {
		t.Fatalf("ลบแพ็กเกจไม่สำเร็จ: %v", err)
	}

	// รอบเช็คชื่อที่เปิดหลังจากนั้นจะใช้ตัวแทนใหม่
	newAnchor, err := classAnchorPackageID(db, c.courseID, c.weekday, "18:00", "20:00")
	if err != nil || newAnchor == nil {
		t.Fatalf("หา anchor ใหม่ไม่ได้: %v", err)
	}
	if *newAnchor == c.anchor {
		t.Fatal("anchor ควรเลื่อนไป package ตัวถัดไปหลังลบ")
	}
	openClosedSession(t, db, c, *newAnchor, "18:00", "20:00")

	if got := paidSessionCount(t, db, 7); got != 1 {
		t.Fatalf("โค้ชสอนคาบนี้จริง ต้องได้เงิน 1 คาบ แต่ได้ %d", got)
	}
}
