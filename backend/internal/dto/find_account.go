package dto

import "strings"

// FindAccountResponse ผลลัพธ์ของการค้นหาบัญชีในขั้นตอน "ลืมรหัสผ่าน"
//
// ⚠️ เส้นนี้เรียกได้โดยไม่ต้องล็อกอิน จึงห้ามคืนข้อมูลส่วนบุคคลเด็ดขาด
//
// เดิมคืน ชื่อจริง นามสกุล ชื่อเล่น อีเมลเต็ม เบอร์โทรเต็ม และ role
// ทำให้ใครก็ตามที่ไล่ยิงเบอร์ 08xxxxxxxx เข้ามาสามารถกวาดรายชื่อสมาชิก
// พร้อมเบอร์ติดต่อได้ทั้งระบบ ซึ่งเป็นปัญหา PDPA โดยตรง
// (สมาชิกส่วนใหญ่เป็นผู้เยาว์)
//
// ตอนนี้คืนเฉพาะค่าที่ปิดบังแล้ว พอให้เจ้าของบัญชียืนยันว่า "ใช่ของฉัน"
// แต่คนที่ไม่ใช่เจ้าของเอาไปใช้ต่อไม่ได้
type FindAccountResponse struct {
	// MaskedEmail เช่น so****k@gmail.com
	MaskedEmail string `json:"maskedEmail"`

	// MaskedPhone เช่น 08x-xxx-1234 (ว่างถ้าบัญชีนั้นไม่มีเบอร์)
	MaskedPhone string `json:"maskedPhone"`
}

// MaskEmail ปิดบังส่วนหน้า @ โดยเหลือตัวแรกกับตัวสุดท้ายไว้
//
//	somchai@gmail.com  → s*****i@gmail.com
//	ab@gmail.com       → **@gmail.com   (สั้นเกินกว่าจะเหลือเบาะแสได้)
func MaskEmail(email string) string {
	local, domain, ok := strings.Cut(email, "@")
	if !ok || local == "" {
		return ""
	}

	// ชื่อสั้นมากก็ปิดทั้งหมด เพราะเหลือตัวแรก/ตัวท้ายไว้แทบจะเท่ากับบอกทั้งชื่อ
	if len(local) <= 3 {
		return strings.Repeat("*", len(local)) + "@" + domain
	}

	return string(local[0]) + strings.Repeat("*", len(local)-2) + string(local[len(local)-1]) + "@" + domain
}

// MaskPhone ปิดบังเบอร์โทรโดยเหลือ 4 ตัวท้ายไว้ให้เจ้าของจำได้
//
//	0812345678 → 08x-xxx-5678
func MaskPhone(phone string) string {
	if len(phone) < 4 {
		return ""
	}
	return phone[:2] + "x-xxx-" + phone[len(phone)-4:]
}
