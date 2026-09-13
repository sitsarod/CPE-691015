package services

import (
	"testing"
	"time"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"

	"gorm.io/gorm"
)

// เทสชุดนี้ตรึงเคสที่ "โค้ชมีตารางงานหลายแถวของแพ็กเกจ+วันเดียวกัน"
//
// ─── ที่มา ───
//
// รอบก่อนเพิ่มท่อน `OR a.package_id = work_schedules.package_id` ลงในกติกาจับคู่คลาส
// เพื่อแก้เคสที่เวลาในตารางงานไม่ตรงกับเวลาคาบจริง พร้อมเขียนคอมเมนต์ว่า
// "ปลอดภัยเพราะ 1 แพ็กเกจมีรอบได้วันละ 1 รอบ"
//
// คอมเมนต์นั้นผิด และความจริงตรงกันข้าม — การมีรอบได้รอบเดียวนั่นแหละคือสาเหตุ
// ที่ทำให้ทุกแถวของแพ็กเกจนั้นในวันนั้นไปเกาะรอบเดียวกันหมด
//
// ⚠️ เทสเดิม TestTwoSlotsSameDayPayTwice ครอบเคสนี้ไม่ได้
// เพราะ seedMergedClass สร้าง "คนละแพ็กเกจ" ให้แต่ละคาบ (ยืนยันแล้ว)

const ambiCoach = uint(711)

func newAmbiguityDB(t *testing.T) *gorm.DB {
	return newTestDB(t,
		&models.WorkSchedule{}, &models.AttendanceSession{}, &models.CoachAttendance{},
		&models.Package{}, &models.PackageSchedule{}, &models.Course{},
		&models.Coach{}, &models.User{}, &models.Expense{}, &models.Notification{},
	)
}

func seedAmbiCoach(t *testing.T, db *gorm.DB) {
	t.Helper()
	mustCreate(t, db, &models.Package{Model: gorm.Model{ID: 1}, SessionsCount: 8, CourseID: 1})
	mustCreate(t, db, &models.Coach{Model: gorm.Model{ID: ambiCoach},
		Nickname: "เทส", Status: coachStatusActive,
		PaymentType: PaymentTypePerSession, PayRate: 300})
}

func ambiWS(t *testing.T, db *gorm.DB, date, start, end string) models.WorkSchedule {
	t.Helper()
	pkg := uint(1)
	ws := models.WorkSchedule{
		CoachID: ambiCoach, CourseID: 1, PackageID: &pkg,
		Date: date, StartTime: start, EndTime: end,
		Description: "ทดสอบ", PayRateSnapshot: 300,
	}
	mustCreate(t, db, &ws)
	db.Exec(`UPDATE work_schedules SET date = ? WHERE id = ?`, date, ws.ID)
	return ws
}

func ambiSession(t *testing.T, db *gorm.DB, date, start, end string) models.AttendanceSession {
	t.Helper()
	d, _ := time.Parse("2006-01-02", date)
	s := models.AttendanceSession{
		PackageID: 1, SessionDate: d,
		Status: models.AttendanceSessionClosed, OpenedAt: time.Now(), OpenedByUserID: 1,
		ScheduleStartTime: start, ScheduleEndTime: end,
	}
	mustCreate(t, db, &s)
	// ⚠️ ต้องเช็ค error — unique (package_id, session_date) ปฏิเสธ UPDATE นี้ได้
	// ถ้าปล่อยผ่านเงียบ ๆ แถวจะเก็บวันที่คนละรูปแบบแล้วเทสจะ "ผ่าน/ไม่ผ่าน" ด้วยเหตุผลที่ผิด
	// (เคยพลาดมาแล้วตอนเขียนเทส F4 ครั้งแรก)
	if err := db.Exec(`UPDATE attendance_sessions SET session_date = ? WHERE id = ?`,
		date, s.ID).Error; err != nil {
		t.Fatalf("ปรับรูปแบบวันที่ของรอบเช็คชื่อไม่สำเร็จ: %v", err)
	}
	return s
}

