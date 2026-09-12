package services

import (
	"errors"
	"fmt"
	"testing"
	"time"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"

	"gorm.io/gorm"
)

// เทสชุดนี้คุมกฎเรื่อง "การให้งาน" กับ "เวลาการทำงาน" ของโค้ช
//
// ─── ช่องว่างที่ชุดนี้ปิด ───
//
//	validateScheduleSlot   หัวใจของการกันเวลาชน/สนามซ้อน — 3 กฎซ้อนกัน ไม่เคยมีเทสเลย
//	ensureNoScheduleConflict ตัวบล็อกการแก้เวลาว่าง (บั๊กคาบฉุกเฉิน)
//	GetWeekSessions        สมมติฐานว่า week_start เป็นวันอาทิตย์
//	openSessionForSlot     หารอบเช็คชื่อของคาบ ต้องแยกคาบเช้า/บ่ายของวันเดียวกัน
//	แจ้งเตือนตอนเปลี่ยน/ยกเลิกตารางงาน และตอนพักงานโค้ช

const (
	slotCoachA = uint(91)
	slotCoachB = uint(92)
)

func newScheduleRuleDB(t *testing.T) *gorm.DB {
	db := newTestDB(t,
		&models.WorkSchedule{}, &models.Coach{}, &models.User{}, &models.CoachAvailability{},
		&models.Package{}, &models.PackageSchedule{}, &models.Course{},
		&models.AttendanceSession{}, &models.CoachAttendance{}, &models.Notification{},
	)
	// ทุกคาบต้องผูกกับแพ็กเกจจริง — AssignWorkSchedule ปฏิเสธคาบที่ไม่มี package_id
	// (หน้าเว็บส่ง package_id มาจากการ์ดคาบเรียนอยู่แล้ว ดู AssignCoachModal)
	mustCreate(t, db, &models.Package{Model: gorm.Model{ID: 1}, SessionsCount: 8, CourseID: 1})
	return db
}

// seedSlotCoach สร้างโค้ชพร้อมบัญชีและเวลาว่างวันจันทร์ 08:00-22:00
func seedSlotCoach(t *testing.T, db *gorm.DB, coachID uint, status string) {
	t.Helper()
	// uid / personal_qr_code / member_code ต้องไม่ซ้ำ — มี unique index บังคับอยู่
	// (ถ้าปล่อยว่างทั้งคู่ โค้ชคนที่สองจะสร้างไม่ได้ ซึ่งเป็นด่านที่ทำงานถูกแล้ว)
	user := models.User{FirstName: "โค้ช", LastName: "ทดสอบ",
		Email: fmt.Sprintf("slot-%d@example.test", coachID)}
	mustCreate(t, db, &user)
	mustCreate(t, db, &models.Coach{
		Model: gorm.Model{ID: coachID}, UserID: user.ID, Nickname: "เทส",
		Uid:            fmt.Sprintf("%013d", coachID),
		PersonalQRCode: fmt.Sprintf("QR-SLOT-%d", coachID),
		MemberCode:     fmt.Sprintf("MC-SLOT-%d", coachID),
		Status:         status, PaymentType: PaymentTypePerSession, PayRate: 300,
	})
	mustCreate(t, db, &models.CoachAvailability{
		CoachID: coachID, DayOfWeek: "Monday", StartTime: "08:00", EndTime: "22:00",
	})
}

// nextMonday คืนวันจันทร์ถัดไป (อยู่ในอนาคตเสมอ จึงผ่านด่านห้ามย้อนหลัง)
func nextMonday() string {
	d := time.Now().AddDate(0, 0, 1)
	for d.Weekday() != time.Monday {
		d = d.AddDate(0, 0, 1)
	}
	return d.Format("2006-01-02")
}

func slotReq(date string, coachID uint, start, end, court string) dto.CreateWorkScheduleRequest {
	pkg := uint(1)
	return dto.CreateWorkScheduleRequest{
		Date: date, StartTime: start, EndTime: end,
		CoachID: coachID, CourseID: 1, CourtNumber: court, Description: "ทดสอบ",
		PackageID: &pkg,
	}
}

// ─── 1. validateScheduleSlot — 3 กฎซ้อนกัน ───────────────────────────────────

