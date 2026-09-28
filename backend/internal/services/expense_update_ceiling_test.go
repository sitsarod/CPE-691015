package services

import (
	"errors"
	"testing"
	"time"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
)

// ชุดนี้คุมเพดานค่าจ้างของ UpdateExpense (#4)
//
// ─── บั๊กที่เคยเกิด ───
//
// เดิมคิดเพดานเป็น payroll.Unpaid + prevAmount โดยสมมติว่ายอดเดิมของรายการถูกนับอยู่ใน Unpaid
// ของโค้ชที่กำลังตรวจเสมอ ทำให้เมื่อ "ย้ายโค้ช" หรือ "เปลี่ยน type จาก non-wage เป็น coach_wages"
// ยอดเดิม (ที่ไม่ได้อยู่ใน Unpaid ของโค้ชใหม่เลย) ถูกบวกกลับเข้าเพดาน = จ่ายค่าจ้างเกินได้
//
// ─── กติกาปัจจุบัน ───
//
// เพดาน = Expected − (AlreadyPaid − ยอดเดิมที่ row นี้เคยถูกนับจริง) — บวกยอดเดิมกลับเฉพาะเมื่อ
// row เดิมเป็น coach_wages ของโค้ชคนเดียวกัน (และถ้ารายเดือน ต้องอยู่งวดเดือนเดียวกัน)

// เปลี่ยน type ของรายการที่ไม่ใช่ค่าจ้าง (coach_other) มาเป็น coach_wages ต้องไม่บวกยอดเดิม
// กลับเข้าเพดาน เพราะยอดเดิมไม่เคยถูกนับเป็นค่าจ้างมาก่อน
func TestUpdateExpense_TypeChangeToWagesDoesNotInflateCeiling(t *testing.T) {
	db := newPayrollCalcTestDB(t)
	seedWageCoach(t, db, PaymentTypePerSession, 300)
	seedPaidClass(t, db, "2026-01-05", 300) // ค้างค่าจ้าง 300
	coachID := wageCoachID
	svc := NewExpenseService(db)

	// จ่ายค่าจ้างครบ 300 → ค้าง 0
	if _, err := svc.CreateExpense(dto.CreateExpenseRequest{
		Amount: 300, Type: models.ExpenseTypeCoach, Date: time.Now(), CoachID: &coachID,
	}, 0); err != nil {
		t.Fatalf("จ่ายค่าจ้างครบไม่สำเร็จ: %v", err)
	}

	// โบนัส (coach_other) 3000 — ไม่นับเป็นค่าจ้าง
	bonus, err := svc.CreateExpense(dto.CreateExpenseRequest{
		Amount: 3000, Type: models.ExpenseTypeCoachOther, Date: time.Now(), CoachID: &coachID,
	}, 0)
	if err != nil {
		t.Fatalf("บันทึกโบนัสไม่สำเร็จ: %v", err)
	}

	// แก้โบนัสให้กลายเป็นค่าจ้าง (coach_wages) โดยคงยอด 3000 — โค้ชจ่ายครบแล้ว จึงต้องถูกปฏิเสธ
	wages := models.ExpenseTypeCoach
	if _, err := svc.UpdateExpense(bonus.ID, dto.UpdateExpenseRequest{Type: &wages}, 0); !errors.Is(err, ErrPayrollExceeds) {
		t.Fatalf("เปลี่ยน type เป็นค่าจ้างเกินยอดค้างต้องถูกปฏิเสธ แต่ได้ error: %v", err)
	}

	// ค่าจ้างที่จ่ายจริงต้องยังเป็น 300 (โบนัสไม่ถูกแปลงเป็นค่าจ้าง)
	if got := payrollOf(t, db); got.AlreadyPaid != 300 {
		t.Fatalf("ค่าจ้างที่จ่ายควรคงเป็น 300 แต่ได้ %.2f", got.AlreadyPaid)
	}
}

// แก้ยอดค่าจ้างเดิมของโค้ชคนเดิม (type เดิม) ต้องยังทำได้ตามปกติภายในเพดาน — พิสูจน์ว่าไม่บล็อกเกินเหตุ
// และยังบล็อกกรณีแก้ยอดเกิน Expected อยู่
func TestUpdateExpense_EditWageAmountRespectsCeiling(t *testing.T) {
	db := newPayrollCalcTestDB(t)
	seedWageCoach(t, db, PaymentTypePerSession, 300)
	seedPaidClass(t, db, "2026-01-05", 300)
	seedPaidClass(t, db, "2026-01-12", 300) // Expected 600
	coachID := wageCoachID
	svc := NewExpenseService(db)

	wage, err := svc.CreateExpense(dto.CreateExpenseRequest{
		Amount: 600, Type: models.ExpenseTypeCoach, Date: time.Now(), CoachID: &coachID,
	}, 0)
	if err != nil {
		t.Fatalf("จ่ายค่าจ้างไม่สำเร็จ: %v", err)
	}

	// ลดยอดค่าจ้างเดิมเหลือ 500 — อยู่ในเพดาน (Expected 600) ต้องผ่าน
	newAmt := 500.0
	if _, err := svc.UpdateExpense(wage.ID, dto.UpdateExpenseRequest{Amount: &newAmt}, 0); err != nil {
		t.Fatalf("แก้ยอดค่าจ้างลงในเพดานควรผ่าน แต่ได้ error: %v", err)
	}
	if got := payrollOf(t, db); got.AlreadyPaid != 500 {
		t.Fatalf("ค่าจ้างที่จ่ายควรเป็น 500 หลังแก้ แต่ได้ %.2f", got.AlreadyPaid)
	}

	// เพิ่มยอดเกิน Expected (700 > 600) ต้องถูกปฏิเสธ
	over := 700.0
	if _, err := svc.UpdateExpense(wage.ID, dto.UpdateExpenseRequest{Amount: &over}, 0); !errors.Is(err, ErrPayrollExceeds) {
		t.Fatalf("แก้ยอดเกินเพดานต้องถูกปฏิเสธ แต่ได้ error: %v", err)
	}
}
