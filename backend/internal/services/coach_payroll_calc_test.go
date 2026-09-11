package services

import (
	"errors"
	"testing"
	"time"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"

	"gorm.io/gorm"
)

// เทสชุดนี้คุมการคิดค่าจ้างโค้ช ซึ่งเดิมอยู่ใน React ทั้งหมด
//
// ─── บั๊กที่เคยเกิด ───
//
//  1. สูตร (จำนวนคาบ × pay_rate) − ที่จ่ายแล้ว อยู่ที่ frontend
//     backend รับ Amount มาเท่าไหร่ก็บันทึก ไม่เคยตรวจ
//
//  2. จำนวนคาบคือ "ทั้งหมดตั้งแต่เริ่มงาน" แต่คูณด้วยเรต "ปัจจุบัน"
//     ขึ้นค่าจ้างจาก 300 เป็น 400 → ระบบคิดว่าค้างจ่ายย้อนหลังทุกคาบในอัตราใหม่
//
// ─── กติกาปัจจุบัน ───
//
//	ยอด = ผลรวมของ work_schedules.pay_rate_snapshot ของคาบที่นับเป็นเงินแล้ว
//	และ backend คิดใหม่เองทุกครั้งที่บันทึกค่าจ้าง แล้วปฏิเสธถ้าเกิน

const (
	wageCoachID = uint(81)
	wageStart   = "18:00"
	wageEnd     = "20:00"
)

func newPayrollCalcTestDB(t *testing.T) *gorm.DB {
	return newTestDB(t,
		&models.WorkSchedule{}, &models.AttendanceSession{}, &models.CoachAttendance{},
		&models.Package{}, &models.PackageSchedule{}, &models.Course{},
		&models.Coach{}, &models.User{}, &models.Expense{}, &models.Notification{},
	)
}

// seedWageCoach สร้างโค้ชหนึ่งคนพร้อมบัญชีผู้ใช้
func seedWageCoach(t *testing.T, db *gorm.DB, paymentType string, rate float64) {
	t.Helper()
	user := models.User{FirstName: "โค้ช", LastName: "ทดสอบ", Email: "wage-coach@example.test"}
	mustCreate(t, db, &user)
	mustCreate(t, db, &models.Coach{
		Model:       gorm.Model{ID: wageCoachID},
		UserID:      user.ID,
		Nickname:    "เทส",
		PaymentType: paymentType,
		PayRate:     rate,
	})
	mustCreate(t, db, &models.Package{Model: gorm.Model{ID: 1}, SessionsCount: 8, CourseID: 1})
}

// seedPaidClass สร้างคาบที่ "นับเป็นเงินแล้ว" 1 คาบ ในอัตราที่ระบุ
//
// ⚠️ UPDATE ตามหลังเป็นข้อจำกัดของ sqlite ล้วน ๆ ไม่ใช่บั๊กในโค้ดจริง
// work_schedules.date เป็น string ส่วน attendance_sessions.session_date เป็น time.Time
// บน postgres ทั้งคู่เป็นคอลัมน์ date จึงเทียบกันได้ แต่ sqlite เก็บคนละรูปแบบ
func seedPaidClass(t *testing.T, db *gorm.DB, date string, rate float64) {
	t.Helper()

	pkgID := uint(1)
	ws := models.WorkSchedule{
		CoachID: wageCoachID, CourseID: 1, PackageID: &pkgID,
		Date: date, StartTime: wageStart, EndTime: wageEnd,
		PayRateSnapshot: rate,
	}
	mustCreate(t, db, &ws)
	if err := db.Exec(`UPDATE work_schedules SET date = ? WHERE id = ?`, date, ws.ID).Error; err != nil {
		t.Fatalf("ปรับรูปแบบวันที่ของตารางงานไม่สำเร็จ: %v", err)
	}

	day, _ := time.Parse("2006-01-02", date)
	sess := models.AttendanceSession{
		PackageID: pkgID, SessionDate: day,
		Status: models.AttendanceSessionClosed, OpenedAt: time.Now(), OpenedByUserID: 1,
		ScheduleStartTime: wageStart, ScheduleEndTime: wageEnd,
	}
	mustCreate(t, db, &sess)
	if err := db.Exec(`UPDATE attendance_sessions SET session_date = ? WHERE id = ?`,
		date, sess.ID).Error; err != nil {
		t.Fatalf("ปรับรูปแบบวันที่ของรอบเช็คชื่อไม่สำเร็จ: %v", err)
	}
}