func TestValidateScheduleSlotRules(t *testing.T) {
	db := newScheduleRuleDB(t)
	seedSlotCoach(t, db, slotCoachA, coachStatusActive)
	svc := &workScheduleService{db: db}
	monday := nextMonday()

	t.Run("อยู่ในเวลาว่างและไม่ชนอะไร ต้องผ่าน", func(t *testing.T) {
		if err := svc.validateScheduleSlot(db, slotReq(monday, slotCoachA, "10:00", "12:00", "1"), 0); err != nil {
			t.Fatalf("ควรผ่าน แต่ได้ error: %v", err)
		}
	})

	t.Run("เวลาเริ่มต้องน้อยกว่าเวลาจบ", func(t *testing.T) {
		err := svc.validateScheduleSlot(db, slotReq(monday, slotCoachA, "12:00", "10:00", ""), 0)
		if !errors.Is(err, ErrScheduleInvalid) {
			t.Fatalf("ควรเป็น ErrScheduleInvalid แต่ได้: %v", err)
		}
	})

	t.Run("รูปแบบเวลาที่มีขยะต่อท้ายต้องไม่ผ่าน", func(t *testing.T) {
		err := svc.validateScheduleSlot(db, slotReq(monday, slotCoachA, "10:00xyz", "12:00", ""), 0)
		if !errors.Is(err, ErrScheduleInvalid) {
			t.Fatalf("ควรเป็น ErrScheduleInvalid แต่ได้: %v", err)
		}
	})

	t.Run("นอกเวลาว่างของโค้ชต้องไม่ผ่าน", func(t *testing.T) {
		err := svc.validateScheduleSlot(db, slotReq(monday, slotCoachA, "05:00", "07:00", ""), 0)
		if !errors.Is(err, ErrScheduleConflict) {
			t.Fatalf("ควรเป็น ErrScheduleConflict แต่ได้: %v", err)
		}
	})

	t.Run("วันที่โค้ชไม่ได้ตั้งเวลาว่างไว้เลยต้องไม่ผ่าน", func(t *testing.T) {
		tuesday, _ := time.Parse("2006-01-02", monday)
		err := svc.validateScheduleSlot(db,
			slotReq(tuesday.AddDate(0, 0, 1).Format("2006-01-02"), slotCoachA, "10:00", "12:00", ""), 0)
		if !errors.Is(err, ErrScheduleConflict) {
			t.Fatalf("ควรเป็น ErrScheduleConflict แต่ได้: %v", err)
		}
	})

	t.Run("โหมดฉุกเฉินข้ามเวลาว่างได้", func(t *testing.T) {
		req := slotReq(monday, slotCoachA, "05:00", "07:00", "")
		req.IgnoreAvailability = true
		if err := svc.validateScheduleSlot(db, req, 0); err != nil {
			t.Fatalf("โหมดฉุกเฉินควรข้ามเวลาว่างได้ แต่ได้ error: %v", err)
		}
	})
}

