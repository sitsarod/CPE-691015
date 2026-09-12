package services

import (
	"errors"
	"testing"
	"time"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"

	"gorm.io/gorm"
)

// เทสชุดนี้คุมช่องที่ "เงินรั่วได้เงียบ ๆ" รอบสุดท้ายของฝั่งค่าจ้างโค้ช
//
// ─── สิ่งที่ตรึงไว้ ───
//
//  1. ยอดรายเดือนต้องมาจากสแนปช็อตเรต ไม่ใช่เรตปัจจุบัน (หน้าโค้ชใช้ตัวนี้)
//  2. ลบรายการจ่ายเงินต้องเป็น soft delete + แจ้งโค้ช ไม่ใช่หายถาวรแบบเงียบ
//  3. บันทึกหลายรายการต้องสำเร็จทั้งหมดหรือไม่สำเร็จเลย
//  4. สลับวิธีจ่ายค่าจ้างต้องไม่ทำให้เงินที่ค้างอยู่หายไป
//  5. คาบที่ผ่านไปแล้วต้องลบ/ย้ายไม่ได้ เพราะเป็นบันทึกที่ใช้คิดเงิน

// ─── 1. ยอดรายเดือน ──────────────────────────────────────────────────────────

func TestMonthlyBreakdownUsesSnapshotRates(t *testing.T) {
	db := newPayrollCalcTestDB(t)
	seedWageCoach(t, db, PaymentTypePerSession, 300)
	seedPaidClass(t, db, "2026-01-05", 300)
	seedPaidClass(t, db, "2026-01-12", 300)
	seedPaidClass(t, db, "2026-02-02", 400)

	// ขึ้นค่าจ้างเป็น 500 — ยอดรายเดือนของอดีตต้องไม่ขยับตาม
	if err := db.Model(&models.Coach{}).Where("id = ?", wageCoachID).
		Update("pay_rate", 500).Error; err != nil {
		t.Fatalf("ปรับอัตราค่าจ้างไม่สำเร็จ: %v", err)
	}

	got := payrollOf(t, db)
	if len(got.MonthlyBreakdown) != 2 {
		t.Fatalf("ต้องแยกได้ 2 เดือน แต่ได้ %+v", got.MonthlyBreakdown)
	}

	jan := got.MonthlyBreakdown[0]
	if jan.Year != 2026 || jan.Month != 1 || jan.Sessions != 2 || jan.Expected != 600 {
		t.Fatalf("มกราต้องเป็น 2 คาบ 600 บาท (เรตตอนนั้น 300) แต่ได้ %+v "+
			"— ถ้าได้ 1000 แปลว่าไปคูณเรตปัจจุบันแล้ว", jan)
	}

	feb := got.MonthlyBreakdown[1]
	if feb.Month != 2 || feb.Sessions != 1 || feb.Expected != 400 {
		t.Fatalf("กุมภาต้องเป็น 1 คาบ 400 บาท แต่ได้ %+v", feb)
	}
}

// เดือนที่จ่ายเงินแต่ไม่มีคาบ (จ่ายตกเบิกข้ามเดือน) ต้องยังโผล่ในตาราง
// ไม่งั้นเงินที่โค้ชได้รับจริงจะหายไปจากสายตาทั้งก้อน
func TestMonthlyBreakdownShowsPaymentOnlyMonths(t *testing.T) {
	db := newPayrollCalcTestDB(t)
	seedWageCoach(t, db, PaymentTypePerSession, 300)
	seedPaidClass(t, db, "2026-01-05", 300)

	if err := payWage(db, 300); err != nil {
		t.Fatalf("จ่ายค่าจ้างไม่สำเร็จ: %v", err)
	}

	got := payrollOf(t, db)
	nowKey := time.Now().In(appLocation())

	var paidMonth *dto.PayrollMonthDTO
	for i := range got.MonthlyBreakdown {
		m := &got.MonthlyBreakdown[i]
		if m.Year == nowKey.Year() && m.Month == int(nowKey.Month()) {
			paidMonth = m
		}
	}
	if paidMonth == nil {
		t.Fatalf("เดือนที่จ่ายเงินต้องโผล่ในตาราง แต่ได้ %+v", got.MonthlyBreakdown)
	}
	if paidMonth.Paid != 300 {
		t.Fatalf("เดือนที่จ่ายต้องแสดงยอด 300 แต่ได้ %.2f", paidMonth.Paid)
	}
}