func ambiPayroll(t *testing.T, db *gorm.DB) (sessions int, expected float64, unresolved int) {
	t.Helper()
	p, err := ComputeCoachPayroll(db, ambiCoach, time.Now())
	if err != nil {
		t.Fatalf("คำนวณค่าจ้างไม่สำเร็จ: %v", err)
	}
	return p.SessionsDone, p.Expected, p.UnresolvedSessions
}

// ─── F3: ปิดรอบแค่คาบเช้า คาบบ่ายต้องไม่ได้เงิน ─────────────────────────────

func TestOnePackageTwoSlotsSameDayPaysOnlyClosedSlot(t *testing.T) {
	db := newAmbiguityDB(t)
	seedAmbiCoach(t, db)
	const day = "2026-03-02"

	ambiWS(t, db, day, "10:00", "12:00") // คาบเช้า
	ambiWS(t, db, day, "14:00", "16:00") // คาบบ่าย — แพ็กเกจเดียวกัน วันเดียวกัน
	ambiSession(t, db, day, "10:00", "12:00")

	sessions, expected, unresolved := ambiPayroll(t, db)
	if sessions != 1 || expected != 300 {
		t.Fatalf("ปิดรอบแค่คาบเช้า ต้องได้เงิน 1 คาบ 300 บาท แต่ได้ %d คาบ %.2f บาท "+
			"— ถ้าได้ 2/600 แปลว่าคาบบ่ายไปเกาะรอบของคาบเช้า", sessions, expected)
	}
	if unresolved != 1 {
		t.Fatalf("คาบบ่ายไม่มีรอบเช็คชื่อ ต้องโผล่ในรายการค้าง 1 คาบ แต่ได้ %d "+
			"— ถ้าเป็น 0 แปลว่าเงินหายเงียบ ไม่มีใครเห็น", unresolved)
	}
}

// ─── F4: มาร์คขาดคาบเช้า ต้องไม่ทำให้คาบบ่ายหายเงียบ ───────────────────────

// บั๊กเดิม: ท่อน package_id แบบไม่มีเงื่อนไขทำให้คาบบ่ายไปเกาะรอบของคาบเช้า
// พอมาร์คขาดงานคาบเช้า แถว absent แถวเดียวจึงตัดเงินคาบบ่ายทิ้งไปด้วย
// **และคาบบ่ายก็ไม่โผล่ในรายการค้าง** เพราะถือว่า "มีรอบแล้ว" = เงินหายเงียบสนิท
//
// หลังแก้: คาบบ่ายไม่เกาะรอบของคาบเช้าอีก จึงกลายเป็น "คาบที่ยังไม่มีรอบเช็คชื่อ"
// ซึ่งโผล่ให้แอดมินเห็นและกดเคลียร์ย้อนหลังได้ — ยังไม่ได้เงินทันที แต่ไม่หายเงียบ
func TestAbsentOnOneSlotDoesNotSilentlyKillOtherSlot(t *testing.T) {
	db := newAmbiguityDB(t)
	seedAmbiCoach(t, db)
	const day = "2026-03-09"

	ambiWS(t, db, day, "10:00", "12:00") // คาบเช้า — มีรอบเช็คชื่อ
	ambiWS(t, db, day, "14:00", "16:00") // คาบบ่าย — ไม่มีรอบ
	morning := ambiSession(t, db, day, "10:00", "12:00")

	mustCreate(t, db, &models.CoachAttendance{
		CoachID: ambiCoach, AttendanceSessionID: morning.ID,
		WorkDate: time.Now(), CheckInTime: time.Now(),
		Status: models.AttendanceStatusAbsent, IsScheduled: true,
	})

	sessions, expected, unresolved := ambiPayroll(t, db)
	if sessions != 0 || expected != 0 {
		t.Fatalf("ขาดงานคาบเช้า ต้องไม่ได้เงินคาบนั้น แต่ได้ %d คาบ %.2f บาท", sessions, expected)
	}
	if unresolved != 1 {
		t.Fatalf("คาบบ่ายไม่มีรอบเช็คชื่อ ต้องโผล่ในรายการค้าง 1 คาบ แต่ได้ %d "+
			"— ถ้าเป็น 0 แปลว่าคาบบ่ายไปเกาะรอบของคาบเช้าแล้วถูก absent ตัดทิ้ง = เงินหายเงียบ",
			unresolved)
	}
}