func payrollOf(t *testing.T, db *gorm.DB) *dto.CoachPayrollDTO {
	t.Helper()
	p, err := ComputeCoachPayroll(db, wageCoachID, time.Now())
	if err != nil {
		t.Fatalf("คำนวณค่าจ้างไม่สำเร็จ: %v", err)
	}
	return p
}

func payWage(db *gorm.DB, amount float64) error {
	coachID := wageCoachID
	_, err := NewExpenseService(db).CreateExpense(dto.CreateExpenseRequest{
		Amount:  amount,
		Type:    models.ExpenseTypeCoach,
		Date:    time.Now(),
		CoachID: &coachID,
	}, 0)
	return err
}

// ─── 1. หัวใจของบั๊ก: ปรับเรตแล้วอดีตต้องไม่ขยับ ────────────────────────────

func TestPayrollUsesSnapshotNotCurrentRate(t *testing.T) {
	db := newPayrollCalcTestDB(t)
	seedWageCoach(t, db, PaymentTypePerSession, 300)
	seedPaidClass(t, db, "2026-01-05", 300)
	seedPaidClass(t, db, "2026-01-12", 300)

	if got := payrollOf(t, db); got.Expected != 600 {
		t.Fatalf("สอน 2 คาบที่เรต 300 ต้องได้ 600 แต่ได้ %.2f", got.Expected)
	}

	// แอดมินขึ้นค่าจ้างเป็น 400 — มีผลกับคาบที่จะมอบหมาย "หลังจากนี้" เท่านั้น
	if err := db.Model(&models.Coach{}).Where("id = ?", wageCoachID).
		Update("pay_rate", 400).Error; err != nil {
		t.Fatalf("ปรับอัตราค่าจ้างไม่สำเร็จ: %v", err)
	}

	got := payrollOf(t, db)
	if got.Expected != 600 {
		t.Fatalf("ขึ้นค่าจ้างแล้วยอดย้อนหลังต้องไม่เปลี่ยน (ต้องเป็น 600) แต่ได้ %.2f "+
			"— นี่คือบั๊ก 'ปรับเรตแล้วหนี้ย้อนหลังโผล่มาเป็นก้อน'", got.Expected)
	}
	if got.PayRate != 400 {
		t.Fatalf("อัตราปัจจุบันที่แสดงผลควรเป็น 400 แต่ได้ %.2f", got.PayRate)
	}
}

func TestPayrollBreaksDownByRate(t *testing.T) {
	db := newPayrollCalcTestDB(t)
	seedWageCoach(t, db, PaymentTypePerSession, 400)
	seedPaidClass(t, db, "2026-01-05", 300) // ก่อนขึ้นค่าจ้าง
	seedPaidClass(t, db, "2026-01-12", 300)
	seedPaidClass(t, db, "2026-02-02", 400) // หลังขึ้นค่าจ้าง

	got := payrollOf(t, db)
	if got.Expected != 1000 {
		t.Fatalf("2×300 + 1×400 ต้องได้ 1000 แต่ได้ %.2f", got.Expected)
	}
	if got.SessionsDone != 3 {
		t.Fatalf("ต้องนับได้ 3 คาบ แต่ได้ %d", got.SessionsDone)
	}
	if len(got.RateBreakdown) != 2 {
		t.Fatalf("ต้องแยกได้ 2 อัตรา แต่ได้ %+v", got.RateBreakdown)
	}
	if got.RateBreakdown[0].PayRate != 300 || got.RateBreakdown[0].Sessions != 2 {
		t.Fatalf("บรรทัดแรกควรเป็น 2 คาบ × 300 แต่ได้ %+v", got.RateBreakdown[0])
	}
	if got.RateBreakdown[1].PayRate != 400 || got.RateBreakdown[1].Sessions != 1 {
		t.Fatalf("บรรทัดที่สองควรเป็น 1 คาบ × 400 แต่ได้ %+v", got.RateBreakdown[1])
	}
}

// ─── 2. คาบที่ไม่มีรอบเช็คชื่อต้องแยกออกจากยอด ไม่ใช่หายไป ──────────────────