// ─── 2. ลบรายการจ่ายเงิน ─────────────────────────────────────────────────────

func TestDeleteExpenseIsSoftAndNotifiesCoach(t *testing.T) {
	db := newPayrollCalcTestDB(t)
	seedWageCoach(t, db, PaymentTypePerSession, 300)
	seedPaidClass(t, db, "2026-01-05", 300)

	if err := payWage(db, 300); err != nil {
		t.Fatalf("จ่ายค่าจ้างไม่สำเร็จ: %v", err)
	}
	if got := payrollOf(t, db); got.Unpaid != 0 {
		t.Fatalf("จ่ายครบแล้วต้องไม่เหลือค้าง แต่ได้ %.2f", got.Unpaid)
	}

	var expense models.Expense
	if err := db.First(&expense).Error; err != nil {
		t.Fatalf("หารายการที่จ่ายไปไม่เจอ: %v", err)
	}

	const adminID = uint(7)
	if err := NewExpenseService(db).DeleteExpense(expense.ID, adminID); err != nil {
		t.Fatalf("ลบรายการไม่สำเร็จ: %v", err)
	}

	// แถวต้องยังอยู่ในฐาน ตรวจย้อนหลังได้ว่าเคยจ่ายแล้วถูกยกเลิก
	var stillThere int64
	db.Unscoped().Model(&models.Expense{}).Where("id = ?", expense.ID).Count(&stillThere)
	if stillThere != 1 {
		t.Fatalf("ต้องเป็น soft delete แถวยังอยู่ แต่หายไปจากฐานถาวร")
	}

	var visible int64
	db.Model(&models.Expense{}).Where("id = ?", expense.ID).Count(&visible)
	if visible != 0 {
		t.Fatalf("แถวที่ลบแล้วต้องไม่ถูกนับในการคิดเงิน แต่ยังเห็นอยู่")
	}

	// ยอดค้างเด้งกลับ = พฤติกรรมที่ต้องการ (ลบเพราะบันทึกผิด) แต่ต้องไม่เงียบ
	if got := payrollOf(t, db); got.Unpaid != 300 {
		t.Fatalf("ยกเลิกการจ่ายแล้วยอดต้องกลับมาค้าง 300 แต่ได้ %.2f", got.Unpaid)
	}

	var notifs int64
	db.Model(&models.Notification{}).Where("type = ?", "coach_expense_removed").Count(&notifs)
	if notifs != 1 {
		t.Fatalf("ต้องแจ้งโค้ชว่ารายได้ถูกยกเลิก 1 ครั้ง แต่ได้ %d", notifs)
	}
}

// ─── 3. บันทึกหลายรายการต้องเป็นก้อนเดียว ───────────────────────────────────

func TestCreateExpensesBatchIsAllOrNothing(t *testing.T) {
	db := newPayrollCalcTestDB(t)
	seedWageCoach(t, db, PaymentTypePerSession, 300)
	seedPaidClass(t, db, "2026-01-05", 300)

	coachID := wageCoachID
	_, err := NewExpenseService(db).CreateExpenses([]dto.CreateExpenseRequest{
		// โบนัสผ่านได้ตามปกติ
		{Amount: 500, Type: models.ExpenseTypeCoachOther, Date: time.Now(), CoachID: &coachID},
		// ค่าจ้างเกินยอดค้าง (ค้างจริง 300) — ต้องทำให้ทั้งก้อนตกไป
		{Amount: 9999, Type: models.ExpenseTypeCoach, Date: time.Now(), CoachID: &coachID},
	}, 0)
	if !errors.Is(err, ErrPayrollExceeds) {
		t.Fatalf("ยอดค่าจ้างเกินต้องถูกปฏิเสธ แต่ได้ error: %v", err)
	}

	var rows int64
	db.Model(&models.Expense{}).Count(&rows)
	if rows != 0 {
		t.Fatalf("ก้อนที่ถูกปฏิเสธต้องไม่เขียนอะไรลงไปเลย แต่มี %d แถว "+
			"— โบนัสที่อยู่ก่อนรายการที่พังต้องถูก rollback ด้วย", rows)
	}
}

