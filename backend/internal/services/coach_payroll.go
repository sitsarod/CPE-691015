package services

import (
	"errors"
	"fmt"
	"log"
	"math"
	"sort"
	"time"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"

	"gorm.io/gorm"
)

// ─── การคิดค่าจ้างโค้ช ───────────────────────────────────────────────────────
//
// ─── ปัญหาที่ไฟล์นี้แก้ ───
//
// เดิมสูตรค่าจ้างอยู่ใน React ทั้งหมด:
//
//	expected    = sessionsDone * payRate      // ใช้เรตปัจจุบัน
//	alreadyPaid = ผลรวม expenses ของโค้ชคนนี้
//	unpaid      = expected - alreadyPaid
//
// ส่วน backend รับแค่ตัวเลข Amount แล้วบันทึกลงตารางตรง ๆ ไม่เคยตรวจอะไรเลย
// ยิง API ตรงด้วยยอดเท่าไหร่ก็ผ่าน (ช่องกรอกใน UI ก็แก้ได้อยู่แล้ว)
//
// และ sessionsDone คือคาบ "ทั้งหมดตั้งแต่เริ่มงาน" แต่คูณด้วยเรต "ปัจจุบัน"
// วันที่ขึ้นค่าจ้างโค้ชจาก 300 เป็น 400 ระบบจะคิดว่าค้างจ่ายย้อนหลังทุกคาบ
// ที่เคยสอนมาในอัตราใหม่ทันที = หนี้ที่ไม่มีอยู่จริงโผล่มาเป็นก้อน
//
// ─── กติกาปัจจุบัน ───
//
//  1. คำนวณที่นี่ที่เดียว หน้าเว็บมีหน้าที่แสดงผล ไม่ใช่คิด
//  2. คิดจาก "ผลรวมของสแนปช็อตเรต" ไม่ใช่ "จำนวนคาบ × เรตปัจจุบัน"
//     (WorkSchedule.PayRateSnapshot เก็บตอนมอบหมาย ดูคอมเมนต์ในโมเดล)
//  3. ตอนบันทึกค่าจ้าง backend คิดยอดใหม่เองแล้วปฏิเสธถ้าเกิน (ดู ExpenseService)

const (
	PaymentTypePerSession = "per_session"
	PaymentTypeMonthly    = "monthly"
)

// payrollEpsilon กันเศษทศนิยมของ float ทำให้ยอดที่ "เท่ากันพอดี" ถูกปฏิเสธ
//
// เงินหน่วยบาททศนิยมสองตำแหน่ง ความคลาดเคลื่อนที่ยอมรับได้คือต่ำกว่าหนึ่งสตางค์
// (ทางแก้ที่ถูกจริง ๆ คือเก็บเงินเป็น integer หน่วยสตางค์ — อยู่ใน CODE_REVIEW.md)
const payrollEpsilon = 0.005

var (
	ErrPayrollNoUnpaid   = errors.New("โค้ชคนนี้ไม่มียอดค่าจ้างค้างจ่าย")
	ErrPayrollExceeds    = errors.New("ยอดที่กรอกเกินค่าจ้างค้างจ่ายของโค้ชคนนี้")
	ErrPayrollNeedsCoach = errors.New("ค่าใช้จ่ายประเภทค่าจ้างโค้ชต้องระบุว่าเป็นของโค้ชคนไหน")
)

// coachPayRateSnapshot คืนอัตราที่ควรบันทึกลงตารางงานที่กำลังจะสร้าง
//
// คืน 0 ถ้าอ่านข้อมูลโค้ชไม่ได้ หรือโค้ชเป็นรายเดือน (ไม่มีค่าจ้างรายคาบ)
// การคืน 0 แทนที่จะคืน error โดยตั้งใจ — การมอบหมายงานไม่ควรล้มเพราะเรื่องค่าจ้าง
// แต่แถวที่ได้ 0 จะเห็นชัดในหน้าค่าจ้างว่าต้องไปแก้ ไม่ได้หายไปเงียบ ๆ
func coachPayRateSnapshot(db *gorm.DB, coachID uint) float64 {
	var coach models.Coach
	if err := db.Select("pay_rate", "payment_type").First(&coach, coachID).Error; err != nil {
		return 0
	}
	if coach.PaymentType == PaymentTypeMonthly {
		return 0
	}
	if coach.PayRate < 0 {
		return 0
	}
	return coach.PayRate
}