func TestValidateScheduleSlotBlocksOverlapAndCourt(t *testing.T) {
	db := newScheduleRuleDB(t)
	seedSlotCoach(t, db, slotCoachA, coachStatusActive)
	seedSlotCoach(t, db, slotCoachB, coachStatusActive)
	svc := &workScheduleService{db: db}
	monday := nextMonday()

	existing, err := svc.AssignWorkSchedule(slotReq(monday, slotCoachA, "10:00", "12:00", "1"))
	if err != nil {
		t.Fatalf("มอบหมายคาบแรกไม่สำเร็จ: %v", err)
	}

	t.Run("โค้ชคนเดียวกันมีคาบซ้อนเวลาไม่ได้", func(t *testing.T) {
		err := svc.validateScheduleSlot(db, slotReq(monday, slotCoachA, "11:00", "13:00", ""), 0)
		if !errors.Is(err, ErrScheduleConflict) {
			t.Fatalf("คาบซ้อนต้องถูกปฏิเสธ แต่ได้: %v", err)
		}
	})

	t.Run("ต่อท้ายกันพอดีไม่นับว่าซ้อน", func(t *testing.T) {
		if err := svc.validateScheduleSlot(db, slotReq(monday, slotCoachA, "12:00", "14:00", ""), 0); err != nil {
			t.Fatalf("12:00-14:00 ต่อจาก 10:00-12:00 ไม่ควรถือว่าซ้อน แต่ได้: %v", err)
		}
	})

	t.Run("แก้ record ตัวเองต้องไม่ชนกับตัวเอง", func(t *testing.T) {
		if err := svc.validateScheduleSlot(db, slotReq(monday, slotCoachA, "10:00", "12:00", "1"), existing.ID); err != nil {
			t.Fatalf("excludeID ควรกันการชนกับตัวเอง แต่ได้: %v", err)
		}
	})

	t.Run("สนามเดียวกันคลาสอื่นใช้เวลาชนกันไม่ได้", func(t *testing.T) {
		req := slotReq(monday, slotCoachB, "11:00", "13:00", "1")
		req.CourseID = 2 // คนละคอร์ส = คนละคลาส
		if err := svc.validateScheduleSlot(db, req, 0); !errors.Is(err, ErrScheduleConflict) {
			t.Fatalf("สนามซ้อนของคลาสอื่นต้องถูกปฏิเสธ แต่ได้: %v", err)
		}
	})

	t.Run("สนามเดียวกันแต่เป็นคลาสเดียวกัน (co-teach) ต้องได้", func(t *testing.T) {
		// course + วัน + เวลา ตรงกัน = คลาสเดียวกัน โค้ชสองคนช่วยกันสอนบนสนามเดียว
		if err := svc.validateScheduleSlot(db, slotReq(monday, slotCoachB, "10:00", "12:00", "1"), 0); err != nil {
			t.Fatalf("co-teach คลาสเดียวกันบนสนามเดียวควรได้ แต่ได้: %v", err)
		}
	})
}

func TestValidateScheduleSlotBlocksSuspendedCoach(t *testing.T) {
	db := newScheduleRuleDB(t)
	seedSlotCoach(t, db, slotCoachA, coachStatusInactive)
	svc := &workScheduleService{db: db}

	req := slotReq(nextMonday(), slotCoachA, "10:00", "12:00", "")
	req.IgnoreAvailability = true // แม้โหมดฉุกเฉินก็ต้องบล็อก

	if err := svc.validateScheduleSlot(db, req, 0); !errors.Is(err, ErrScheduleConflict) {
		t.Fatalf("โค้ชที่ถูกพักงานต้องมอบหมายงานไม่ได้แม้ในโหมดฉุกเฉิน แต่ได้: %v", err)
	}
}

// ─── 2. เวลาว่าง: คาบฉุกเฉินต้องไม่ล็อกโค้ชไว้ ──────────────────────────────

// บั๊กเดิม: โค้ชสแกนเช็คชื่อคาบที่ไม่มีในตาราง → ระบบสร้างคาบฉุกเฉินให้
// → เวลาว่างชุดใหม่ไม่คลุมคาบนั้น (เพราะมันอยู่นอกเวลาว่างตั้งแต่แรก)
// → โค้ชแก้เวลาว่างตัวเองไม่ได้เลยจนเลยวันนั้น
func TestAvailabilityIgnoresEmergencyClasses(t *testing.T) {
	db := newScheduleRuleDB(t)
	seedSlotCoach(t, db, slotCoachA, coachStatusActive)
	monday := nextMonday()

	// คาบฉุกเฉินนอกเวลาว่าง (ตี 5) แบบที่ระบบสร้างให้ตอนโค้ชสแกนหน้างาน
	emergency := models.WorkSchedule{
		CoachID: slotCoachA, CourseID: 1, Date: monday,
		StartTime: "05:00", EndTime: "07:00", IsEmergency: true,
		Description: "เพิ่มอัตโนมัติจากการสแกนเช็คชื่อของโค้ช",
	}
	mustCreate(t, db, &emergency)
	db.Exec(`UPDATE work_schedules SET date = ? WHERE id = ?`, monday, emergency.ID)

	svc := NewCoachAvailabilityService(db)
	if err := svc.ensureNoScheduleConflict(slotCoachA, []dto.AvailabilityDetail{
		{DayOfWeek: "Monday", StartTime: "08:00", EndTime: "22:00"},
	}); err != nil {
		t.Fatalf("คาบฉุกเฉินต้องไม่บล็อกการแก้เวลาว่าง แต่ได้ error: %v", err)
	}
}