func TestPayrollReportsUnresolvedSeparately(t *testing.T) {
	db := newPayrollCalcTestDB(t)
	seedWageCoach(t, db, PaymentTypePerSession, 300)
	seedPaidClass(t, db, "2026-01-05", 300)

	// คาบที่มอบหมายไว้แต่ไม่เคยมีรอบเช็คชื่อ
	pkgID := uint(1)
	ws := models.WorkSchedule{
		CoachID: wageCoachID, CourseID: 1, PackageID: &pkgID,
		Date: "2026-01-19", StartTime: wageStart, EndTime: wageEnd, PayRateSnapshot: 300,
	}
	mustCreate(t, db, &ws)
	db.Exec(`UPDATE work_schedules SET date = ? WHERE id = ?`, "2026-01-19", ws.ID)

	got := payrollOf(t, db)
	if got.Expected != 300 {
		t.Fatalf("คาบที่ไม่มีรอบเช็คชื่อต้องไม่ถูกนับเข้ายอด (ต้องเป็น 300) แต่ได้ %.2f", got.Expected)
	}
	if got.UnresolvedSessions != 1 || got.UnresolvedAmount != 300 {
		t.Fatalf("ต้องรายงานว่ามี 1 คาบ 300 บาทที่ยังไม่ถูกนับ แต่ได้ %d คาบ %.2f บาท",
			got.UnresolvedSessions, got.UnresolvedAmount)
	}
}

// ─── 3. ด่านตรวจยอดตอนบันทึกค่าจ้าง ──────────────────────────────────────────

func TestCreateExpenseRejectsAmountAboveUnpaid(t *testing.T) {
	db := newPayrollCalcTestDB(t)
	seedWageCoach(t, db, PaymentTypePerSession, 300)
	seedPaidClass(t, db, "2026-01-05", 300)
	seedPaidClass(t, db, "2026-01-12", 300)

	if err := payWage(db, 5000); !errors.Is(err, ErrPayrollExceeds) {
		t.Fatalf("ยอดเกินต้องถูกปฏิเสธ แต่ได้ error: %v", err)
	}

	var rows int64
	db.Model(&models.Expense{}).Count(&rows)
	if rows != 0 {
		t.Fatalf("คำขอที่ถูกปฏิเสธต้องไม่ถูกบันทึก แต่มี %d แถว", rows)
	}
}

func TestCreateExpenseAllowsExactAndPartialPayment(t *testing.T) {
	db := newPayrollCalcTestDB(t)
	seedWageCoach(t, db, PaymentTypePerSession, 300)
	seedPaidClass(t, db, "2026-01-05", 300)
	seedPaidClass(t, db, "2026-01-12", 300)

	// จ่ายบางส่วนได้ (แบ่งจ่ายเป็นเรื่องปกติ)
	if err := payWage(db, 200); err != nil {
		t.Fatalf("จ่ายบางส่วนต้องทำได้ แต่ได้ error: %v", err)
	}
	if got := payrollOf(t, db); got.Unpaid != 400 {
		t.Fatalf("จ่ายไป 200 จาก 600 ต้องเหลือค้าง 400 แต่ได้ %.2f", got.Unpaid)
	}

	// จ่ายส่วนที่เหลือพอดีต้องไม่ติดเศษทศนิยม
	if err := payWage(db, 400); err != nil {
		t.Fatalf("จ่ายยอดที่เหลือพอดีต้องทำได้ แต่ได้ error: %v", err)
	}
	if got := payrollOf(t, db); got.Unpaid != 0 {
		t.Fatalf("จ่ายครบแล้วต้องไม่เหลือค้าง แต่ได้ %.2f", got.Unpaid)
	}

	// จ่ายซ้ำอีกครั้งต้องถูกปฏิเสธ — ด่านนี้กันกดปุ่มจ่ายสองที
	if err := payWage(db, 100); !errors.Is(err, ErrPayrollNoUnpaid) {
		t.Fatalf("ไม่มียอดค้างแล้วต้องจ่ายไม่ได้ แต่ได้ error: %v", err)
	}
}

// โบนัส/รายได้อื่นไม่ได้ผูกกับจำนวนคาบ จึงต้องไม่ถูกด่านค่าจ้างบล็อก
func TestCreateExpenseDoesNotValidateOtherTypes(t *testing.T) {
	db := newPayrollCalcTestDB(t)
	seedWageCoach(t, db, PaymentTypePerSession, 300)

	coachID := wageCoachID
	if _, err := NewExpenseService(db).CreateExpense(dto.CreateExpenseRequest{
		Amount:  9999,
		Type:    models.ExpenseTypeCoachOther,
		Date:    time.Now(),
		CoachID: &coachID,
	}, 0); err != nil {
		t.Fatalf("โบนัสไม่ควรถูกด่านค่าจ้างบล็อก แต่ได้ error: %v", err)
	}

	// และต้องไม่ไปหักยอดค่าจ้างตามคาบด้วย
	seedPaidClass(t, db, "2026-01-05", 300)
	if got := payrollOf(t, db); got.AlreadyPaid != 0 || got.Unpaid != 300 {
		t.Fatalf("โบนัสต้องไม่นับเป็นค่าจ้างตามคาบ แต่ได้ จ่ายแล้ว %.2f ค้าง %.2f",
			got.AlreadyPaid, got.Unpaid)
	}
}