// BackfillWorkSchedulePayRates เติมสแนปช็อตเรตให้ตารางงานที่สร้างไว้ก่อนมีคอลัมน์นี้
//
// ⚠️ ข้อจำกัดที่ต้องรู้ก่อนอ่านตัวเลขย้อนหลัง
//
// ระบบไม่เคยเก็บประวัติการเปลี่ยนอัตราค่าจ้างไว้ เราจึงไม่มีทางรู้ว่าคาบเมื่อสามเดือนก่อน
// ตอนนั้นเรตเท่าไร สิ่งที่ทำได้คือใช้เรตปัจจุบันเป็นค่าตั้งต้นให้ทุกคาบเก่า
//
// แปลว่า: การแก้นี้หยุด "อดีตเปลี่ยนตามปัจจุบัน" ตั้งแต่วันที่รัน migration เป็นต้นไป
// ส่วนคาบที่เกิดก่อนหน้านั้นถูกตรึงไว้ที่เรต ณ วันรัน ไม่ใช่เรตจริงในวันนั้น
// (ถ้าต้องการความถูกต้องย้อนหลังกว่านี้ ต้องแก้ pay_rate_snapshot รายแถวเอง)
//
// เติมเฉพาะแถวที่ยังเป็น 0 จึงรันซ้ำได้ปลอดภัย และไม่ทับค่าที่ตั้งใจตั้งเป็น 0 ไม่ได้
// เพราะแถวที่บันทึกผ่านโค้ดใหม่ของโค้ชรายครั้งจะมีค่ามากกว่า 0 เสมอ
func BackfillWorkSchedulePayRates(db *gorm.DB) error {
	res := db.Exec(`
		UPDATE work_schedules ws
		SET pay_rate_snapshot = c.pay_rate
		FROM coaches c
		WHERE c.id = ws.coach_id
		  AND ws.deleted_at IS NULL
		  AND ws.pay_rate_snapshot = 0
		  AND c.deleted_at IS NULL
		  AND c.payment_type = ?
		  AND c.pay_rate > 0
	`, PaymentTypePerSession)
	if res.Error != nil {
		return errors.New("เติมอัตราค่าจ้างย้อนหลังให้ตารางงานไม่สำเร็จ")
	}

	if res.RowsAffected > 0 {
		log.Printf("[payroll] เติมอัตราค่าจ้างให้ตารางงานเก่า %d แถว (ใช้เรตปัจจุบันของโค้ชแต่ละคน)",
			res.RowsAffected)
	}
	return nil
}

// ComputeCoachPayroll คือแหล่งความจริงเดียวของยอดค่าจ้างโค้ชหนึ่งคน
//
// ⚠️ ห้ามคำนวณยอดค่าจ้างที่อื่นอีก ไม่ว่าจะที่ backend หรือ frontend
// ประวัติของระบบนี้บอกว่านิยามเดียวกันสองชุดกลายเป็นบั๊กเรื่องเงินทุกครั้ง
func ComputeCoachPayroll(db *gorm.DB, coachID uint, now time.Time) (*dto.CoachPayrollDTO, error) {
	var coach models.Coach
	if err := db.First(&coach, coachID).Error; err != nil {
		return nil, ErrCoachNotFound
	}

	result := &dto.CoachPayrollDTO{
		CoachID:       coach.ID,
		PaymentType:   coach.PaymentType,
		PayRate:       coach.PayRate,
		RateBreakdown: []dto.PayrollRateLineDTO{},
	}

	unresolvedSessions, unresolvedAmount, err := unresolvedPayroll(db, coachID, now)
	if err != nil {
		return nil, err
	}
	result.UnresolvedSessions = unresolvedSessions
	result.UnresolvedAmount = unresolvedAmount

	if coach.PaymentType == PaymentTypeMonthly {
		// รายเดือน: ยอดคงที่ต่อเดือน หักด้วยที่จ่ายไปแล้ว "ในเดือนนี้" เท่านั้น
		// (ถ้าหักสะสมทั้งหมด เดือนใหม่จะกลายเป็นไม่ต้องจ่ายเลย)
		paid, err := paidWages(db, coachID, monthRange(now))
		if err != nil {
			return nil, err
		}
		result.Expected = coach.PayRate
		result.AlreadyPaid = paid
		result.Unpaid = positive(coach.PayRate - paid)
		result.PeriodNote = fmt.Sprintf("ค่าจ้างรายเดือนของเดือน %s", now.Format("01/2006"))
		return result, nil
	}

	lines, sessions, expected, err := payrollRateLines(db, coachID, now)
	if err != nil {
		return nil, err
	}

	paid, err := paidWages(db, coachID, nil)
	if err != nil {
		return nil, err
	}

	result.SessionsDone = sessions
	result.Expected = expected
	result.AlreadyPaid = paid
	result.Unpaid = positive(expected - paid)
	result.RateBreakdown = lines
	result.PeriodNote = "ค่าจ้างรายครั้ง นับสะสมตั้งแต่เริ่มงานหักด้วยที่จ่ายไปแล้วทั้งหมด"
	return result, nil
}