// คาบปกติที่ถูกมอบหมายไว้แล้วยังต้องบล็อกอยู่ — ไม่ใช่ยกเว้นหมดทุกอย่าง
func TestAvailabilityStillBlocksNormalAssignedClasses(t *testing.T) {
	db := newScheduleRuleDB(t)
	seedSlotCoach(t, db, slotCoachA, coachStatusActive)
	monday := nextMonday()

	normal := models.WorkSchedule{
		CoachID: slotCoachA, CourseID: 1, Date: monday,
		StartTime: "20:00", EndTime: "22:00", Description: "คาบปกติ",
	}
	mustCreate(t, db, &normal)
	db.Exec(`UPDATE work_schedules SET date = ? WHERE id = ?`, monday, normal.ID)

	svc := NewCoachAvailabilityService(db)
	err := svc.ensureNoScheduleConflict(slotCoachA, []dto.AvailabilityDetail{
		{DayOfWeek: "Monday", StartTime: "08:00", EndTime: "12:00"}, // ไม่คลุม 20:00-22:00
	})
	if !errors.Is(err, ErrAvailabilityConflictsSchedule) {
		t.Fatalf("คาบปกติที่หลุดจากเวลาว่างใหม่ต้องบล็อก แต่ได้ error: %v", err)
	}
}

// โค้ชที่ไม่มีงานค้างต้องล้างเวลาว่างทั้งหมดได้ (คนจะลาออก/พักยาว)
func TestAvailabilityCanBeClearedWhenNoFutureWork(t *testing.T) {
	db := newScheduleRuleDB(t)
	seedSlotCoach(t, db, slotCoachA, coachStatusActive)

	svc := NewCoachAvailabilityService(db)
	if err := svc.ensureNoScheduleConflict(slotCoachA, nil); err != nil {
		t.Fatalf("ไม่มีงานค้าง ต้องล้างเวลาว่างได้ แต่ได้ error: %v", err)
	}
}

// ─── 3. GetWeekSessions ต้องเป็นวันอาทิตย์ ───────────────────────────────────

func TestGetWeekSessionsRequiresSunday(t *testing.T) {
	db := newScheduleRuleDB(t)
	svc := NewWorkScheduleService(db)

	// หาวันจันทร์กับวันอาทิตย์ที่แน่นอน
	monday, _ := time.Parse("2006-01-02", "2026-01-05") // จันทร์
	sunday := monday.AddDate(0, 0, -1)                  // อาทิตย์

	if _, err := svc.GetWeekSessions(monday.Format("2006-01-02")); !errors.Is(err, ErrScheduleInvalid) {
		t.Fatalf("week_start ที่ไม่ใช่วันอาทิตย์ต้องถูกปฏิเสธ แต่ได้ error: %v "+
			"— ถ้าปล่อยผ่าน ตารางทั้งสัปดาห์จะเลื่อนไป 1 วันโดยไม่มีใครเห็น", err)
	}

	mustMigrate(t, db, &models.Enrollment{})
	if _, err := svc.GetWeekSessions(sunday.Format("2006-01-02")); err != nil {
		t.Fatalf("วันอาทิตย์ต้องผ่าน แต่ได้ error: %v", err)
	}
}

// ─── 4. openSessionForSlot ต้องแยกคาบเช้า/บ่ายของวันเดียวกัน ───────────────