func TestCreateExpensesBatchRejectsTwoWagesForSameCoach(t *testing.T) {
	db := newPayrollCalcTestDB(t)
	seedWageCoach(t, db, PaymentTypePerSession, 300)
	seedPaidClass(t, db, "2026-01-05", 300)
	seedPaidClass(t, db, "2026-01-12", 300)

	coachID := wageCoachID
	// ยอดค้าง 600 · ถ้าปล่อยให้ส่งสองรายการ ๆ ละ 600 จะผ่านด่านทั้งคู่ = จ่าย 1200
	_, err := NewExpenseService(db).CreateExpenses([]dto.CreateExpenseRequest{
		{Amount: 600, Type: models.ExpenseTypeCoach, Date: time.Now(), CoachID: &coachID},
		{Amount: 600, Type: models.ExpenseTypeCoach, Date: time.Now(), CoachID: &coachID},
	}, 0)
	if !errors.Is(err, ErrPayrollExceeds) {
		t.Fatalf("ค่าจ้างของโค้ชคนเดียวกันซ้อนกันต้องถูกปฏิเสธ แต่ได้ error: %v", err)
	}

	var total float64
	db.Model(&models.Expense{}).Select("COALESCE(SUM(amount),0)").Scan(&total)
	if total != 0 {
		t.Fatalf("ต้องไม่มีเงินถูกบันทึกเลย แต่รวมได้ %.2f", total)
	}
}

func TestCreateExpensesBatchWritesEverythingOnSuccess(t *testing.T) {
	db := newPayrollCalcTestDB(t)
	seedWageCoach(t, db, PaymentTypePerSession, 300)
	seedPaidClass(t, db, "2026-01-05", 300)

	coachID := wageCoachID
	created, err := NewExpenseService(db).CreateExpenses([]dto.CreateExpenseRequest{
		{Amount: 300, Type: models.ExpenseTypeCoach, Date: time.Now(), CoachID: &coachID},
		{Amount: 500, Type: models.ExpenseTypeCoachOther, Date: time.Now(), CoachID: &coachID},
	}, 0)
	if err != nil {
		t.Fatalf("บันทึกก้อนที่ถูกต้องไม่สำเร็จ: %v", err)
	}
	if len(created) != 2 {
		t.Fatalf("ต้องได้ 2 รายการ แต่ได้ %d", len(created))
	}

	// โบนัสต้องไม่มาหักยอดค่าจ้างตามคาบ
	if got := payrollOf(t, db); got.AlreadyPaid != 300 || got.Unpaid != 0 {
		t.Fatalf("ค่าจ้างที่จ่ายควรเป็น 300 และค้าง 0 แต่ได้ จ่าย %.2f ค้าง %.2f",
			got.AlreadyPaid, got.Unpaid)
	}
}

// ─── 4. สลับวิธีจ่ายค่าจ้าง ───────────────────────────────────────────────────

func TestSwitchAwayFromPerSessionBlockedWhileUnpaid(t *testing.T) {
	db := newPayrollCalcTestDB(t)
	seedWageCoach(t, db, PaymentTypePerSession, 300)
	seedPaidClass(t, db, "2026-01-05", 300)

	monthly := PaymentTypeMonthly
	_, err := NewCoachService(db).AdminUpdate(wageCoachID, dto.AdminUpdateCoachRequest{
		PaymentType: &monthly,
	})
	if !errors.Is(err, ErrCoachPaySwitchUnpaid) {
		t.Fatalf("ยังค้างจ่าย 300 ต้องสลับเป็นรายเดือนไม่ได้ แต่ได้ error: %v", err)
	}

	// ต้องไม่ถูกเขียนค้างไว้ครึ่ง ๆ
	var coach models.Coach
	db.First(&coach, wageCoachID)
	if coach.PaymentType != PaymentTypePerSession {
		t.Fatalf("คำขอที่ถูกปฏิเสธต้องไม่เปลี่ยนวิธีจ่าย แต่กลายเป็น %q", coach.PaymentType)
	}

	// เคลียร์ยอดแล้วต้องสลับได้ — ด่านนี้กันเงินหาย ไม่ใช่ห้ามตลอดกาล
	if err := payWage(db, 300); err != nil {
		t.Fatalf("จ่ายค่าจ้างไม่สำเร็จ: %v", err)
	}
	if _, err := NewCoachService(db).AdminUpdate(wageCoachID, dto.AdminUpdateCoachRequest{
		PaymentType: &monthly,
	}); err != nil {
		t.Fatalf("เคลียร์ยอดแล้วต้องสลับได้ แต่ได้ error: %v", err)
	}
}