func TestCreateExpenseWageRequiresCoach(t *testing.T) {
	db := newPayrollCalcTestDB(t)
	seedWageCoach(t, db, PaymentTypePerSession, 300)

	_, err := NewExpenseService(db).CreateExpense(dto.CreateExpenseRequest{
		Amount: 300,
		Type:   models.ExpenseTypeCoach,
		Date:   time.Now(),
	}, 0)
	if !errors.Is(err, ErrPayrollNeedsCoach) {
		t.Fatalf("ค่าจ้างโค้ชที่ไม่ระบุโค้ชต้องถูกปฏิเสธ แต่ได้ error: %v", err)
	}
}

// ─── 4. โค้ชรายเดือน ─────────────────────────────────────────────────────────

func TestPayrollMonthlyCoachIgnoresSessionCount(t *testing.T) {
	db := newPayrollCalcTestDB(t)
	seedWageCoach(t, db, PaymentTypeMonthly, 12000)
	seedPaidClass(t, db, "2026-01-05", 0)
	seedPaidClass(t, db, "2026-01-12", 0)

	got := payrollOf(t, db)
	if got.Expected != 12000 || got.Unpaid != 12000 {
		t.Fatalf("โค้ชรายเดือนต้องคิดเป็นเงินเดือนเต็ม ไม่ขึ้นกับจำนวนคาบ แต่ได้ %+v", got)
	}
	if got.SessionsDone != 0 {
		t.Fatalf("โค้ชรายเดือนไม่นับคาบ แต่ได้ %d", got.SessionsDone)
	}

	if err := payWage(db, 12000); err != nil {
		t.Fatalf("จ่ายเงินเดือนไม่สำเร็จ: %v", err)
	}
	if got := payrollOf(t, db); got.Unpaid != 0 {
		t.Fatalf("จ่ายเงินเดือนแล้วต้องไม่เหลือค้างในเดือนนี้ แต่ได้ %.2f", got.Unpaid)
	}
}

// ─── 5. สแนปช็อตถูกเขียนตอนมอบหมายจริงไหม ───────────────────────────────────

func TestAssignWorkScheduleStoresPayRateSnapshot(t *testing.T) {
	db := newPayrollCalcTestDB(t)
	mustMigrate(t, db, &models.CoachAvailability{})
	seedWageCoach(t, db, PaymentTypePerSession, 350)
	mustCreate(t, db, &models.CoachAvailability{
		CoachID: wageCoachID, DayOfWeek: "Monday", StartTime: "08:00", EndTime: "22:00",
	})

	svc := NewWorkScheduleService(db)
	future := time.Now().AddDate(0, 0, 7)
	for future.Weekday() != time.Monday {
		future = future.AddDate(0, 0, 1)
	}

	created, err := svc.AssignWorkSchedule(dto.CreateWorkScheduleRequest{
		Date: future.Format("2006-01-02"), StartTime: wageStart, EndTime: wageEnd,
		Description: "ทดสอบ", CoachID: wageCoachID, CourseID: 1,
	})
	if err != nil {
		t.Fatalf("มอบหมายตารางงานไม่สำเร็จ: %v", err)
	}
	if created.PayRateSnapshot != 350 {
		t.Fatalf("ต้องเก็บอัตราค่าจ้าง ณ วันมอบหมาย (350) แต่ได้ %.2f "+
			"— ถ้าไม่เก็บ ยอดย้อนหลังจะเปลี่ยนตามเรตปัจจุบันอีก", created.PayRateSnapshot)
	}
}

func mustMigrate(t *testing.T, db *gorm.DB, tables ...any) {
	t.Helper()
	if err := db.AutoMigrate(tables...); err != nil {
		t.Fatalf("AutoMigrate เพิ่มเติมไม่สำเร็จ: %v", err)
	}
}
