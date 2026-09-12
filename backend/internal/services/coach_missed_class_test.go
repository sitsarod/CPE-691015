package services

import (
	"errors"
	"strings"
	"testing"
	"time"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"

	"gorm.io/gorm"
)

// เทสชุดนี้คุมช่องโหว่ "คาบที่สอนไปแล้วแต่ไม่เคยมีรอบเช็คชื่อ"
//
// ─── ที่มา ───
//
// หลังแก้บั๊ก "โค้ชขาดงานยังได้เงินเต็ม" การนับค่าจ้างผูกกับรอบเช็คชื่อเต็มตัว
// แต่รอบเช็คชื่อเปิดได้เฉพาะตอนอยู่ในคาบจริง (±30 นาที) และเปิดย้อนหลังไม่ได้เลย
//
// ผลคือถ้าแอดมินลืมเปิดรอบ โค้ชที่สอนจริงจะได้ 0 บาทตลอดไป โดยไม่มี error
// ให้ใครเห็น — เงินหายเงียบ ๆ ซึ่งแย่กว่าตัวเลขผิดที่มองเห็นได้
//
// ─── สิ่งที่เทสชุดนี้ตรึงไว้ ───
//
//	1. คาบที่ไม่มีรอบต้องโผล่ในรายการค้าง ไม่ใช่หายไปเฉย ๆ
//	2. เคลียร์ว่า "มาสอน" แล้วต้องได้เงินคืน
//	3. เคลียร์ว่า "ไม่ได้มาสอน" แล้วต้องไม่ได้เงิน แต่ต้องหลุดจากรายการค้าง
//	4. ห้ามเคลียร์แบบระบุโค้ชไม่ครบ (คนที่ตกหล่นจะได้เงินฟรี)
//	5. เคลียร์ซ้ำต้องไม่ทำให้ได้เงินสองเท่า
//	6. การเคลียร์ต้องไม่แตะประวัติของนักเรียนเลย

const (
	missedDay   = "2026-01-05" // จันทร์ · อยู่ในอดีตแน่นอน
	missedStart = "18:00"
	missedEnd   = "20:00"

	missedAdminID = uint(9)
	missedCoachA  = uint(71)
	missedCoachB  = uint(72)
)

func newMissedClassTestDB(t *testing.T) *gorm.DB {
	return newTestDB(t,
		&models.WorkSchedule{}, &models.AttendanceSession{}, &models.CoachAttendance{},
		&models.Package{}, &models.PackageSchedule{}, &models.Course{},
		&models.Coach{}, &models.User{}, &models.Notification{}, &models.StudentAttendance{},
	)
}

// normalizeSessionDates จับ session_date ของทุกรอบให้เป็นข้อความ "YYYY-MM-DD"
//
// ⚠️ เป็นข้อจำกัดของ sqlite ล้วน ๆ ไม่ใช่บั๊กในโค้ดจริง
// AttendanceSession.SessionDate เป็น time.Time ส่วน WorkSchedule.Date เป็น string
// บน postgres ทั้งคู่เป็นคอลัมน์ชนิด date จึงเทียบกันได้ แต่ sqlite เก็บตามที่ driver
// ส่งมา จึงได้ "...T00:00:00Z" กับ "2026-01-05" ซึ่ง join กันไม่ติด
//
// ต้องเรียกหลังทุกครั้งที่ "โค้ดจริง" สร้างรอบขึ้นมาเอง (ResolveMissedClass)
func normalizeSessionDates(t *testing.T, db *gorm.DB, date string) {
	t.Helper()
	if err := db.Exec(`UPDATE attendance_sessions SET session_date = ? WHERE session_date <> ?`,
		date, date).Error; err != nil {
		t.Fatalf("ปรับรูปแบบวันที่ของรอบเช็คชื่อไม่สำเร็จ: %v", err)
	}
}