func TestSwitchToPerSessionBackfillsSnapshots(t *testing.T) {
	db := newPayrollCalcTestDB(t)
	seedWageCoach(t, db, PaymentTypeMonthly, 12000)
	// โค้ชรายเดือน คาบจึงถูกบันทึกด้วยสแนปช็อต 0
	seedPaidClass(t, db, "2026-01-05", 0)
	seedPaidClass(t, db, "2026-01-12", 0)

	perSession := PaymentTypePerSession
	rate := 350.0
	if _, err := NewCoachService(db).AdminUpdate(wageCoachID, dto.AdminUpdateCoachRequest{
		PaymentType: &perSession,
		PayRate:     &rate,
	}); err != nil {
		t.Fatalf("สลับเป็นรายครั้งไม่สำเร็จ: %v", err)
	}

	got := payrollOf(t, db)
	if got.Expected != 700 {
		t.Fatalf("สลับเป็นรายครั้งแล้วคาบเดิม 2 คาบต้องคิดได้ 700 แต่ได้ %.2f "+
			"— ถ้าได้ 0 แปลว่าสแนปช็อตยังเป็น 0 ทั้งหมด จ่ายย้อนหลังไม่ได้", got.Expected)
	}
}

func TestAdminUpdateRejectsNegativePayRate(t *testing.T) {
	db := newPayrollCalcTestDB(t)
	seedWageCoach(t, db, PaymentTypePerSession, 300)

	bad := -500.0
	if _, err := NewCoachService(db).AdminUpdate(wageCoachID, dto.AdminUpdateCoachRequest{
		PayRate: &bad,
	}); !errors.Is(err, ErrCoachPayRateNegative) {
		t.Fatalf("อัตราติดลบต้องถูกปฏิเสธ แต่ได้ error: %v", err)
	}
}

// CoachService.Create เคยไม่ตรวจ pay_rate เลย ทั้งที่ AdminUpdate ตรวจ
// = กฎเดียวกันสองมาตรฐาน สร้างโค้ชด้วยอัตราติดลบได้
func TestCreateCoachRejectsNegativePayRate(t *testing.T) {
	db := newTestDB(t, &models.User{}, &models.Coach{}, &models.Customer{})

	user := models.User{FirstName: "โค้ช", LastName: "ใหม่",
		Email: "new-coach@example.test", Role: models.CoachRole}
	mustCreate(t, db, &user)

	_, err := NewCoachService(db).Create(dto.CreateCoachRequest{
		UserID:      user.ID,
		Uid:         "1234567890123",
		PaymentType: PaymentTypePerSession,
		PayRate:     -500,
	})
	if !errors.Is(err, ErrCoachPayRateNegative) {
		t.Fatalf("สร้างโค้ชด้วยอัตราติดลบต้องไม่ได้ แต่ได้ error: %v", err)
	}
}

// ─── 5. คาบที่ผ่านไปแล้วเป็นบันทึกที่ใช้คิดเงิน ─────────────────────────────

func newScheduleGuardDB(t *testing.T) *gorm.DB {
	return newTestDB(t, &models.WorkSchedule{}, &models.Coach{}, &models.User{},
		&models.CoachAvailability{}, &models.Package{}, &models.PackageSchedule{},
		&models.AttendanceSession{}, &models.CoachAttendance{}, &models.Course{})
}

