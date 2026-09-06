package dto

// ─── ค่าจ้างโค้ช ─────────────────────────────────────────────────────────────
//
// ⚠️ ตัวเลขทุกตัวในไฟล์นี้คำนวณที่ backend เท่านั้น หน้าเว็บมีหน้าที่ "แสดง" ไม่ใช่ "คิด"
//
// เดิมสูตร (จำนวนคาบ × pay_rate) − ที่จ่ายแล้ว อยู่ใน React ทั้งหมด และ backend
// รับยอดอะไรมาก็บันทึก ยิง API ตรงด้วยตัวเลขเท่าไหร่ก็ผ่าน
//
// ถ้าจะเพิ่มตัวเลขใหม่ ให้เพิ่มที่นี่แล้วให้ backend คิดมาให้ อย่ากลับไปคิดที่หน้าเว็บอีก

// PayrollRateLineDTO คือหนึ่งบรรทัดของ "คาบกี่คาบ ในอัตราเท่าไหร่"
//
// โค้ชที่เคยถูกปรับค่าจ้างจะมีหลายบรรทัด เช่น 8 คาบ × ฿300 และ 4 คาบ × ฿400
// ทำให้แอดมินตรวจได้ว่ายอดรวมมาจากไหน แทนที่จะเห็นแค่ตัวเลขก้อนเดียว
type PayrollRateLineDTO struct {
	PayRate  float64 `json:"pay_rate"`
	Sessions int     `json:"sessions"`
	Amount   float64 `json:"amount"`
}

// CoachPayrollDTO คือคำตอบเดียวที่ทุกหน้าใช้ร่วมกันเรื่องค่าจ้างของโค้ชหนึ่งคน
type CoachPayrollDTO struct {
	CoachID uint `json:"coach_id"`

	PaymentType string  `json:"payment_type"` // per_session | monthly
	PayRate     float64 `json:"pay_rate"`     // อัตราปัจจุบัน — ใช้แสดงผลเท่านั้น ไม่ได้ใช้คิดย้อนหลัง

	SessionsDone int     `json:"sessions_done"` // คาบที่นับเป็นเงินแล้ว (รายเดือน = 0)
	Expected     float64 `json:"expected"`      // ค่าจ้างที่ควรได้ทั้งหมดในช่วงที่นับ
	AlreadyPaid  float64 `json:"already_paid"`  // จ่ายไปแล้วในช่วงเดียวกัน
	Unpaid       float64 `json:"unpaid"`        // ยอดที่จ่ายได้สูงสุดตอนนี้

	// คาบที่สอนไปแล้วแต่ยังไม่มีรอบเช็คชื่อ จึงยังไม่ถูกรวมใน Expected
	//
	// ⚠️ เป็นเงินที่ยังไม่อยู่ในยอด ไม่ใช่ข้อมูลประกอบ — ต้องแสดงก่อนแอดมินกดจ่าย
	// เคลียร์ได้ที่ /admin/attendance/missed
	UnresolvedSessions int     `json:"unresolved_sessions"`
	UnresolvedAmount   float64 `json:"unresolved_amount"`

	RateBreakdown []PayrollRateLineDTO `json:"rate_breakdown"`

	// PeriodNote อธิบายเป็นภาษาคนว่ายอดนี้นับช่วงไหน
	// (รายครั้งนับสะสมทั้งหมด · รายเดือนนับเฉพาะเดือนปัจจุบัน)
	PeriodNote string `json:"period_note"`
}
