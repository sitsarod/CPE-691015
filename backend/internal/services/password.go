package services

import "errors"

// กติกาความยาวรหัสผ่าน
//
// ทำไมต้องเช็คที่ชั้น service ทั้งที่ DTO มี binding:"min=8,max=72" อยู่แล้ว:
//
// binding tag ทำงานเฉพาะตอนที่ข้อมูลเข้ามาทาง HTTP handler เท่านั้น
// ถ้ามีใครเรียก CreateUser จากที่อื่น — เช่น seeder, สคริปต์ import ข้อมูล,
// หรือ endpoint ใหม่ที่ลืมใส่ binding — รหัสผ่านที่ไม่ผ่านเกณฑ์จะหลุดเข้าฐานได้เลย
//
// การเช็คซ้ำที่นี่ทำให้ "ทุกทางที่สร้างผู้ใช้" ผ่านด่านเดียวกันเสมอ
const (
	// PasswordMinLength ความยาวขั้นต่ำ
	PasswordMinLength = 8

	// PasswordMaxLength เพดานของ bcrypt
	//
	// bcrypt ตัดข้อมูลส่วนที่เกิน 72 ไบต์ทิ้งเงียบ ๆ ถ้าไม่กันไว้
	// รหัสผ่านที่ยาวกว่านี้จะถูกตัดโดยที่ผู้ใช้ไม่รู้ตัว และสองรหัสผ่านที่ต่างกัน
	// แต่ 72 ไบต์แรกเหมือนกันจะกลายเป็นรหัสเดียวกัน
	//
	// นับเป็น "ไบต์" ไม่ใช่ "ตัวอักษร" — ภาษาไทย 1 ตัว = 3 ไบต์
	// จึงเท่ากับรหัสผ่านภาษาไทยได้ประมาณ 24 ตัวอักษร
	PasswordMaxLength = 72
)

var (
	ErrPasswordTooShort = errors.New("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร")
	ErrPasswordTooLong  = errors.New("รหัสผ่านต้องไม่เกิน 72 ตัวอักษร")
)

// ValidatePasswordStrength ตรวจความยาวรหัสผ่านก่อนนำไป hash
//
// ใช้ len() ซึ่งนับเป็นไบต์โดยตั้งใจ เพราะเพดาน 72 ของ bcrypt เป็นไบต์
// ถ้านับเป็นตัวอักษร (rune) รหัสผ่านภาษาไทย 30 ตัวจะผ่านด่านนี้
// แล้วไปโดน bcrypt ตัดทิ้งอยู่ดี
func ValidatePasswordStrength(password string) error {
	if len(password) < PasswordMinLength {
		return ErrPasswordTooShort
	}
	if len(password) > PasswordMaxLength {
		return ErrPasswordTooLong
	}
	return nil
}