// แพ็กเกจเดียวมีคาบเรียนสองช่วงในวันเดียวกันได้ (เสาร์ 10-12 และ เสาร์ 14-16)
// ถ้าหาด้วยแพ็กเกจ+วันที่อย่างเดียว การเปิดรอบเช้าจะเจอรอบบ่ายแล้วคืนตัวนั้นกลับไป
// → รอบเช้าเปิดไม่ได้ → คาบเช้าไม่มีรอบที่ปิด → โค้ชไม่ได้เงินของคาบนั้น
func TestOpenSessionForSlotSeparatesTimeSlots(t *testing.T) {
	db := newScheduleRuleDB(t)
	svc := NewAttendanceService(db)

	const day = "2026-01-10"
	dayStart, dayEnd := day, "2026-01-11"
	pkgID := uint(1)

	parsed, _ := time.Parse("2006-01-02", day)
	afternoon := models.AttendanceSession{
		PackageID: pkgID, SessionDate: parsed,
		Status: models.AttendanceSessionClosed, OpenedAt: time.Now(), OpenedByUserID: 1,
		ScheduleStartTime: "14:00", ScheduleEndTime: "16:00",
	}
	mustCreate(t, db, &afternoon)
	db.Exec(`UPDATE attendance_sessions SET session_date = ? WHERE id = ?`, day, afternoon.ID)

	// ถามหารอบของคาบบ่าย → ต้องเจอ
	got, err := svc.openSessionForSlot(db, []uint{pkgID}, dayStart, dayEnd, "14:00", "16:00")
	if err != nil {
		t.Fatalf("หารอบคาบบ่ายไม่สำเร็จ: %v", err)
	}
	if got == nil || got.ID != afternoon.ID {
		t.Fatalf("ต้องเจอรอบของคาบบ่าย แต่ได้ %+v", got)
	}

	// ถามหารอบของคาบเช้า → ต้องไม่เจอ (ยังไม่เคยเปิด)
	got, err = svc.openSessionForSlot(db, []uint{pkgID}, dayStart, dayEnd, "10:00", "12:00")
	if err != nil {
		t.Fatalf("หารอบคาบเช้าไม่สำเร็จ: %v", err)
	}
	if got != nil {
		t.Fatalf("คาบเช้ายังไม่เคยเปิดรอบ ต้องไม่เจออะไร แต่ได้รอบ #%d (เวลา %s-%s) "+
			"— ถ้าเจอ แปลว่ารอบเช้าจะเปิดไม่ได้ตลอดกาล",
			got.ID, got.ScheduleStartTime, got.ScheduleEndTime)
	}
}

// รอบรุ่นเก่าที่ไม่มีสแนปช็อตเวลาต้องยังจับคู่ได้ตามเดิม
func TestOpenSessionForSlotFallsBackForLegacySessions(t *testing.T) {
	db := newScheduleRuleDB(t)
	svc := NewAttendanceService(db)

	const day = "2026-01-10"
	pkgID := uint(1)

	parsed, _ := time.Parse("2006-01-02", day)
	legacy := models.AttendanceSession{
		PackageID: pkgID, SessionDate: parsed,
		Status: models.AttendanceSessionClosed, OpenedAt: time.Now(), OpenedByUserID: 1,
		// ไม่มี ScheduleStartTime/EndTime
	}
	mustCreate(t, db, &legacy)
	db.Exec(`UPDATE attendance_sessions SET session_date = ? WHERE id = ?`, day, legacy.ID)

	got, err := svc.openSessionForSlot(db, []uint{pkgID}, day, "2026-01-11", "10:00", "12:00")
	if err != nil {
		t.Fatalf("หารอบรุ่นเก่าไม่สำเร็จ: %v", err)
	}
	if got == nil || got.ID != legacy.ID {
		t.Fatalf("รอบรุ่นเก่าที่ไม่มีสแนปช็อตเวลาต้องยังจับคู่ได้ แต่ได้ %+v", got)
	}
}

// ─── 5. แจ้งเตือนตอนเปลี่ยน/ยกเลิกตารางงาน ─────────────────────────────────

func countNotif(t *testing.T, db *gorm.DB, ntype string) int64 {
	t.Helper()
	var n int64
	if err := db.Model(&models.Notification{}).Where("type = ?", ntype).Count(&n).Error; err != nil {
		t.Fatalf("นับแจ้งเตือนไม่สำเร็จ: %v", err)
	}
	return n
}

