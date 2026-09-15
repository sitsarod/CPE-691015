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

	ErrCoachPayRateNegative = errors.New("อัตราค่าจ้างต้องไม่ติดลบ")
	ErrCoachPaySwitchUnpaid = errors.New("เปลี่ยนวิธีจ่ายค่าจ้างไม่ได้ตอนที่ยังมียอดค้างจ่ายรายคาบ กรุณาเคลียร์ยอดให้เสร็จก่อน")
)

// ValidateCoachPay คือกติกาชุดเดียวของ "ค่าจ้างที่รับได้"
//
// ⚠️ มีสามเส้นทางที่เขียน pay_rate/payment_type ได้ (CoachService.Create,
// CoachService.AdminUpdate, AdminUserService.Update) เดิมแต่ละเส้นตรวจไม่เหมือนกัน
// — Create ไม่ตรวจอะไรเลย จึงสร้างโค้ชด้วย pay_rate ติดลบได้
//
// ทุกเส้นต้องเรียกตัวนี้ ห้ามเขียนเงื่อนไขซ้ำในที่ของตัวเอง
func ValidateCoachPay(paymentType string, payRate float64) error {
	if !isValidPaymentType(paymentType) {
		return ErrCoachInvalidPaymentType
	}
	if payRate < 0 {
		return ErrCoachPayRateNegative
	}
	return nil
}

// ApplyCoachPayChange เป็นทางเดียวที่ได้รับอนุญาตให้แก้ pay_rate / payment_type
//
// ผู้เรียกต้องเอาสองฟิลด์นี้ออกจาก update map ของตัวเอง แล้วเรียกตัวนี้แทน
// (nil = ไม่เปลี่ยนฟิลด์นั้น)
//
// ─── ทำไมต้องมีด่านตอนสลับวิธีจ่าย ───
//
// สแนปช็อตเรตของโค้ชรายเดือนถูกบันทึกเป็น 0 เพราะไม่มีค่าจ้างรายคาบ (ดู coachPayRateSnapshot)
// การสลับไปมาจึงทำให้เงินหายได้สองทาง:
//
//	รายครั้ง → รายเดือน : ยอดค้างรายคาบที่ยังไม่จ่าย เข้าถึงไม่ได้อีกเลย
//	รายเดือน → รายครั้ง : คาบเก่ามีสแนปช็อต 0 ทั้งหมด → คิดเงินย้อนหลังได้ 0
//
// ทางแรกแก้ด้วยการ "ห้ามสลับตอนยังค้างจ่าย" — บอกให้เคลียร์ยอดก่อน ซึ่งย้อนกลับได้
// ทางที่สองแก้ด้วยการเติมสแนปช็อตให้คาบเก่าด้วยเรตใหม่ หลักเดียวกับ
// BackfillWorkSchedulePayRates (ดูข้อจำกัดเรื่องเรตย้อนหลังที่นั่น)
func ApplyCoachPayChange(
	tx *gorm.DB,
	coachID uint,
	newType *string,
	newRate *float64,
	now time.Time,
) error {
	if newType == nil && newRate == nil {
		return nil
	}

	var coach models.Coach
	if err := tx.First(&coach, coachID).Error; err != nil {
		return ErrCoachNotFound
	}

	targetType := coach.PaymentType
	if newType != nil {
		targetType = *newType
	}
	targetRate := coach.PayRate
	if newRate != nil {
		targetRate = *newRate
	}

	if err := ValidateCoachPay(targetType, targetRate); err != nil {
		return err
	}

	switchingAway := coach.PaymentType == PaymentTypePerSession && targetType != PaymentTypePerSession
	if switchingAway {
		payroll, err := ComputeCoachPayroll(tx, coachID, now)
		if err != nil {
			return err
		}
		if payroll.Unpaid > payrollEpsilon {
			return fmt.Errorf("%w (ค้างอยู่ %.2f บาท — จ่ายให้ครบ หรือบันทึกเป็นรายได้อื่นก่อน)",
				ErrCoachPaySwitchUnpaid, payroll.Unpaid)
		}
	}

	updates := map[string]interface{}{}
	if newType != nil {
		updates["payment_type"] = targetType
	}
	if newRate != nil {
		updates["pay_rate"] = targetRate
	}
	if err := tx.Model(&models.Coach{}).Where("id = ?", coachID).Updates(updates).Error; err != nil {
		return errors.New("ไม่สามารถบันทึกการเปลี่ยนค่าจ้างได้")
	}

	// ⚠️ ต้องเติมย้อนหลังสองกรณี ไม่ใช่แค่ตอนสลับประเภท
	//
	//	สลับมาเป็นรายครั้ง   — คาบเก่าของโค้ชรายเดือนมีสแนปช็อต 0 ทั้งหมด
	//	ตั้งเรตทีหลัง        — Coach.PayRate default = 0 และ payment_type default = per_session
	//	                      แอดมินสร้างโค้ช มอบหมายคาบไปก่อน แล้วค่อยมาตั้งเรต
	//
	// กรณีที่สองเคยตกหล่น ผลคือ expected = 0 ตลอดไป และ validateCoachWage ตอบ
	// ErrPayrollNoUnpaid → จ่ายค่าจ้างผ่าน coach_wages ไม่ได้เลย ต้องอ้อมไปใช้ coach_other
	// ทางซ่อมเดียวที่มีคือรัน cmd/migrate ซึ่งไม่มีปุ่มในแอป
	switchingIn := coach.PaymentType != PaymentTypePerSession && targetType == PaymentTypePerSession
	settingRateFromZero := targetType == PaymentTypePerSession && coach.PayRate == 0 && targetRate > 0

	if (switchingIn || settingRateFromZero) && targetRate > 0 {
		if err := backfillCoachPayRate(tx, coachID, targetRate); err != nil {
			return err
		}
	}
	return nil
}