func seedPastSchedule(t *testing.T, db *gorm.DB) models.WorkSchedule {
	t.Helper()
	mustCreate(t, db, &models.Coach{
		Model: gorm.Model{ID: wageCoachID}, Nickname: "เทส",
		PaymentType: PaymentTypePerSession, PayRate: 300, Status: coachStatusActive,
	})
	mustCreate(t, db, &models.CoachAvailability{
		CoachID: wageCoachID, DayOfWeek: "Monday", StartTime: "08:00", EndTime: "22:00",
	})

	pkg := uint(1)
	ws := models.WorkSchedule{
		CoachID: wageCoachID, CourseID: 1, PackageID: &pkg,
		Date: "2026-01-05", StartTime: "18:00", EndTime: "20:00", // จันทร์ · อดีต
		Courtnumber: "1", Description: "เดิม", PayRateSnapshot: 300,
	}
	mustCreate(t, db, &ws)
	db.Exec(`UPDATE work_schedules SET date = ? WHERE id = ?`, "2026-01-05", ws.ID)
	return ws
}

func TestDeletePastWorkScheduleIsBlocked(t *testing.T) {
	db := newScheduleGuardDB(t)
	ws := seedPastSchedule(t, db)

	err := NewWorkScheduleService(db).Delete(ws.ID)
	if !errors.Is(err, ErrScheduleConflict) {
		t.Fatalf("คาบที่ผ่านไปแล้วต้องลบไม่ได้ แต่ได้ error: %v", err)
	}

	var left int64
	db.Model(&models.WorkSchedule{}).Where("id = ?", ws.ID).Count(&left)
	if left != 1 {
		t.Fatalf("บันทึกที่ใช้คิดค่าจ้างต้องยังอยู่ แต่หายไปแล้ว")
	}
}

func TestUpdatePastWorkScheduleCannotMoveButCanFixCourt(t *testing.T) {
	db := newScheduleGuardDB(t)
	ws := seedPastSchedule(t, db)
	svc := NewWorkScheduleService(db)

	base := dto.CreateWorkScheduleRequest{
		Date: "2026-01-05", StartTime: "18:00", EndTime: "20:00",
		CoachID: wageCoachID, CourseID: 1, CourtNumber: "1", Description: "เดิม",
	}

	// ย้ายเวลา = เขียนประวัติการทำงานใหม่ → ต้องไม่ได้
	moved := base
	moved.StartTime = "16:00"
	moved.EndTime = "18:00"
	if _, err := svc.Update(ws.ID, moved); !errors.Is(err, ErrScheduleConflict) {
		t.Fatalf("ย้ายเวลาของคาบที่ผ่านไปแล้วต้องไม่ได้ แต่ได้ error: %v", err)
	}

	// เปลี่ยนตัวโค้ช = ย้ายเงินจากคนหนึ่งไปอีกคน → ต้องไม่ได้
	reassigned := base
	reassigned.CoachID = wageCoachID + 1
	if _, err := svc.Update(ws.ID, reassigned); !errors.Is(err, ErrScheduleConflict) {
		t.Fatalf("เปลี่ยนตัวโค้ชของคาบที่ผ่านไปแล้วต้องไม่ได้ แต่ได้ error: %v", err)
	}

	// แก้เลขสนามไม่เกี่ยวกับการคิดเงิน → ต้องยังทำได้ ไม่งั้นข้อมูลผิดค้างตลอดไป
	fixed := base
	fixed.CourtNumber = "5"
	updated, err := svc.Update(ws.ID, fixed)
	if err != nil {
		t.Fatalf("แก้เลขสนามของคาบเก่าต้องยังทำได้ แต่ได้ error: %v", err)
	}
	if updated.Courtnumber != "5" {
		t.Fatalf("เลขสนามต้องถูกแก้เป็น 5 แต่ได้ %q", updated.Courtnumber)
	}
	if updated.PayRateSnapshot != 300 {
		t.Fatalf("การแก้ที่ไม่เกี่ยวกับเงินต้องไม่แตะสแนปช็อตเรต แต่กลายเป็น %.2f",
			updated.PayRateSnapshot)
	}
}

