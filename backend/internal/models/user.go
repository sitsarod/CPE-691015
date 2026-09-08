package models

import (
	"gorm.io/gorm"
)

type UserRole string

const (
	AdminRole    UserRole = "admin"
	CustomerRole UserRole = "customer"
	CoachRole    UserRole = "coach"
	//StudentRole  UserRole = "student"
)

type User struct {
	gorm.Model
	Role				UserRole 		`json:"role" valid:"required~Role is required,oneof(admin customer coach)~Invalid role value"`
	FirstName			string 			`json:"firstName" valid:"required~First name is required"`
	LastName  			string 			`json:"lastName" valid:"required~Last name is required"`
	// ตรวจแค่ "รูปแบบอีเมลถูกต้อง" ตรงนี้เท่านั้น
	// ส่วนกติกาว่าบทบาทไหนใช้โดเมนอะไรได้ อยู่ที่ services.ValidateEmailForRole
	// เพราะโมเดลไม่ควรรู้เรื่องนโยบายที่ต่างกันตามบทบาท
	//
	// ⚠️ ไม่มีแท็ก unique โดยตั้งใจ — กติกา "ห้ามอีเมลซ้ำ" ย้ายไปสร้างเป็น
	// partial unique index ที่ services.EnsureSoftDeleteUniqueIndexes แทน
	//
	// เหตุผล: การลบสมาชิกเป็น soft delete แถวที่ลบแล้วยังอยู่ในตาราง
	// unique ธรรมดาจึงจองอีเมลของคนที่ลาออกไปแล้วไว้ตลอดกาล ทำให้รับคนเดิม
	// กลับเข้ามาใหม่ไม่ได้ index ตัวใหม่เติมเงื่อนไข WHERE deleted_at IS NULL
	// ให้ตรงกับที่โค้ดฝั่ง Go เช็คอยู่แล้ว
	//
	// ห้ามใส่แท็ก unique กลับเข้ามา ไม่งั้น AutoMigrate จะสร้างกติกาเก่าทับอีกครั้ง
	Email 				string 			`json:"email" valid:"required~Email is required,email~รูปแบบอีเมลไม่ถูกต้อง"`
	Password 			string 			`json:"password" valid:"required~Password is required,length(6|30)~Password must be between 6 and 30 characters"`

	// TokenVersion ใช้ยกเลิก token เก่าทั้งหมดของผู้ใช้คนนี้พร้อมกัน
	//
	// JWT ตรวจสอบด้วยลายเซ็นอย่างเดียว เซิร์ฟเวอร์จึงไม่มีทางรู้ว่า token
	// ใบไหนถูกออกไปแล้วบ้าง และ "ยกเลิก" ใบใดใบหนึ่งไม่ได้ ผลคือถ้าใครถูกขโมย
	// บัญชีไป การเปลี่ยนรหัสผ่านก็ไม่ได้ไล่คนร้ายออกจากระบบ เขายังใช้ token
	// ที่ถืออยู่ต่อได้จนหมดอายุ
	//
	// วิธีแก้คือใส่เลขรุ่นนี้ลงไปใน token ตอนออก แล้วเทียบกับค่าในฐานทุกครั้ง
	// ที่มีคนเรียก API พอเปลี่ยนรหัสผ่านก็บวกเลขนี้ขึ้นหนึ่ง token ทุกใบที่ออก
	// ไปก่อนหน้าจะมีเลขไม่ตรงและใช้ไม่ได้ทันที
	//
	// ⚠️ เริ่มที่ 0 โดยตั้งใจ — token เก่าที่ออกก่อนมีฟีเจอร์นี้ไม่มีเลขรุ่นติดมา
	// ระบบจะอ่านได้เป็น 0 ซึ่งตรงกับค่าเริ่มต้น คนที่ล็อกอินค้างอยู่จึงไม่ถูก
	// เตะออกจากระบบตอนอัปเดตโค้ด
	TokenVersion int `json:"-" gorm:"not null;default:0"`

	Customer          *Customer          `json:"customer" gorm:"foreignKey:UserID"`
	Coach     		  *Coach             `json:"coach" gorm:"foreignKey:UserID"`
	Courses            []Course           `json:"courses" gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE;"`
	StudentAttendances []StudentAttendance `json:"studentAttendances" gorm:"foreignKey:UserID"`

	CustomerBillings []Billing `json:"customer_billings" gorm:"foreignKey:CustomerID"`
	
	AdminBillings    []Billing `json:"admin_billings" gorm:"foreignKey:AdminID"`
	
	CustomerInvoices []Invoice `json:"customer_invoices" gorm:"foreignKey:CustomerID"`

	Announcements []Announcement `json:"announcements" gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE;"`
}