func TestUpdateNotifiesBothCoachesOnReassign(t *testing.T) {
	db := newScheduleRuleDB(t)
	seedSlotCoach(t, db, slotCoachA, coachStatusActive)
	seedSlotCoach(t, db, slotCoachB, coachStatusActive)
	svc := NewWorkScheduleService(db)
	monday := nextMonday()

	created, err := svc.AssignWorkSchedule(slotReq(monday, slotCoachA, "10:00", "12:00", "1"))
	if err != nil {
		t.Fatalf("มอบหมายคาบไม่สำเร็จ: %v", err)
	}

	if _, err := svc.Update(created.ID, slotReq(monday, slotCoachB, "10:00", "12:00", "1")); err != nil {
		t.Fatalf("เปลี่ยนตัวโค้ชไม่สำเร็จ: %v", err)
	}

	if n := countNotif(t, db, "work_assigned"); n != 2 {
		t.Fatalf("ต้องแจ้งโค้ชคนใหม่ด้วย (รวมกับตอน assign แรก = 2) แต่ได้ %d", n)
	}
	if n := countNotif(t, db, "work_unassigned"); n != 1 {
		t.Fatalf("ต้องแจ้งโค้ชคนเก่าว่าถูกถอด 1 ครั้ง แต่ได้ %d "+
			"— ถ้าไม่แจ้ง คนเก่าจะยังคิดว่าต้องไปสอน คนใหม่ไม่รู้ว่าได้งาน", n)
	}
}

func TestUpdateNotifiesOnReschedule(t *testing.T) {
	db := newScheduleRuleDB(t)
	seedSlotCoach(t, db, slotCoachA, coachStatusActive)
	svc := NewWorkScheduleService(db)
	monday := nextMonday()

	created, err := svc.AssignWorkSchedule(slotReq(monday, slotCoachA, "10:00", "12:00", "1"))
	if err != nil {
		t.Fatalf("มอบหมายคาบไม่สำเร็จ: %v", err)
	}

	// เลื่อนเวลา → ต้องแจ้ง
	if _, err := svc.Update(created.ID, slotReq(monday, slotCoachA, "14:00", "16:00", "1")); err != nil {
		t.Fatalf("เลื่อนเวลาไม่สำเร็จ: %v", err)
	}
	if n := countNotif(t, db, "work_rescheduled"); n != 1 {
		t.Fatalf("เลื่อนเวลาต้องแจ้งโค้ช 1 ครั้ง แต่ได้ %d", n)
	}

	// แก้แค่เลขสนาม → ไม่ควรแจ้งเพิ่ม (ไม่กระทบว่าต้องไปตอนไหน)
	if _, err := svc.Update(created.ID, slotReq(monday, slotCoachA, "14:00", "16:00", "7")); err != nil {
		t.Fatalf("แก้เลขสนามไม่สำเร็จ: %v", err)
	}
	if n := countNotif(t, db, "work_rescheduled"); n != 1 {
		t.Fatalf("แก้เลขสนามไม่ควรแจ้งเพิ่ม แต่ได้ %d ครั้ง (เสียงรบกวนจนโค้ชเลิกอ่าน)", n)
	}
}

func TestUpdateKeepsEmergencyFlagOnce(t *testing.T) {
	db := newScheduleRuleDB(t)
	seedSlotCoach(t, db, slotCoachA, coachStatusActive)
	svc := NewWorkScheduleService(db)
	monday := nextMonday()

	created, err := svc.AssignWorkSchedule(slotReq(monday, slotCoachA, "10:00", "12:00", ""))
	if err != nil {
		t.Fatalf("มอบหมายคาบไม่สำเร็จ: %v", err)
	}
	if created.IsEmergency {
		t.Fatalf("คาบปกติไม่ควรติดธงฉุกเฉิน")
	}

	// แก้ผ่าน PATCH โดยส่ง ignore_availability มา → ต้องติดธง
	req := slotReq(monday, slotCoachA, "05:00", "07:00", "")
	req.IgnoreAvailability = true
	updated, err := svc.Update(created.ID, req)
	if err != nil {
		t.Fatalf("แก้แบบฉุกเฉินไม่สำเร็จ: %v", err)
	}
	if !updated.IsEmergency {
		t.Fatalf("ส่ง ignore_availability ผ่าน PATCH ต้องติดธง is_emergency " +
			"ไม่งั้นหลักฐานว่าคาบนี้ถูกมอบหมายนอกกฎหายไป")
	}

	// แก้ปกติทีหลังต้องไม่ล้างธง — เป็นข้อเท็จจริงทางประวัติศาสตร์
	again, err := svc.Update(created.ID, slotReq(monday, slotCoachA, "10:00", "12:00", "3"))
	if err != nil {
		t.Fatalf("แก้ครั้งที่สองไม่สำเร็จ: %v", err)
	}
	if !again.IsEmergency {
		t.Fatalf("ธงฉุกเฉินต้องติดแล้วติดเลย ห้ามถูกล้างด้วยการแก้ปกติ")
	}
}