// backfillCoachPayRate เติมสแนปช็อตให้คาบของโค้ชคนเดียวที่ยังเป็น 0
//
// เขียนแบบไม่ใช้ UPDATE ... FROM เพื่อให้รันได้ทั้ง postgres และ sqlite ที่ใช้ในเทส
func backfillCoachPayRate(tx *gorm.DB, coachID uint, rate float64) error {
	res := tx.Model(&models.WorkSchedule{}).
		Where("coach_id = ? AND pay_rate_snapshot = 0", coachID).
		Update("pay_rate_snapshot", rate)
	if res.Error != nil {
		return errors.New("ไม่สามารถเติมอัตราค่าจ้างให้คาบเดิมของโค้ชได้")
	}
	if res.RowsAffected > 0 {
		log.Printf("[payroll] โค้ช #%d เปลี่ยนเป็นรายครั้ง — เติมอัตรา %.2f ให้คาบเดิม %d แถว",
			coachID, rate, res.RowsAffected)
	}
	return nil
}

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
		result.Overpaid = positive(paid - coach.PayRate)
		result.PeriodNote = fmt.Sprintf("ค่าจ้างรายเดือนของเดือน %s", now.Format("01/2006"))

		// โค้ชรายเดือนไม่มีคาบให้นับ แต่ยังต้องเห็นว่าได้รับเงินเดือนไหนไปแล้วบ้าง
		paidByMonth, err := paidWagesByMonth(db, coachID)
		if err != nil {
			return nil, err
		}
		result.MonthlyBreakdown = payrollMonths(nil, paidByMonth)
		return result, nil
	}

	rows, err := paidSchedules(db, coachID, now)
	if err != nil {
		return nil, err
	}

	paid, err := paidWages(db, coachID, nil)
	if err != nil {
		return nil, err
	}

	paidByMonth, err := paidWagesByMonth(db, coachID)
	if err != nil {
		return nil, err
	}

	lines, sessions, expected := payrollRateLines(rows)

	result.SessionsDone = sessions
	result.Expected = expected
	result.AlreadyPaid = paid
	result.Unpaid = positive(expected - paid)

	// ⚠️ ต้องคิดคู่กับ Unpaid เสมอ ไม่ใช่ปล่อยให้หน้าเว็บลบเอง
	// ผลต่างที่ติดลบคือเงินที่จ่ายเกินไปจริง ถ้าไม่รายงานก็หายไปจากสายตาทุกฝ่าย
	result.Overpaid = positive(paid - expected)
	result.RateBreakdown = lines
	result.MonthlyBreakdown = payrollMonths(rows, paidByMonth)
	result.PeriodNote = "ค่าจ้างรายครั้ง นับสะสมตั้งแต่เริ่มงานหักด้วยที่จ่ายไปแล้วทั้งหมด"
	return result, nil
}