// คาบบ่ายที่ยังไม่มีรอบ ต้องเคลียร์ย้อนหลังได้จริง (ไม่ใช่แค่โผล่ให้เห็น)
func TestSecondSlotOfDayCanBeResolved(t *testing.T) {
	db := newAmbiguityDB(t)
	seedAmbiCoach(t, db)
	const day = "2026-03-09"

	ambiWS(t, db, day, "10:00", "12:00")
	afternoon := ambiWS(t, db, day, "14:00", "16:00")
	ambiSession(t, db, day, "10:00", "12:00")

	svc := NewAttendanceService(db)
	items, err := svc.ListMissedClasses()
	if err != nil {
		t.Fatalf("ดึงรายการคาบค้างไม่สำเร็จ: %v", err)
	}
	if len(items) != 1 || items[0].WorkScheduleID != afternoon.ID {
		t.Fatalf("ต้องเจอคาบบ่าย (#%d) ในรายการค้าง แต่ได้ %+v", afternoon.ID, items)
	}

	// ⚠️ โผล่ในรายการอย่างเดียวไม่พอ ต้องกดเคลียร์ได้จริงด้วย
	//
	// ด่านกันชนเคยเช็คแค่ (แพ็กเกจ, วัน) ตามคีย์ของ index รุ่นเก่า
	// พอ index เพิ่มเวลาเริ่มเข้าไป ด่านก็กลายเป็นเข้มเกินจริง — คาบบ่ายจะถูกปฏิเสธ
	// เพราะไปเจอรอบของคาบเช้า ทั้งที่สร้างรอบของตัวเองได้
	if _, err := svc.ResolveMissedClass(dto.ResolveMissedClassRequest{
		WorkScheduleID: afternoon.ID,
		Coaches: []dto.ResolveMissedClassCoachReq{
			{CoachID: ambiCoach, Status: "present"},
		},
	}, 1); err != nil {
		t.Fatalf("คาบที่สองของวันต้องเคลียร์ย้อนหลังได้ แต่ถูกปฏิเสธ: %v", err)
	}

	var sessions int64
	db.Model(&models.AttendanceSession{}).Count(&sessions)
	if sessions != 2 {
		t.Fatalf("ต้องมีรอบเช็คชื่อ 2 รอบ (เช้า+บ่าย) แต่มี %d", sessions)
	}
}

// ─── เคสที่ท่อน package_id ยังต้องทำงาน (อย่าแก้จนพังอีกทาง) ────────────────

// เวลาที่แอดมินกรอกไม่ตรงกับคาบจริง แต่มีตารางงานแถวเดียว = ไม่กำกวม → ต้องได้เงิน
// (นี่คือเคสคาบ 7 ก.ย. ของผู้ใช้ ห้ามพังอีก)
func TestSingleScheduleStillMatchesByPackageWhenTimeDiffers(t *testing.T) {
	db := newAmbiguityDB(t)
	seedAmbiCoach(t, db)
	const day = "2026-03-23"

	ambiWS(t, db, day, "18:00", "20:00")      // แอดมินกรอก 18:00
	ambiSession(t, db, day, "16:00", "20:00") // คาบจริง 16:00

	sessions, expected, unresolved := ambiPayroll(t, db)
	if sessions != 1 || expected != 300 {
		t.Fatalf("ตารางงานแถวเดียว ไม่กำกวม ต้องจับคู่ได้และได้เงิน 1 คาบ แต่ได้ %d คาบ %.2f บาท",
			sessions, expected)
	}
	if unresolved != 0 {
		t.Fatalf("จับคู่ได้แล้วต้องไม่ค้างในรายการ แต่ค้าง %d คาบ", unresolved)
	}
}