// ย้ายคาบในอนาคตไปเป็นวันในอดีตก็ต้องไม่ได้ (กฎเดียวกับตอน assign)
func TestUpdateCannotMoveScheduleIntoThePast(t *testing.T) {
	db := newScheduleGuardDB(t)
	mustCreate(t, db, &models.Coach{
		Model: gorm.Model{ID: wageCoachID}, Nickname: "เทส",
		PaymentType: PaymentTypePerSession, PayRate: 300, Status: coachStatusActive,
	})

	future := time.Now().AddDate(0, 0, 14).Format("2006-01-02")
	ws := models.WorkSchedule{
		CoachID: wageCoachID, CourseID: 1,
		Date: future, StartTime: "18:00", EndTime: "20:00", Description: "อนาคต",
	}
	mustCreate(t, db, &ws)
	db.Exec(`UPDATE work_schedules SET date = ? WHERE id = ?`, future, ws.ID)

	_, err := NewWorkScheduleService(db).Update(ws.ID, dto.CreateWorkScheduleRequest{
		Date: "2026-01-05", StartTime: "18:00", EndTime: "20:00",
		CoachID: wageCoachID, CourseID: 1, Description: "ย้อนหลัง",
	})
	if !errors.Is(err, ErrScheduleConflict) {
		t.Fatalf("ย้ายคาบไปเป็นวันในอดีตต้องไม่ได้ แต่ได้ error: %v", err)
	}
}

// ─── 7. ด่านค่าจ้างที่ข้ามได้ (จากรายงานตรวจ summary.md) ────────────────────

// ⚠️ F1 — ด่านเพดานของโค้ชรายเดือนข้ามได้ด้วยการเลือกวันย้อนหลัง
//
// ยอดค้างของรายเดือนนับเฉพาะเงินที่จ่าย "ในเดือนนั้น" ถ้าด่านคิดจากเดือนปัจจุบัน
// แต่แถวถูกบันทึกลงเดือนก่อน แถวนั้นตกนอกหน้าต่างที่ด่านนับ → ยอดค้างไม่ลดลง
// → กดจ่ายซ้ำได้ไม่จำกัด (รายงานทดสอบได้ 5 ครั้งติด รวม 100,000 บาท)
//
// การจ่ายเงินเดือนงวดที่แล้วในต้นเดือนใหม่เป็นเรื่องปกติ ด่านนี้จึงแทบไม่เคยทำงาน
func TestMonthlyWageCannotBeOverpaidViaBackdating(t *testing.T) {
	db := newPayrollCalcTestDB(t)
	seedWageCoach(t, db, PaymentTypeMonthly, 20000)

	lastMonth := time.Now().AddDate(0, -1, 0)
	coachID := wageCoachID
	svc := NewExpenseService(db)

	pay := func(amount float64) error {
		_, err := svc.CreateExpense(dto.CreateExpenseRequest{
			Amount: amount, Type: models.ExpenseTypeCoach,
			Date: lastMonth, CoachID: &coachID,
		}, 0)
		return err
	}

	if err := pay(20000); err != nil {
		t.Fatalf("จ่ายเงินเดือนงวดที่แล้วครั้งแรกต้องทำได้ แต่ได้ error: %v", err)
	}

	// ครั้งที่สองของงวดเดียวกันต้องถูกปฏิเสธ
	if err := pay(20000); !errors.Is(err, ErrPayrollNoUnpaid) {
		t.Fatalf("จ่ายซ้ำงวดเดิมต้องถูกปฏิเสธ แต่ได้ error: %v", err)
	}

	var total float64
	db.Model(&models.Expense{}).Select("COALESCE(SUM(amount),0)").Scan(&total)
	if total != 20000 {
		t.Fatalf("เงินเดือน 20,000 ต้องจ่ายได้ครั้งเดียว แต่รวมจ่ายไป %.2f", total)
	}
}

// ⚠️ F5 — expensetype ที่ระบบไม่รู้จักต้องถูกปฏิเสธ
//
// ถ้าปล่อยผ่าน จะข้ามด่าน validateCoachWage ได้ 100% (ด่านปล่อยผ่านทุก type
// ที่ไม่ใช่ coach_wages) และ paidWages ก็ไม่นับแถวนั้น → จ่ายแล้วแต่ยังค้างเต็ม
func TestExpenseRejectsUnknownType(t *testing.T) {
	db := newPayrollCalcTestDB(t)
	seedWageCoach(t, db, PaymentTypePerSession, 300)
	seedPaidClass(t, db, "2026-01-05", 300)

	coachID := wageCoachID
	_, err := NewExpenseService(db).CreateExpense(dto.CreateExpenseRequest{
		Amount: 999999, Type: models.ExpenseType("อะไรก็ได้"),
		Date: time.Now(), CoachID: &coachID,
	}, 0)
	if !errors.Is(err, ErrExpenseUnknownType) {
		t.Fatalf("ประเภทที่ระบบไม่รู้จักต้องถูกปฏิเสธ แต่ได้ error: %v", err)
	}

	var rows int64
	db.Model(&models.Expense{}).Count(&rows)
	if rows != 0 {
		t.Fatalf("ต้องไม่ถูกบันทึก แต่มี %d แถว", rows)
	}
}