// payrollScheduleRow คือคาบหนึ่งที่ "นับเป็นเงินแล้ว" พร้อมอัตราที่ตรึงไว้ตอนมอบหมาย
type payrollScheduleRow struct {
	Date            string
	PayRateSnapshot float64
}

// paidSchedules ดึงคาบที่นับเป็นเงินแล้วทั้งหมดของโค้ชคนหนึ่ง
//
// ⚠️ ดึงครั้งเดียวแล้วแยกเป็นหลายมุมมองใน Go โดยตั้งใจ
//
// ยอดรวม · การแยกตามอัตรา · การแยกตามเดือน ต้องมาจากชุดแถวเดียวกันเสมอ
// ถ้าแต่ละมุมมองยิง query ของตัวเอง จะมีวันที่ตัวเลขสองที่ไม่ตรงกันแล้วไม่มีใครรู้ว่าอันไหนถูก
// (บทเรียนเดิมของไฟล์กลุ่มนี้: นิยามเดียวกันสองชุด = บั๊กเรื่องเงินทุกครั้ง)
//
// จัดกลุ่มใน Go ไม่ใช่ SQL เพราะการจัดกลุ่มรายเดือนต้องใช้ to_char ซึ่งมีแต่ใน
// postgres — เทสที่รันบน sqlite จะเข้าไม่ถึงตรรกะส่วนนี้เลย และจำนวนคาบต่อโค้ช
// อยู่ในระดับหลักร้อย ไม่ใช่ปริมาณที่ต้องให้ฐานข้อมูลช่วยรวม
func paidSchedules(db *gorm.DB, coachID uint, now time.Time) ([]payrollScheduleRow, error) {
	fetch := func(scope *gorm.DB) ([]payrollScheduleRow, error) {
		var rows []payrollScheduleRow
		err := scope.Select("work_schedules.date AS date, work_schedules.pay_rate_snapshot AS pay_rate_snapshot").
			Scan(&rows).Error
		if err != nil {
			return nil, errors.New("ไม่สามารถคำนวณค่าจ้างของโค้ชได้")
		}
		return rows, nil
	}

	rows, err := fetch(taughtScheduleScope(db, coachID))
	if err != nil {
		return nil, err
	}

	// คาบรุ่นเก่า (package_id = NULL) ใช้เกณฑ์เดิม = วันสอนผ่านไปแล้ว
	// เงื่อนไขไม่ทับกับชุดบน (NOT NULL vs NULL) จึงต่อกันได้ตรง ๆ
	legacy, err := fetch(legacyTaughtScope(db, coachID, localDateString(now)))
	if err != nil {
		return nil, err
	}
	return append(rows, legacy...), nil
}