func TestDeleteFutureScheduleNotifiesCoach(t *testing.T) {
	db := newScheduleRuleDB(t)
	seedSlotCoach(t, db, slotCoachA, coachStatusActive)
	svc := NewWorkScheduleService(db)

	created, err := svc.AssignWorkSchedule(slotReq(nextMonday(), slotCoachA, "10:00", "12:00", "1"))
	if err != nil {
		t.Fatalf("มอบหมายคาบไม่สำเร็จ: %v", err)
	}

	if err := svc.Delete(created.ID); err != nil {
		t.Fatalf("ลบคาบในอนาคตไม่สำเร็จ: %v", err)
	}
	if n := countNotif(t, db, "work_cancelled"); n != 1 {
		t.Fatalf("ยกเลิกคาบต้องแจ้งโค้ช 1 ครั้ง แต่ได้ %d — โค้ชวางแผนวันนั้นไว้แล้ว", n)
	}
}

// ─── 6. พักงานโค้ชแล้วคาบในอนาคตต้องไม่เงียบ ────────────────────────────────

func TestSuspendedCoachFutureClassesAreSurfaced(t *testing.T) {
	db := newScheduleRuleDB(t)
	seedSlotCoach(t, db, slotCoachA, coachStatusActive)

	// แอดมินสองคนไว้เช็คว่า NotifyAdmins ส่งถึงทุกคน
	mustCreate(t, db, &models.User{FirstName: "แอด", LastName: "หนึ่ง",
		Email: "admin1@example.test", Role: models.AdminRole})

	svc := NewWorkScheduleService(db)
	if _, err := svc.AssignWorkSchedule(slotReq(nextMonday(), slotCoachA, "10:00", "12:00", "1")); err != nil {
		t.Fatalf("มอบหมายคาบไม่สำเร็จ: %v", err)
	}

	future, err := NotifyCoachSuspension(db, slotCoachA)
	if err != nil {
		t.Fatalf("แจ้งเตือนการพักงานไม่สำเร็จ: %v", err)
	}
	if len(future) != 1 {
		t.Fatalf("ต้องคืนคาบที่ต้องหาคนแทน 1 คาบ แต่ได้ %d", len(future))
	}

	if n := countNotif(t, db, "coach_suspended_schedules"); n < 1 {
		t.Fatalf("ต้องแจ้งแอดมินว่ามีคาบค้าง แต่ไม่มีแจ้งเตือนเลย")
	}
	if n := countNotif(t, db, "coach_suspended"); n != 1 {
		t.Fatalf("ต้องแจ้งตัวโค้ชด้วย 1 ครั้ง แต่ได้ %d", n)
	}
}

func TestSuspendedCoachWithoutFutureClassesIsQuiet(t *testing.T) {
	db := newScheduleRuleDB(t)
	seedSlotCoach(t, db, slotCoachA, coachStatusActive)

	future, err := NotifyCoachSuspension(db, slotCoachA)
	if err != nil {
		t.Fatalf("ตรวจการพักงานไม่สำเร็จ: %v", err)
	}
	if len(future) != 0 {
		t.Fatalf("ไม่มีคาบค้าง ต้องคืนรายการว่าง แต่ได้ %d", len(future))
	}
	if n := countNotif(t, db, "coach_suspended_schedules"); n != 0 {
		t.Fatalf("ไม่มีคาบค้างก็ไม่ต้องกวนใคร แต่แจ้งไป %d ครั้ง", n)
	}
}

// ─── 7. รูปแบบเวลาปนกันในฐาน = จับคู่คลาสพลาด ───────────────────────────────

func TestNormalizeClockTime(t *testing.T) {
	cases := map[string]string{
		"18:00":    "18:00",
		"18:00:00": "18:00", // รูปแบบที่ Postgres คืนมาจากคอลัมน์ time
		"9:00":     "09:00", // ข้อมูลเก่าที่ไม่เติมศูนย์
		"":         "",      // ว่างต้องยังว่าง (รอบรุ่นเก่าไม่มีสแนปช็อตเวลา)
		"ขยะ":      "ขยะ",   // อ่านไม่ออกต้องคืนค่าเดิม ไม่ใช่กลืนเป็นค่าอื่น
	}
	for in, want := range cases {
		if got := normalizeClockTime(in); got != want {
			t.Errorf("normalizeClockTime(%q) = %q ต้องเป็น %q", in, got, want)
		}
	}
}