// unresolvedCount นับคาบที่ยังไม่มีรอบเช็คชื่อของโค้ชคนหนึ่ง
func unresolvedCount(t *testing.T, db *gorm.DB, coachID uint) int64 {
	t.Helper()
	var n int64
	if err := unresolvedScheduleScope(db, todayForTest()).
		Where("work_schedules.coach_id = ?", coachID).
		Count(&n).Error; err != nil {
		t.Fatalf("นับคาบที่ค้างไม่สำเร็จ: %v", err)
	}
	return n
}

func todayForTest() string {
	return time.Now().Format("2006-01-02")
}

// seedMissedClass สร้างคลาสในอดีตที่มีโค้ชถูกมอบหมาย แต่ไม่มีรอบเช็คชื่อเลย
func seedMissedClass(t *testing.T, db *gorm.DB, coachIDs ...uint) mergedClass {
	t.Helper()
	c := seedMergedClass(t, db, missedDay, missedStart, missedEnd, 8)
	for _, id := range coachIDs {
		assignCoach(t, db, c, id, missedStart, missedEnd, c.anchor)
	}
	return c
}

// seedCoachAccount สร้างบัญชีโค้ชจริง เพื่อให้เส้นทางแจ้งเตือนถูกเดินด้วย
func seedCoachAccount(t *testing.T, db *gorm.DB, coachID uint, nickname string) uint {
	t.Helper()
	user := models.User{FirstName: nickname, LastName: "ทดสอบ", Email: nickname + "@example.test"}
	mustCreate(t, db, &user)

	coach := models.Coach{Model: gorm.Model{ID: coachID}, UserID: user.ID, Nickname: nickname}
	mustCreate(t, db, &coach)
	return user.ID
}

func resolve(db *gorm.DB, wsID uint, decisions ...dto.ResolveMissedClassCoachReq) (*dto.ResolveMissedClassResultDTO, error) {
	return NewAttendanceService(db).ResolveMissedClass(dto.ResolveMissedClassRequest{
		WorkScheduleID: wsID,
		Coaches:        decisions,
	}, missedAdminID)
}

// ─── 1. ช่องว่างต้องมองเห็นได้ ────────────────────────────────────────────────

