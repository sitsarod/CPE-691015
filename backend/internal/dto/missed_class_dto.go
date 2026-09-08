package dto

// ─── คาบที่สอนไปแล้วแต่ไม่เคยมีรอบเช็คชื่อ ───────────────────────────────────
//
// ค่าจ้างของโค้ชนับจากตารางงานที่ "มีรอบเช็คชื่อปิดแล้ว" เท่านั้น
// ถ้าแอดมินลืมเปิดรอบ หรือเปิดไม่ทันช่วงที่ระบบอนุญาต คาบนั้นจะไม่ถูกนับ
// และไม่มีทางเปิดรอบย้อนหลังได้ = โค้ชสอนจริงแต่ได้ 0 บาทโดยไม่มีใครเห็น
//
// DTO ชุดนี้ทำให้ช่องว่างนั้นมองเห็นได้ และให้แอดมินตัดสินใจแบบมีบันทึกว่าใครมาสอนบ้าง

// MissedClassCoachDTO คือโค้ชหนึ่งคนที่ถูกมอบหมายคาบที่ค้างอยู่
type MissedClassCoachDTO struct {
	CoachID  uint   `json:"coach_id"`
	FullName string `json:"full_name"`
	Nickname string `json:"nickname"`

	// true = คาบนี้ถูกมอบหมายนอกกฎ (แอดมินติ๊กฉุกเฉิน หรือระบบสร้างให้ตอนโค้ชสแกน)
	IsEmergency bool `json:"is_emergency"`
}

// MissedClassDTO คือ "หนึ่งคลาส" ที่ค้างอยู่ ไม่ใช่หนึ่งตารางงาน
//
// คลาสเดียวมีโค้ชได้หลายคน (co-teach) และการเคลียร์ต้องตัดสินใจพร้อมกันทั้งคลาส
// เพราะการสร้างรอบเช็คชื่อขึ้นมาหนึ่งรอบ มีผลกับค่าจ้างของทุกคนในคลาสนั้นทันที
type MissedClassDTO struct {
	// WorkScheduleID = ตารางงานตัวแทนของคลาสนี้ ใช้ส่งกลับมาตอนเคลียร์
	WorkScheduleID uint `json:"work_schedule_id"`

	CourseID   uint   `json:"course_id"`
	CourseName string `json:"course_name"`

	Date      string `json:"date"` // YYYY-MM-DD
	StartTime string `json:"start_time"`
	EndTime   string `json:"end_time"`

	Coaches []MissedClassCoachDTO `json:"coaches"`
}

// ResolveMissedClassCoachReq คือคำตัดสินของแอดมินสำหรับโค้ชหนึ่งคน
type ResolveMissedClassCoachReq struct {
	CoachID uint   `json:"coach_id" binding:"required"`
	Status  string `json:"status" binding:"required,oneof=present absent"`
	Remarks string `json:"remarks"`
}

// ResolveMissedClassRequest — ต้องระบุโค้ชให้ครบทุกคนของคลาส ห้ามส่งมาบางคน
//
// ⚠️ เจตนา ไม่ใช่ความเข้มงวดเกินจำเป็น
// ถ้าปล่อยให้ส่งมาบางคน คนที่เหลือจะได้เงินอัตโนมัติ (กติกาผ่อนปรน: ไม่มีแถว absent = ได้เงิน)
// กลายเป็นจ่ายเงินโดยไม่มีใครตัดสินใจ ซึ่งคือบั๊กเดิมข้อ 2 ที่เพิ่งแก้ไป
type ResolveMissedClassRequest struct {
	WorkScheduleID uint                         `json:"work_schedule_id" binding:"required"`
	Coaches        []ResolveMissedClassCoachReq `json:"coaches" binding:"required,min=1,dive"`
}

// ResolveMissedClassResultDTO บอกผลว่าสร้างรอบไหนขึ้นมา และใครได้/ไม่ได้นับคาบ
type ResolveMissedClassResultDTO struct {
	SessionID uint   `json:"session_id"`
	PackageID uint   `json:"package_id"`
	Date      string `json:"date"`
	StartTime string `json:"start_time"`
	EndTime   string `json:"end_time"`

	PresentCoachIDs []uint `json:"present_coach_ids"`
	AbsentCoachIDs  []uint `json:"absent_coach_ids"`
}