// ─── F2: สแกนเช็คชื่อต้องไม่สร้างแถวซ้ำเมื่อเวลาไม่ตรงแต่ซ้อนกัน ──────────

func TestScanDoesNotCreateSecondRowWhenTimesOverlap(t *testing.T) {
	db := newAmbiguityDB(t)
	seedAmbiCoach(t, db)
	const day = "2026-03-30"

	ambiWS(t, db, day, "18:00", "20:00")              // แอดมิน assign 18:00
	sess := ambiSession(t, db, day, "16:00", "20:00") // คาบจริง 16:00 (ซ้อนกัน)

	var before int64
	db.Model(&models.WorkSchedule{}).Where("coach_id = ?", ambiCoach).Count(&before)

	scheduled, err := NewAttendanceService(db).ensureCoachWorkSchedule(db, ambiCoach, &sess)
	if err != nil {
		t.Fatalf("ensureCoachWorkSchedule ไม่สำเร็จ: %v", err)
	}
	if !scheduled {
		t.Fatalf("แถวที่เวลาซ้อนกันอยู่แล้วต้องถือว่ามีตารางงานแล้ว")
	}

	var after int64
	db.Model(&models.WorkSchedule{}).Where("coach_id = ?", ambiCoach).Count(&after)
	if after != before {
		t.Fatalf("ต้องไม่สร้างแถวใหม่ (มี %d → %d) — แถวซ้ำ = ค่าจ้างสองหน่วยของคาบเดียว",
			before, after)
	}

	sessions, expected, _ := ambiPayroll(t, db)
	if sessions != 1 || expected != 300 {
		t.Fatalf("สอนคาบเดียวต้องได้เงิน 1 คาบ 300 บาท แต่ได้ %d คาบ %.2f บาท", sessions, expected)
	}
}

// คาบที่ไม่ซ้อนกันเลยยังต้องสร้างแถวใหม่ได้ (โค้ชมาช่วยสอนคาบอื่นหน้างาน)
func TestScanStillCreatesRowForNonOverlappingClass(t *testing.T) {
	db := newAmbiguityDB(t)
	seedAmbiCoach(t, db)
	const day = "2026-04-06"

	ambiWS(t, db, day, "09:00", "11:00")              // คาบเช้าที่มีอยู่แล้ว
	sess := ambiSession(t, db, day, "18:00", "20:00") // คาบเย็น คนละช่วง

	var before int64
	db.Model(&models.WorkSchedule{}).Where("coach_id = ?", ambiCoach).Count(&before)

	scheduled, err := NewAttendanceService(db).ensureCoachWorkSchedule(db, ambiCoach, &sess)
	if err != nil {
		t.Fatalf("ensureCoachWorkSchedule ไม่สำเร็จ: %v", err)
	}
	if scheduled {
		t.Fatalf("คาบเย็นยังไม่มีตารางงาน ต้องรายงานว่าไม่ได้ถูก assign ไว้")
	}

	var after int64
	db.Model(&models.WorkSchedule{}).Where("coach_id = ?", ambiCoach).Count(&after)
	if after != before+1 {
		t.Fatalf("คาบที่ไม่ซ้อนกันต้องสร้างแถวใหม่ได้ (มี %d → %d)", before, after)
	}
}

// ─── หมายเหตุ: unique index ─────────────────────────────────────────────────
//
// index ของ attendance_sessions คือ (package_id, session_date, schedule_start_time)
// แพ็กเกจหนึ่งจึงเปิดรอบเช็คชื่อได้หลายรอบต่อวัน ตราบใดที่เวลาเริ่มต่างกัน
// (เดิมเป็น (package_id, session_date) ซึ่งทำให้คาบที่สองของวันเปิดรอบไม่ได้เลย)
//
// ทุกจุดที่ตรวจ "ชนกับรอบที่มีอยู่" ต้องใช้คีย์ชุดนี้ให้ครบ ไม่งั้นจะเข้มเกินจริง
// แล้วบล็อกคาบที่สองของวันโดยไม่จำเป็น (ดู assertNoAnchorDayCollision)