// payrollRateLines รวมคาบที่ได้เงินแล้ว โดยแยกตามอัตราที่บันทึกไว้ในแต่ละคาบ
//
// ⚠️ หัวใจของการแก้บั๊ก "ปรับเรตแล้วยอดย้อนหลังเพี้ยน" อยู่ที่นี่
// รวมจาก pay_rate_snapshot ของแต่ละแถว ไม่ใช่ count × coaches.pay_rate
func payrollRateLines(db *gorm.DB, coachID uint, now time.Time) ([]dto.PayrollRateLineDTO, int, float64, error) {
	type row struct {
		Rate  float64
		Count int
	}

	collect := func(scope *gorm.DB) ([]row, error) {
		var rows []row
		err := scope.
			Select("work_schedules.pay_rate_snapshot AS rate, COUNT(*) AS count").
			Group("work_schedules.pay_rate_snapshot").
			Scan(&rows).Error
		if err != nil {
			return nil, errors.New("ไม่สามารถคำนวณค่าจ้างของโค้ชได้")
		}
		return rows, nil
	}

	paidRows, err := collect(taughtScheduleScope(db, coachID))
	if err != nil {
		return nil, 0, 0, err
	}

	// คาบรุ่นเก่า (package_id = NULL) ใช้เกณฑ์เดิม = วันสอนผ่านไปแล้ว
	// เงื่อนไขไม่ทับกับชุดบน (NOT NULL vs NULL) จึงบวกกันได้ตรง ๆ
	legacyRows, err := collect(legacyTaughtScope(db, coachID, localDateString(now)))
	if err != nil {
		return nil, 0, 0, err
	}

	byRate := make(map[float64]int)
	for _, r := range append(paidRows, legacyRows...) {
		byRate[r.Rate] += r.Count
	}

	rates := make([]float64, 0, len(byRate))
	for rate := range byRate {
		rates = append(rates, rate)
	}
	sort.Float64s(rates)

	lines := make([]dto.PayrollRateLineDTO, 0, len(rates))
	totalSessions := 0
	totalAmount := 0.0
	for _, rate := range rates {
		count := byRate[rate]
		amount := rate * float64(count)
		lines = append(lines, dto.PayrollRateLineDTO{PayRate: rate, Sessions: count, Amount: amount})
		totalSessions += count
		totalAmount += amount
	}

	return lines, totalSessions, round2(totalAmount), nil
}

// legacyTaughtScope = คาบรุ่นเก่าที่ไม่มี package_id จึงจับคู่กับรอบเช็คชื่อไม่ได้
// ใช้เกณฑ์ "วันสอนผ่านไปแล้ว" เหมือนที่ taughtSessionDates ใช้มาตลอด
func legacyTaughtScope(db *gorm.DB, coachID uint, todayStr string) *gorm.DB {
	return db.Model(&models.WorkSchedule{}).
		Where("work_schedules.coach_id = ? AND work_schedules.package_id IS NULL AND work_schedules.date < ?",
			coachID, todayStr)
}

// unresolvedPayroll บอกว่ามีเงินอีกเท่าไรที่ยังไม่ถูกนับเพราะคาบยังไม่มีรอบเช็คชื่อ
func unresolvedPayroll(db *gorm.DB, coachID uint, now time.Time) (int, float64, error) {
	var out struct {
		Count int
		Total float64
	}
	err := unresolvedScheduleScope(db, localDateString(now)).
		Where("work_schedules.coach_id = ?", coachID).
		Select("COUNT(*) AS count, COALESCE(SUM(work_schedules.pay_rate_snapshot), 0) AS total").
		Scan(&out).Error
	if err != nil {
		return 0, 0, errors.New("ไม่สามารถนับคาบที่ยังไม่มีรอบเช็คชื่อได้")
	}
	return out.Count, round2(out.Total), nil
}

// paidWages รวมค่าจ้างที่จ่ายให้โค้ชคนนี้ไปแล้ว
//
// นับเฉพาะประเภท coach_wages — coach_other (โบนัส/รายได้อื่น) เป็นเงินคนละก้อน
// ที่ไม่ได้ผูกกับจำนวนคาบ จึงต้องไม่มาหักยอดค่าจ้างตามคาบ
//
// period = nil แปลว่านับสะสมทั้งหมด
func paidWages(db *gorm.DB, coachID uint, period *[2]time.Time) (float64, error) {
	q := db.Model(&models.Expense{}).
		Where("coach_id = ? AND type = ?", coachID, models.ExpenseTypeCoach)
	if period != nil {
		q = q.Where("date >= ? AND date < ?", period[0], period[1])
	}

	var total float64
	if err := q.Select("COALESCE(SUM(amount), 0)").Scan(&total).Error; err != nil {
		return 0, errors.New("ไม่สามารถรวมค่าจ้างที่จ่ายไปแล้วได้")
	}
	return round2(total), nil
}

// monthRange คืนช่วง [ต้นเดือน, ต้นเดือนถัดไป) ตามเวลาที่สนาม
func monthRange(now time.Time) *[2]time.Time {
	loc := appLocation()
	t := now.In(loc)
	start := time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, loc)
	r := [2]time.Time{start, start.AddDate(0, 1, 0)}
	return &r
}

func localDateString(now time.Time) string {
	return now.In(appLocation()).Format("2006-01-02")
}

func positive(v float64) float64 {
	if v <= 0 {
		return 0
	}
	return round2(v)
}

func round2(v float64) float64 {
	return math.Round(v*100) / 100
}
