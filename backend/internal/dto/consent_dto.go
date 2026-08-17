package dto

import "time"

// ─────────────────────────────────────────────────────────────────────────────
// DTO ของระบบความยินยอมเก็บข้อมูลใบหน้า (PDPA)
// ─────────────────────────────────────────────────────────────────────────────

// RecordFaceConsentReq คือ body ตอนผู้ใช้กดยินยอม/ปฏิเสธใน modal
//
// หมายเหตุ: ไม่รับ policy_version จาก client โดยตั้งใจ — เซิร์ฟเวอร์เป็นผู้กำหนดเสมอ
// (ถ้ารับจาก client ผู้ใช้ส่งเวอร์ชันปลอมมาได้ ทำให้หลักฐานการยินยอมเชื่อถือไม่ได้)
//
// ไม่รับ customer_id เช่นกัน — ดึงจาก JWT เท่านั้น จึงบันทึกความยินยอมแทนคนอื่นไม่ได้
type RecordFaceConsentReq struct {
	Action string `json:"action" binding:"required,oneof=granted declined"`
}

// FaceConsentStatusRes คือสถานะความยินยอมปัจจุบันของผู้ใช้ที่ล็อกอินอยู่
type FaceConsentStatusRes struct {
	Status        string     `json:"status"`         // unknown | granted | declined | withdrawn
	PolicyVersion string     `json:"policy_version"` // เวอร์ชันประกาศที่ผู้ใช้เคยตอบไว้ (ว่างถ้ายังไม่เคยตอบ)
	ActedAt       *time.Time `json:"acted_at"`       // เวลาที่ตอบครั้งล่าสุด (null ถ้ายังไม่เคยตอบ)

	// NeedsDecision บอกหน้าเว็บว่าต้องเด้ง modal ขอความยินยอมหรือไม่
	NeedsDecision bool `json:"needs_decision"`

	// CanUseFaceCheckIn บอกว่าตอนนี้ใช้การเช็คชื่อด้วยใบหน้าได้หรือยัง
	//
	// รอบนี้ = (status == granted) เท่านั้น เพราะยังไม่มีระบบเก็บรูป
	// เมื่อทำเฟสเก็บรูปแล้ว ต้องเพิ่มเงื่อนไข "มีรูปที่พร้อมใช้อย่างน้อย 1 ใบ" ด้วย
	CanUseFaceCheckIn bool `json:"can_use_face_check_in"`
}

// LegalReference คืออ้างอิงมาตรากฎหมายที่รองรับข้อความแต่ละส่วนในประกาศ
type LegalReference struct {
	Law         string `json:"law"`         // ชื่อกฎหมาย
	Section     string `json:"section"`     // มาตรา
	Description string `json:"description"` // มาตรานี้กำหนดอะไร และเกี่ยวกับประกาศนี้อย่างไร
}

// DataControllerContact คือข้อมูลติดต่อผู้ควบคุมข้อมูลส่วนบุคคล
// มาตรา 23(5) บังคับให้ต้องแจ้งข้อมูลนี้ก่อนหรือขณะเก็บข้อมูล
type DataControllerContact struct {
	Name    string `json:"name"`
	Address string `json:"address"`
	Email   string `json:"email"`
	Phone   string `json:"phone"`
}

// FaceConsentPolicyRes คือเนื้อหาประกาศที่หน้าเว็บเอาไปแสดงใน modal
//
// โครงสร้างนี้ออกแบบให้ครอบคลุมสิ่งที่ พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562
// มาตรา 23 บังคับให้ต้องแจ้งเจ้าของข้อมูลก่อนหรือขณะเก็บข้อมูล:
//
//	ม.23(1) วัตถุประสงค์           → Purposes
//	ม.23(2) ผลกระทบหากไม่ให้ข้อมูล → DeclineNotice
//	ม.23(3) ข้อมูลที่เก็บ + ระยะเวลา → DataCollected, Retention
//	ม.23(4) ผู้ที่อาจได้รับข้อมูล    → Disclosure
//	ม.23(5) ข้อมูลติดต่อผู้ควบคุม   → Controller
//	ม.23(6) สิทธิของเจ้าของข้อมูล   → Rights
//
// และมาตรา 19 วรรคหก ที่บังคับให้แจ้งผลกระทบของการถอนความยินยอม → WithdrawalNotice
//
// ⚠️ อย่าลบฟิลด์ใดฟิลด์หนึ่งออกโดยไม่ตรวจก่อนว่าข้อกำหนดข้างต้นยังครบอยู่
type FaceConsentPolicyRes struct {
	Version       string   `json:"version"`
	Title         string   `json:"title"`
	Summary       string   `json:"summary"`
	DataCollected []string `json:"data_collected"`
	Purposes      []string `json:"purposes"`
	NotUsedFor    []string `json:"not_used_for"`
	Disclosure    []string `json:"disclosure"`
	Retention     string   `json:"retention"`
	Rights        []string `json:"rights"`
	DeclineNotice string   `json:"decline_notice"`
	// WithdrawalNotice แจ้งผลของการถอนความยินยอม ตามมาตรา 19 วรรคหก
	WithdrawalNotice string `json:"withdrawal_notice"`

	Controller      DataControllerContact `json:"controller"`
	LegalReferences []LegalReference      `json:"legal_references"`
}

// FaceConsentHistoryItem คือหนึ่งแถวในประวัติความยินยอม (สำหรับแอดมินตรวจสอบย้อนหลัง)
//
// เจ้าของแถวเป็นได้ทั้งนักเรียนและโค้ช จึงใช้ชื่อฟิลด์กลาง ๆ ว่า Subject
// แล้วบอกบทบาทไว้ที่ SubjectRole แทนการมีชุดฟิลด์แยกตามบทบาท
type FaceConsentHistoryItem struct {
	ID uint `json:"id"`

	// SubjectRole บอกว่าแถวนี้เป็นของใคร: "customer" หรือ "coach"
	SubjectRole string `json:"subject_role"`
	// SubjectID คือ customers.id หรือ coaches.id ตาม SubjectRole
	SubjectID    uint   `json:"subject_id"`
	SubjectName  string `json:"subject_name"`
	SubjectEmail string `json:"subject_email"`

	Action        string    `json:"action"`
	PolicyVersion string    `json:"policy_version"`
	ActedAt       time.Time `json:"acted_at"`
}