func TestMissedClassIsVisibleWhenNoSessionEverOpened(t *testing.T) {
	db := newMissedClassTestDB(t)
	seedMissedClass(t, db, missedCoachA)

	if n := paidSessionCount(t, db, missedCoachA); n != 0 {
		t.Fatalf("ยังไม่มีรอบเช็คชื่อ จึงยังไม่ควรได้เงิน แต่ได้ %d คาบ", n)
	}

	items, err := NewAttendanceService(db).ListMissedClasses()
	if err != nil {
		t.Fatalf("ดึงรายการคาบที่ค้างไม่สำเร็จ: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("คาบที่ไม่มีรอบเช็คชื่อต้องโผล่ในรายการค้าง 1 คลาส แต่ได้ %d", len(items))
	}

	got := items[0]
	if got.Date != missedDay || got.StartTime != missedStart || got.EndTime != missedEnd {
		t.Fatalf("รายละเอียดคาบไม่ตรง: %+v", got)
	}
	if len(got.Coaches) != 1 || got.Coaches[0].CoachID != missedCoachA {
		t.Fatalf("ต้องมีโค้ช #%d คนเดียวในคาบนี้ แต่ได้ %+v", missedCoachA, got.Coaches)
	}
}

// คาบที่มีรอบปิดแล้วต้องไม่โผล่ในรายการค้าง
//
// ⚠️ เป็นด่านคุมว่า taughtScheduleScope กับ unresolvedScheduleScope เป็นด้านตรงข้ามกันจริง
// ถ้าสองอันนี้หลุดจากกัน จะเกิดคาบที่ "ไม่ได้เงิน และไม่โผล่ในรายการค้าง" = เงินหายเงียบ
func TestClassWithClosedSessionIsNotListedAsMissed(t *testing.T) {
	db := newMissedClassTestDB(t)
	c := seedMissedClass(t, db, missedCoachA)
	openClosedSession(t, db, c, c.anchor, missedStart, missedEnd)

	if n := paidSessionCount(t, db, missedCoachA); n != 1 {
		t.Fatalf("มีรอบปิดแล้วและไม่ถูกมาร์คขาด ต้องได้เงิน 1 คาบ แต่ได้ %d", n)
	}
	if n := unresolvedCount(t, db, missedCoachA); n != 0 {
		t.Fatalf("คาบนี้เคลียร์แล้ว ต้องไม่ค้าง แต่ยังค้างอยู่ %d คาบ", n)
	}

	items, err := NewAttendanceService(db).ListMissedClasses()
	if err != nil {
		t.Fatalf("ดึงรายการคาบที่ค้างไม่สำเร็จ: %v", err)
	}
	if len(items) != 0 {
		t.Fatalf("ไม่ควรมีคาบค้าง แต่ได้ %d", len(items))
	}
}

// ─── 2-3. เคลียร์แล้วผลต้องตรงกับที่แอดมินตัดสิน ────────────────────────────

func TestResolveAsPresentRestoresPay(t *testing.T) {
	db := newMissedClassTestDB(t)
	seedCoachAccount(t, db, missedCoachA, "เอ")
	seedMissedClass(t, db, missedCoachA)

	items, _ := NewAttendanceService(db).ListMissedClasses()
	if len(items) != 1 {
		t.Fatalf("ต้องมีคาบค้าง 1 คลาส แต่ได้ %d", len(items))
	}

	res, err := resolve(db, items[0].WorkScheduleID,
		dto.ResolveMissedClassCoachReq{CoachID: missedCoachA, Status: "present"})
	if err != nil {
		t.Fatalf("เคลียร์คาบไม่สำเร็จ: %v", err)
	}
	if len(res.PresentCoachIDs) != 1 || res.PresentCoachIDs[0] != missedCoachA {
		t.Fatalf("ผลลัพธ์ควรบอกว่าโค้ช #%d มาสอน แต่ได้ %+v", missedCoachA, res)
	}

	normalizeSessionDates(t, db, missedDay)

	if n := paidSessionCount(t, db, missedCoachA); n != 1 {
		t.Fatalf("โค้ชสอนคาบนี้จริงและแอดมินยืนยันแล้ว ต้องได้เงิน 1 คาบ แต่ได้ %d", n)
	}
	if n := unresolvedCount(t, db, missedCoachA); n != 0 {
		t.Fatalf("เคลียร์แล้วต้องไม่ค้างอีก แต่ยังค้าง %d คาบ", n)
	}

	// โค้ชต้องรู้ว่ามีการบันทึกย้อนหลังเกิดขึ้นกับคาบของตัวเอง
	var notifs int64
	db.Model(&models.Notification{}).Where("type = ?", "coach_missed_class").Count(&notifs)
	if notifs != 1 {
		t.Fatalf("ต้องแจ้งเตือนโค้ช 1 ครั้ง แต่ได้ %d", notifs)
	}
}

func TestResolveAsAbsentDoesNotPayButClearsTheBacklog(t *testing.T) {
	db := newMissedClassTestDB(t)
	seedMissedClass(t, db, missedCoachA)

	items, _ := NewAttendanceService(db).ListMissedClasses()
	if _, err := resolve(db, items[0].WorkScheduleID,
		dto.ResolveMissedClassCoachReq{CoachID: missedCoachA, Status: "absent"}); err != nil {
		t.Fatalf("เคลียร์คาบไม่สำเร็จ: %v", err)
	}
	normalizeSessionDates(t, db, missedDay)

	if n := paidSessionCount(t, db, missedCoachA); n != 0 {
		t.Fatalf("แอดมินบันทึกว่าไม่ได้มาสอน ต้องไม่ได้เงิน แต่ได้ %d คาบ", n)
	}
	if n := unresolvedCount(t, db, missedCoachA); n != 0 {
		t.Fatalf("ตัดสินใจไปแล้วต้องไม่ค้างอีก ไม่งั้นแอดมินจะเจอคาบเดิมทุกวัน แต่ยังค้าง %d", n)
	}
}

// ─── 4. ห้ามเคลียร์แบบระบุโค้ชไม่ครบ ─────────────────────────────────────────

// ⚠️ ด่านนี้สำคัญกว่าที่เห็น
//
// กติกาการนับคาบคือ "ไม่มีแถว absent = ได้เงิน" การสร้างรอบขึ้นมาโดยไม่บันทึก
// สถานะของโค้ชคนใดคนหนึ่ง จึงเท่ากับจ่ายเงินให้เขาโดยไม่มีมนุษย์คนไหนตัดสินใจ
// ซึ่งคือบั๊กเดิม "โค้ชขาดงานยังได้เงินเต็ม" กลับมาทางประตูหลัง
func TestResolveRequiresEveryCoachInTheClass(t *testing.T) {
	db := newMissedClassTestDB(t)
	seedMissedClass(t, db, missedCoachA, missedCoachB)

	items, _ := NewAttendanceService(db).ListMissedClasses()
	if len(items) != 1 || len(items[0].Coaches) != 2 {
		t.Fatalf("ควรเป็นคลาสเดียวที่มีโค้ช 2 คน แต่ได้ %+v", items)
	}

	_, err := resolve(db, items[0].WorkScheduleID,
		dto.ResolveMissedClassCoachReq{CoachID: missedCoachA, Status: "present"})
	if !errors.Is(err, ErrMissedClassCoachSet) {
		t.Fatalf("ระบุโค้ชไม่ครบต้องถูกปฏิเสธ แต่ได้ error: %v", err)
	}

	// ต้องไม่มีอะไรถูกเขียนลงไปเลย
	var sessions int64
	db.Model(&models.AttendanceSession{}).Count(&sessions)
	if sessions != 0 {
		t.Fatalf("คำขอที่ถูกปฏิเสธต้องไม่สร้างรอบเช็คชื่อ แต่มี %d รอบ", sessions)
	}
	if n := paidSessionCount(t, db, missedCoachB); n != 0 {
		t.Fatalf("โค้ชที่ตกหล่นต้องไม่ได้เงิน แต่ได้ %d คาบ", n)
	}
}

func TestResolveRejectsCoachOutsideTheClass(t *testing.T) {
	db := newMissedClassTestDB(t)
	seedMissedClass(t, db, missedCoachA)

	items, _ := NewAttendanceService(db).ListMissedClasses()
	_, err := resolve(db, items[0].WorkScheduleID,
		dto.ResolveMissedClassCoachReq{CoachID: missedCoachA, Status: "present"},
		dto.ResolveMissedClassCoachReq{CoachID: missedCoachB, Status: "present"})
	if !errors.Is(err, ErrMissedClassCoachSet) {
		t.Fatalf("โค้ชที่ไม่ได้ถูกมอบหมายคาบนี้ต้องใส่เข้ามาไม่ได้ แต่ได้ error: %v", err)
	}
}

// ─── 5. ด่านเวลาและการเคลียร์ซ้ำ ─────────────────────────────────────────────

func TestResolveRejectsClassThatHasNotHappenedYet(t *testing.T) {
	db := newMissedClassTestDB(t)

	const future = "2099-01-05"
	c := seedMergedClass(t, db, future, missedStart, missedEnd, 8)
	pkg := c.anchor
	ws := models.WorkSchedule{
		CoachID: missedCoachA, CourseID: c.courseID, PackageID: &pkg,
		Date: future, StartTime: missedStart, EndTime: missedEnd,
	}
	mustCreate(t, db, &ws)

	if _, err := resolve(db, ws.ID,
		dto.ResolveMissedClassCoachReq{CoachID: missedCoachA, Status: "present"}); !errors.Is(err, ErrMissedClassNotDue) {
		t.Fatalf("คาบที่ยังไม่ถึงต้องเคลียร์ไม่ได้ แต่ได้ error: %v", err)
	}
}

func TestResolveTwiceDoesNotPayTwice(t *testing.T) {
	db := newMissedClassTestDB(t)
	seedMissedClass(t, db, missedCoachA)

	items, _ := NewAttendanceService(db).ListMissedClasses()
	wsID := items[0].WorkScheduleID

	if _, err := resolve(db, wsID,
		dto.ResolveMissedClassCoachReq{CoachID: missedCoachA, Status: "present"}); err != nil {
		t.Fatalf("เคลียร์ครั้งแรกไม่สำเร็จ: %v", err)
	}
	normalizeSessionDates(t, db, missedDay)

	_, err := resolve(db, wsID,
		dto.ResolveMissedClassCoachReq{CoachID: missedCoachA, Status: "present"})
	if !errors.Is(err, ErrMissedClassResolved) {
		t.Fatalf("เคลียร์ซ้ำต้องถูกปฏิเสธ แต่ได้ error: %v", err)
	}
	normalizeSessionDates(t, db, missedDay)

	if n := paidSessionCount(t, db, missedCoachA); n != 1 {
		t.Fatalf("สอน 1 คาบต้องได้เงิน 1 คาบ ไม่ว่าจะกดเคลียร์กี่ครั้ง แต่ได้ %d", n)
	}
}

func TestResolveRefusesWhenSessionIsStillOpen(t *testing.T) {
	db := newMissedClassTestDB(t)
	c := seedMissedClass(t, db, missedCoachA)

	// รอบที่เปิดค้างไว้ยังมีทางปกติให้เดิน (เข้าไปกดปิด) ไม่ควรสร้างรอบที่สองมาแข่ง
	d, _ := time.Parse("2006-01-02", missedDay)
	sess := models.AttendanceSession{
		PackageID: c.anchor, SessionDate: d,
		Status: models.AttendanceSessionOpen, OpenedAt: time.Now(), OpenedByUserID: 1,
		ScheduleStartTime: missedStart, ScheduleEndTime: missedEnd,
	}
	mustCreate(t, db, &sess)
	normalizeSessionDates(t, db, missedDay)

	items, _ := NewAttendanceService(db).ListMissedClasses()
	if len(items) != 1 {
		t.Fatalf("รอบที่เปิดค้าง (ยังไม่ปิด) ยังไม่ถือว่าเคลียร์ ต้องยังโผล่ในรายการ แต่ได้ %d", len(items))
	}

	_, err := resolve(db, items[0].WorkScheduleID,
		dto.ResolveMissedClassCoachReq{CoachID: missedCoachA, Status: "present"})
	if !errors.Is(err, ErrMissedClassOpen) {
		t.Fatalf("ต้องบอกให้ไปปิดรอบตามปกติแทน แต่ได้ error: %v", err)
	}
}

// ─── 6. ห้ามแตะประวัติของนักเรียน ────────────────────────────────────────────

// คาบนี้ไม่เคยมีการเช็คชื่อเกิดขึ้นจริง ระบบจึงไม่รู้ว่านักเรียนคนไหนมาหรือไม่มา
// การเดาแทนนักเรียนคือการสร้างประวัติเท็จในบันทึกที่นักเรียนเปิดดูได้
func TestResolveLeavesStudentRecordsUntouched(t *testing.T) {
	db := newMissedClassTestDB(t)
	seedMissedClass(t, db, missedCoachA)

	items, _ := NewAttendanceService(db).ListMissedClasses()
	if _, err := resolve(db, items[0].WorkScheduleID,
		dto.ResolveMissedClassCoachReq{CoachID: missedCoachA, Status: "present"}); err != nil {
		t.Fatalf("เคลียร์คาบไม่สำเร็จ: %v", err)
	}

	var studentRows int64
	db.Model(&models.StudentAttendance{}).Count(&studentRows)
	if studentRows != 0 {
		t.Fatalf("การเคลียร์ค่าจ้างโค้ชต้องไม่สร้างประวัติของนักเรียน แต่มี %d แถว", studentRows)
	}
}

// ─── 7. invariant: โผล่ในรายการแล้วต้องกดเคลียร์ได้เสมอ ─────────────────────

// ⚠️ บั๊กจริงที่เคยเกิด — หน้าจอกับด่านตอนกดพูดสวนกันเอง
//
// เดิม assertNoExistingSession เขียนเงื่อนไขของตัวเองขึ้นมาใหม่ ซึ่ง "กว้างกว่า"
// ตัวที่ทำรายการ (จับคู่ด้วย package_id IN แพ็กเกจพี่น้องทั้งกลุ่ม
// ขณะที่ตัวทำรายการต้องการ package_id ตรงกันเป๊ะสำหรับรอบที่ไม่มีสแนปช็อตเวลา)
//
// ผลคือคาบที่มีรอบเก่าของแพ็กเกจพี่น้องจะ:
//
//	โผล่ในรายการว่า "ยังไม่มีรอบเช็คชื่อ"   (ตัวทำรายการมองไม่เห็นรอบนั้น)
//	กดยืนยันแล้วถูกปฏิเสธว่า "มีรอบปิดแล้ว" (ด่านตอนกดมองเห็น)
//	= ค้างอยู่ในรายการตลอดไป กดออกไม่ได้เลย
func TestListedMissedClassIsAlwaysResolvable(t *testing.T) {
	db := newMissedClassTestDB(t)

	// คลาสที่มี 2 แพ็กเกจเรียนพร้อมกัน (ตัวแทน = id ต่ำสุด)
	c := seedMergedClass(t, db, missedDay, missedStart, missedEnd, 8, 12)
	assignCoach(t, db, c, missedCoachA, missedStart, missedEnd, c.anchor)

	// รอบเก่าของ "แพ็กเกจพี่น้อง" ที่ไม่ใช่ตัวแทน และไม่มีสแนปช็อตเวลา
	var sibling uint
	for _, id := range c.packageIDs {
		if id != c.anchor {
			sibling = id
		}
	}
	if sibling == 0 {
		t.Fatalf("ต้องมีแพ็กเกจพี่น้องที่ไม่ใช่ตัวแทน แต่ได้ %+v", c.packageIDs)
	}

	day, _ := time.Parse("2006-01-02", missedDay)
	legacy := models.AttendanceSession{
		PackageID: sibling, SessionDate: day,
		Status: models.AttendanceSessionClosed, OpenedAt: time.Now(), OpenedByUserID: 1,
		// ตั้งใจไม่ใส่ ScheduleStartTime/EndTime — เป็นรอบรุ่นเก่า
	}
	mustCreate(t, db, &legacy)
	normalizeSessionDates(t, db, missedDay)

	svc := NewAttendanceService(db)
	items, err := svc.ListMissedClasses()
	if err != nil {
		t.Fatalf("ดึงรายการคาบที่ค้างไม่สำเร็จ: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("รอบของแพ็กเกจพี่น้องที่ไม่มีสแนปช็อตเวลาไม่นับว่าเคลียร์แล้ว "+
			"คาบนี้จึงต้องโผล่ในรายการ แต่ได้ %d", len(items))
	}

	// หัวใจของเทส: ทุกคาบที่โผล่ในรายการต้องกดเคลียร์ได้
	for _, item := range items {
		decisions := make([]dto.ResolveMissedClassCoachReq, 0, len(item.Coaches))
		for _, coach := range item.Coaches {
			decisions = append(decisions, dto.ResolveMissedClassCoachReq{
				CoachID: coach.CoachID, Status: "present",
			})
		}

		if _, err := resolve(db, item.WorkScheduleID, decisions...); err != nil {
			t.Fatalf("คาบที่โผล่ในรายการต้องเคลียร์ได้ แต่ถูกปฏิเสธ: %v%s",
				err, "\n— รายการกับด่านตอนกดใช้เงื่อนไขไม่ตรงกัน คาบนี้จะค้างตลอดไป")
		}
	}

	normalizeSessionDates(t, db, missedDay)
	if n := paidSessionCount(t, db, missedCoachA); n != 1 {
		t.Fatalf("เคลียร์แล้วต้องได้เงิน 1 คาบ แต่ได้ %d", n)
	}
}

// ─── 8. ชนกับ unique index ต้องบอกสาเหตุ ไม่ใช่ตอบ "ลองกดอีกครั้ง" วนไป ─────

// ⚠️ บั๊กจริงที่ผู้ใช้เจอ — กดยืนยันแล้วขึ้น "ลองกดอีกครั้ง" แล้วข้อความหายไป
// กดใหม่ก็ได้ผลเดิม วนอยู่อย่างนั้นโดยไม่มีใครรู้สาเหตุ
//
// ต้นเหตุ: เวอร์ชันแรกดักตอน insert ล้มแล้วค่อย query หาแถวที่ชน
// ซึ่งใช้ไม่ได้บน postgres — ทรานแซกชันที่มีคำสั่งล้มจะเข้าสถานะ aborted
// ทุก query หลังจากนั้นถูกปฏิเสธ จึงตกไปเข้าทางสำรอง "ลองกดอีกครั้ง" ทุกครั้ง
//
// ตอนนี้ตรวจก่อน insert (ทรานแซกชันยังปกติ) จึงบอกได้ว่าชนกับรอบไหน
//
// ─── เคสที่ยังชนได้จริงหลังรับการจับคู่สองทาง ───
//
// ตารางงานชี้แพ็กเกจพี่น้อง (ไม่ใช่ตัวแทน) + รอบอยู่บนตัวแทน + เวลาไม่ตรง
// → จับคู่ไม่ติดทั้งสองทาง (package_id ไม่ตรง · เวลาไม่ตรง) → โผล่ในรายการ
// → แต่การสร้างรอบใหม่ต้องลงบน "ตัวแทน" ซึ่งมีแถวของวันนั้นอยู่แล้ว → ชน unique index
func TestResolveExplainsUniqueIndexCollision(t *testing.T) {
	db := newMissedClassTestDB(t)
	c := seedMergedClass(t, db, missedDay, missedStart, missedEnd, 8, 12)

	var sibling uint
	for _, id := range c.packageIDs {
		if id != c.anchor {
			sibling = id
		}
	}
	if sibling == 0 {
		t.Fatalf("ต้องมีแพ็กเกจพี่น้องที่ไม่ใช่ตัวแทน แต่ได้ %+v", c.packageIDs)
	}

	// ตารางงานชี้แพ็กเกจพี่น้อง
	assignCoach(t, db, c, missedCoachA, missedStart, missedEnd, sibling)

	// รอบเช็คชื่ออยู่บนแพ็กเกจตัวแทน และเป็นคาบคนละช่วงเวลา
	day, _ := time.Parse("2006-01-02", missedDay)
	other := models.AttendanceSession{
		PackageID: c.anchor, SessionDate: day,
		Status: models.AttendanceSessionClosed, OpenedAt: time.Now(), OpenedByUserID: 1,
		ScheduleStartTime: "08:00", ScheduleEndTime: "10:00",
	}
	mustCreate(t, db, &other)
	normalizeSessionDates(t, db, missedDay)

	items, err := NewAttendanceService(db).ListMissedClasses()
	if err != nil {
		t.Fatalf("ดึงรายการไม่สำเร็จ: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("จับคู่ไม่ติดทั้งสองทาง คาบนี้จึงต้องโผล่ในรายการ แต่ได้ %d", len(items))
	}

	_, resolveErr := resolve(db, items[0].WorkScheduleID,
		dto.ResolveMissedClassCoachReq{CoachID: missedCoachA, Status: "present"})

	if !errors.Is(resolveErr, ErrMissedClassCollision) {
		t.Fatalf("ต้องตอบว่าชนกับรอบที่มีอยู่ (ErrMissedClassCollision) แต่ได้: %v", resolveErr)
	}

	// ข้อความต้องบอกได้ว่าชนกับรอบไหนและเวลาเท่าไร ไม่ใช่ "ลองกดอีกครั้ง"
	msg := resolveErr.Error()
	for _, want := range []string{"08:00", missedStart} {
		if !strings.Contains(msg, want) {
			t.Fatalf("ข้อความต้องมี %q เพื่อให้เอาไปแก้ต่อได้ แต่ได้: %s", want, msg)
		}
	}
	if strings.Contains(msg, "ลองกดอีกครั้ง") {
		t.Fatalf("ห้ามตอบ \"ลองกดอีกครั้ง\" กับการชนที่กดใหม่ก็ไม่หาย: %s", msg)
	}

	var sessions int64
	db.Model(&models.AttendanceSession{}).Count(&sessions)
	if sessions != 1 {
		t.Fatalf("คำขอที่ถูกปฏิเสธต้องไม่สร้างรอบใหม่ แต่มี %d รอบ", sessions)
	}
}

// ─── 9. เวลาในตารางงานไม่ตรงกับเวลาคาบจริง ต้องยังได้เงิน ───────────────────

// ⚠️ บั๊กจริงที่ผู้ใช้เจอ (คาบ 7 ก.ย. 2569)
//
//	รอบเช็คชื่อ #32  16:00-20:00   ← คาบจริง
//	ตารางงานของโค้ช  18:00-20:00   ← เวลาที่แอดมินกรอกตอนมอบหมาย
//
// กติกาที่จับคู่ด้วย "course + วัน + เวลา" เท่านั้น มองว่าเป็นคนละคาบ
// → โค้ชไม่ได้เงินทั้งที่สอนจริง และคาบค้างในรายการตลอดไป กดเคลียร์ก็ไม่ผ่าน
//
// เวลาที่แอดมินกรอกตอนมอบหมายงานไม่มีอะไรบังคับว่าต้องตรงกับ package_schedules
// จะเรียกร้องให้ตรงกันเป๊ะเสมอไม่ได้ ระบบต้องรับความจริงข้อนี้
func TestClassMatchesByPackageWhenAssignedTimeDiffers(t *testing.T) {
	db := newMissedClassTestDB(t)
	c := seedMergedClass(t, db, missedDay, missedStart, missedEnd, 8)

	// ตารางงานเวลา 18:00-20:00 (ตามที่แอดมินกรอก)
	assignCoach(t, db, c, missedCoachA, missedStart, missedEnd, c.anchor)

	// รอบเช็คชื่อของแพ็กเกจเดียวกัน วันเดียวกัน แต่คาบจริงคือ 16:00-20:00
	day, _ := time.Parse("2006-01-02", missedDay)
	real := models.AttendanceSession{
		PackageID: c.anchor, SessionDate: day,
		Status: models.AttendanceSessionClosed, OpenedAt: time.Now(), OpenedByUserID: 1,
		ScheduleStartTime: "16:00", ScheduleEndTime: "20:00",
	}
	mustCreate(t, db, &real)
	normalizeSessionDates(t, db, missedDay)

	if n := paidSessionCount(t, db, missedCoachA); n != 1 {
		t.Fatalf("แพ็กเกจและวันตรงกัน ต้องนับเป็นคาบที่ได้เงิน 1 คาบ แต่ได้ %d "+
			"— เวลาที่แอดมินกรอกไม่ตรงกับคาบจริงไม่ควรทำให้โค้ชไม่ได้เงิน", n)
	}

	items, err := NewAttendanceService(db).ListMissedClasses()
	if err != nil {
		t.Fatalf("ดึงรายการไม่สำเร็จ: %v", err)
	}
	if len(items) != 0 {
		t.Fatalf("คาบนี้มีรอบเช็คชื่อปิดแล้ว ต้องไม่ค้างในรายการ แต่ได้ %d "+
			"— ถ้าค้าง แอดมินจะกดเคลียร์วนไม่จบ", len(items))
	}
}