// payrollRateLines แยกคาบตามอัตราที่บันทึกไว้ในแต่ละคาบ
//
// ⚠️ หัวใจของการแก้บั๊ก "ปรับเรตแล้วยอดย้อนหลังเพี้ยน" อยู่ที่นี่
// รวมจาก pay_rate_snapshot ของแต่ละแถว ไม่ใช่ count × coaches.pay_rate
func payrollRateLines(rows []payrollScheduleRow) ([]dto.PayrollRateLineDTO, int, float64) {
	byRate := make(map[float64]int)
	for _, r := range rows {
		byRate[r.PayRateSnapshot]++
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
	return lines, totalSessions, round2(totalAmount)
}

// payrollMonths แยกคาบและเงินที่จ่ายออกเป็นรายเดือน เรียงจากเก่าไปใหม่
//
// ⚠️ Expected กับ Paid ของเดือนเดียวกันไม่ต้องเท่ากัน และไม่ใช่ความผิดพลาด
// คาบที่สอนเดือนมกราอาจถูกจ่ายเดือนกุมภา ผลต่างรายเดือนจึงไม่ใช่ "ยอดค้างจ่าย"
// ยอดค้างจ่ายจริงคิดสะสมทั้งช่วงที่ ComputeCoachPayroll
func payrollMonths(rows []payrollScheduleRow, paidByMonth map[string]float64) []dto.PayrollMonthDTO {
	type bucket struct {
		sessions int
		expected float64
		paid     float64
	}

	months := make(map[string]*bucket)
	get := func(key string) *bucket {
		if b, ok := months[key]; ok {
			return b
		}
		b := &bucket{}
		months[key] = b
		return b
	}

	for _, r := range rows {
		key := monthKeyFromDate(r.Date)
		if key == "" {
			continue
		}
		b := get(key)
		b.sessions++
		b.expected += r.PayRateSnapshot
	}

	// เดือนที่จ่ายเงินแต่ไม่มีคาบ (เช่นจ่ายตกเบิกข้ามเดือน) ต้องโผล่ด้วย
	// ไม่งั้นเงินที่โค้ชได้รับจะหายไปจากตารางทั้งก้อน
	for key, amount := range paidByMonth {
		get(key).paid += amount
	}

	keys := make([]string, 0, len(months))
	for key := range months {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	out := make([]dto.PayrollMonthDTO, 0, len(keys))
	for _, key := range keys {
		year, month, ok := parseMonthKey(key)
		if !ok {
			continue
		}
		b := months[key]
		out = append(out, dto.PayrollMonthDTO{
			Year:     year,
			Month:    month,
			Sessions: b.sessions,
			Expected: round2(b.expected),
			Paid:     round2(b.paid),
		})
	}
	return out
}

// monthKeyFromDate คืน "YYYY-MM" จากค่าคอลัมน์ date
// (อาจมี "T00:00:00Z" ต่อท้ายตามที่ driver ส่งมา — ดู scheduleDateOnly)
func monthKeyFromDate(v string) string {
	d := scheduleDateOnly(v)
	if len(d) < 7 {
		return ""
	}
	return d[:7]
}

func parseMonthKey(key string) (year, month int, ok bool) {
	t, err := time.Parse("2006-01", key)
	if err != nil {
		return 0, 0, false
	}
	return t.Year(), int(t.Month()), true
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

// paidWagesByMonth รวมค่าจ้างที่จ่ายไปแล้ว แยกตามเดือนของ "วันที่ทำรายการ"
// คีย์เป็น "YYYY-MM" ตามเวลาที่สนาม
func paidWagesByMonth(db *gorm.DB, coachID uint) (map[string]float64, error) {
	type row struct {
		Date   time.Time
		Amount float64
	}

	var rows []row
	if err := db.Model(&models.Expense{}).
		Where("coach_id = ? AND type = ?", coachID, models.ExpenseTypeCoach).
		Select("date, amount").
		Scan(&rows).Error; err != nil {
		return nil, errors.New("ไม่สามารถรวมค่าจ้างที่จ่ายไปแล้วได้")
	}

	loc := appLocation()
	out := make(map[string]float64, len(rows))
	for _, r := range rows {
		out[r.Date.In(loc).Format("2006-01")] += r.Amount
	}
	return out, nil
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
