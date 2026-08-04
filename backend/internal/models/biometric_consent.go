package models

import (
	"time"

	"gorm.io/gorm"
)

// ConsentAction คือการกระทำที่ถูกบันทึกลงตาราง biometric_consents หนึ่งครั้ง
type ConsentAction string

const (
	ConsentGranted   ConsentAction = "granted"   // ยินยอมให้เก็บข้อมูลใบหน้า
	ConsentDeclined  ConsentAction = "declined"  // ปฏิเสธ (เช็คชื่อด้วย QR แทน)
	ConsentWithdrawn ConsentAction = "withdrawn" // เคยยินยอมแล้วขอถอนภายหลัง
)

// FaceConsentStatus คือสถานะปัจจุบันของลูกค้าหนึ่งราย (เก็บซ้ำไว้ที่ตาราง customers)
type FaceConsentStatus string

const (
	FaceConsentUnknown   FaceConsentStatus = "unknown" // ยังไม่เคยถาม → ต้องเด้ง modal
	FaceConsentGranted   FaceConsentStatus = "granted"
	FaceConsentDeclined  FaceConsentStatus = "declined"
	FaceConsentWithdrawn FaceConsentStatus = "withdrawn"
)

// FaceConsentPolicyVersion คือเวอร์ชันของประกาศการเก็บข้อมูลใบหน้าที่ใช้อยู่ปัจจุบัน
//
// ทุกครั้งที่แก้ "ข้อความ" ในประกาศ (ดู services/consent_policy.go) ต้องขยับเลขเวอร์ชันนี้ด้วย
// เพราะ พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคลกำหนดให้ต้องพิสูจน์ได้ว่าเจ้าของข้อมูลยินยอม
// "ตามประกาศฉบับไหน" ถ้าแก้ข้อความแล้วไม่ขยับเวอร์ชัน จะพิสูจน์ย้อนหลังไม่ได้
//
// ประวัติเวอร์ชัน:
//   face-v1.0 — ฉบับแรก
//   face-v1.1 — เพิ่มอ้างอิงมาตรากฎหมาย ข้อมูลติดต่อผู้ควบคุมข้อมูล (ม.23(5))
//               ผู้ที่อาจได้รับข้อมูล (ม.23(4)) และผลของการถอนความยินยอม (ม.19 วรรคหก)
//               พร้อมแก้ข้อความให้ชัดว่าเมื่อยินยอมแล้วเช็คชื่อได้ทั้งสแกนใบหน้าและ QR code
const FaceConsentPolicyVersion = "face-v1.1"

// ToConsentStatus แปลงการกระทำหนึ่งครั้งเป็นสถานะปัจจุบัน
func (a ConsentAction) ToConsentStatus() FaceConsentStatus {
	switch a {
	case ConsentGranted:
		return FaceConsentGranted
	case ConsentDeclined:
		return FaceConsentDeclined
	case ConsentWithdrawn:
		return FaceConsentWithdrawn
	default:
		return FaceConsentUnknown
	}
}

// BiometricConsent เก็บประวัติการให้ความยินยอมเก็บข้อมูลใบหน้า (ข้อมูลชีวภาพ)
//
// ตารางนี้เป็น append-only — ห้าม UPDATE หรือลบแถวเดิมเด็ดขาด
// การเปลี่ยนใจทุกครั้งให้ INSERT แถวใหม่ สถานะปัจจุบันคือแถวล่าสุดของ customer นั้น
// (และถูก denormalize ไว้ที่ Customer.FaceConsentStatus เพื่อไม่ต้อง query หาแถวล่าสุดทุกครั้ง)
//
// เหตุผลที่ต้อง append-only: ต้องพิสูจน์ย้อนหลังได้ว่าใครยินยอมเมื่อไหร่ ตามประกาศเวอร์ชันไหน
// ถ้า update ทับ ประวัติจะหาย และพิสูจน์ความชอบด้วยกฎหมายของการเก็บข้อมูลไม่ได้
type BiometricConsent struct {
	gorm.Model

	// CustomerID คือ customers.id (ไม่ใช่ users.id) — แปลงที่ชั้น service ด้วย ResolveCustomerID
	CustomerID uint      `json:"customer_id" gorm:"index;not null"`
	Customer   *Customer `json:"-" gorm:"foreignKey:CustomerID"`

	Action        ConsentAction `json:"action" gorm:"type:varchar(20);not null"`
	PolicyVersion string        `json:"policy_version" gorm:"type:varchar(20);not null"`
	ActedAt       time.Time     `json:"acted_at" gorm:"not null"`

	// GrantedByUserID คือ users.id ของคนที่กดยืนยัน
	// ปัจจุบันคือเจ้าของบัญชีเอง แต่แยกฟิลด์ไว้เพราะกรณีผู้เยาว์ผู้กดต้องเป็นผู้ปกครอง
	GrantedByUserID uint `json:"granted_by_user_id" gorm:"not null"`

	// ─── สงวนไว้สำหรับเฟสผู้เยาว์ (ยังไม่ใช้งานในรอบนี้) ───
	// IsMinor เป็น pointer โดยตั้งใจ: NULL = "ยังไม่ได้ประเมินว่าเป็นผู้เยาว์หรือไม่"
	// ซึ่งต่างจาก false = "ประเมินแล้วว่าไม่ใช่ผู้เยาว์" — ตารางนี้เป็นหลักฐานทางกฎหมาย
	// จึงไม่ควรบันทึกค่าที่ยังไม่ได้ตรวจสอบจริงลงไป
	IsMinor       *bool  `json:"is_minor"`
	GuardianEmail string `json:"guardian_email" gorm:"type:varchar(255)"`

	// หลักฐานประกอบสำหรับ audit — ไม่ส่งออกทาง API
	IPAddress string `json:"-" gorm:"type:varchar(45)"`
	UserAgent string `json:"-" gorm:"type:text"`
}