// ⚠️ F7 — ตั้งเรตทีหลังต้องเติมย้อนหลังให้คาบที่มอบหมายไปแล้ว
//
// Coach.PayRate default = 0 และ payment_type default = per_session
// แอดมินสร้างโค้ช มอบหมายคาบไปก่อน แล้วค่อยมาตั้งเรต = เคสปกติ
// ถ้าไม่เติมย้อนหลัง คาบเหล่านั้นค้างที่ 0 บาทถาวร และจ่ายผ่าน coach_wages ไม่ได้เลย
func TestSettingRateAfterAssignBackfillsSnapshots(t *testing.T) {
	db := newPayrollCalcTestDB(t)
	seedWageCoach(t, db, PaymentTypePerSession, 0) // ยังไม่ตั้งเรต

	seedPaidClass(t, db, "2026-01-05", 0)
	seedPaidClass(t, db, "2026-01-12", 0)
	seedPaidClass(t, db, "2026-01-19", 0)

	if got := payrollOf(t, db); got.Expected != 0 {
		t.Fatalf("ยังไม่ตั้งเรต ยอดต้องเป็น 0 แต่ได้ %.2f", got.Expected)
	}

	rate := 300.0
	if _, err := NewCoachService(db).AdminUpdate(wageCoachID, dto.AdminUpdateCoachRequest{
		PayRate: &rate,
	}); err != nil {
		t.Fatalf("ตั้งอัตราค่าจ้างไม่สำเร็จ: %v", err)
	}

	got := payrollOf(t, db)
	if got.Expected != 900 {
		t.Fatalf("ตั้งเรต 300 ทีหลัง คาบที่สอนไปแล้ว 3 คาบต้องได้ 900 แต่ได้ %.2f "+
			"— ถ้าเป็น 0 แปลว่าคาบค้างที่ 0 บาทถาวรและจ่ายผ่าน coach_wages ไม่ได้", got.Expected)
	}
	if got.Unpaid != 900 {
		t.Fatalf("ต้องจ่ายได้ 900 แต่ยอดค้างเป็น %.2f", got.Unpaid)
	}
}

// ⚠️ F11 — หน้า "รายได้ของฉัน" ต้องเห็นเฉพาะเงินของโค้ช
func TestCoachExpenseListExcludesNonCoachTypes(t *testing.T) {
	db := newPayrollCalcTestDB(t)
	seedWageCoach(t, db, PaymentTypePerSession, 300)

	coachID := wageCoachID
	mustCreate(t, db, &models.Expense{Amount: 500, Type: models.ExpenseTypeCoachOther,
		Date: time.Now(), CoachID: &coachID})
	// ค่าเช่าสนามที่เผลอผูก coach_id ไว้ — ไม่ใช่เงินของโค้ช
	mustCreate(t, db, &models.Expense{Amount: 9000, Type: models.ExpenseTypeCourt,
		Date: time.Now(), CoachID: &coachID})

	rows, err := NewExpenseService(db).GetByCoachID(wageCoachID, 0, "admin")
	if err != nil {
		t.Fatalf("ดึงรายได้ของโค้ชไม่สำเร็จ: %v", err)
	}
	for _, r := range rows {
		if r.Type == models.ExpenseTypeCourt {
			t.Fatalf("ค่าเช่าสนามต้องไม่โผล่ในรายได้ของโค้ช แต่เจอแถว #%d", r.ID)
		}
	}
	if len(rows) != 1 {
		t.Fatalf("ต้องเหลือแค่โบนัส 1 แถว แต่ได้ %d", len(rows))
	}
}