// รูปแบบเวลาปนกันในฐาน ("18:00" vs "18:00:00") ทำให้ทางจับคู่ด้วยเวลาใช้ไม่ได้
//
// เคสนี้ตารางงานชี้แพ็กเกจพี่น้อง (ไม่ใช่ตัวที่รอบเช็คชื่ออยู่) จึงพึ่งทาง package_id
// ไม่ได้เลย เหลือแต่ทางเวลา — ซึ่งพังถ้ารูปแบบไม่ตรงกัน
//
// เป็นเหตุผลที่ยังต้องมี NormalizeClockTimeColumns แม้จะรับการจับคู่สองทางแล้ว
func TestMixedTimeFormatBreaksTimeMatchingUntilNormalized(t *testing.T) {
	db := newScheduleRuleDB(t)

	const day = "2026-01-05"
	// สองแพ็กเกจในคอร์สเดียวกัน (คลาสเดียวกัน เรียนพร้อมกัน)
	mustCreate(t, db, &models.Package{Model: gorm.Model{ID: 2}, SessionsCount: 12, CourseID: 1})

	// ตารางงานชี้แพ็กเกจ 2 เก็บเวลา "18:00"
	pkg := uint(2)
	ws := models.WorkSchedule{
		CoachID: slotCoachA, CourseID: 1, PackageID: &pkg,
		Date: day, StartTime: "18:00", EndTime: "20:00",
		Description: "ทดสอบ", PayRateSnapshot: 300,
	}
	mustCreate(t, db, &ws)
	db.Exec(`UPDATE work_schedules SET date = ? WHERE id = ?`, day, ws.ID)

	// รอบเช็คชื่ออยู่บนแพ็กเกจ 1 เก็บเวลา "18:00:00" — คาบเดียวกัน คนละรูปแบบ
	parsed, _ := time.Parse("2006-01-02", day)
	sess := models.AttendanceSession{
		PackageID: 1, SessionDate: parsed,
		Status: models.AttendanceSessionClosed, OpenedAt: time.Now(), OpenedByUserID: 1,
		ScheduleStartTime: "18:00:00", ScheduleEndTime: "20:00:00",
	}
	mustCreate(t, db, &sess)
	db.Exec(`UPDATE attendance_sessions SET session_date = ? WHERE id = ?`, day, sess.ID)

	// ก่อนแปลง: package_id ไม่ตรง และเวลาคนละรูปแบบ → จับคู่ไม่ติดทั้งสองทาง
	if n := paidSessionCount(t, db, slotCoachA); n != 0 {
		t.Fatalf("เตรียมเคสไม่ตรงตามที่ต้องการ: ควรจับคู่ไม่ติด แต่ได้ %d", n)
	}

	if err := NormalizeClockTimeColumns(db); err != nil {
		t.Fatalf("แปลงรูปแบบเวลาไม่สำเร็จ: %v", err)
	}

	// หลังแปลง: เวลาเป็น "18:00" ทั้งคู่ → ทางเวลาใช้ได้ → ได้เงิน
	if n := paidSessionCount(t, db, slotCoachA); n != 1 {
		t.Fatalf("แปลงรูปแบบเวลาแล้วต้องจับคู่ได้และนับเงิน 1 คาบ แต่ได้ %d "+
			"— ถ้ายังเป็น 0 แปลว่า migration ไม่ได้แก้ต้นเหตุ", n)
	}

	// รันซ้ำต้องไม่เปลี่ยนอะไรอีก
	if err := NormalizeClockTimeColumns(db); err != nil {
		t.Fatalf("รันซ้ำต้องปลอดภัย แต่ได้ error: %v", err)
	}
	if n := paidSessionCount(t, db, slotCoachA); n != 1 {
		t.Fatalf("รันซ้ำแล้วผลต้องเท่าเดิม แต่ได้ %d", n)
	}
}
