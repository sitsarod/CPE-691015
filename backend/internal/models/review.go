package models

import (
	"gorm.io/gorm"
)

// Review คือรีวิว/คะแนนที่ลูกค้าให้กับคอร์สและ/หรือโค้ช ที่ตนได้ลงทะเบียนเรียน
//
// ต่างจาก Feedback (คำร้องเรียน/ข้อเสนอแนะ) ตรงที่ Review มี "คะแนนดาว" (Rating)
// และแอดมินสามารถเลือกยกให้บางรีวิวไปแสดงหน้าแรกของระบบได้ (IsFeatured)
//
// ลูกค้าหนึ่งคนรีวิวได้ไม่จำกัดจำนวนครั้ง (ไม่มี unique constraint บน customer/course)
type Review struct {
	gorm.Model

	// ผู้เขียนรีวิว — อ้างถึง Customer เพราะรีวิวได้เฉพาะลูกค้าที่ลงทะเบียนเรียน
	CustomerID uint      `json:"customer_id" valid:"required~CustomerID is required"`
	Customer   *Customer `json:"customer"`

	// เป้าหมายของรีวิว: คอร์ส และ/หรือ โค้ช (อย่างน้อยต้องมีหนึ่งอย่าง — บังคับที่ service)
	CourseID *uint   `json:"course_id"`
	Course   *Course `json:"course" gorm:"foreignKey:CourseID"`

	CoachID *uint  `json:"coach_id"`
	Coach   *Coach `json:"coach" gorm:"foreignKey:CoachID"`

	// คะแนนดาว 1-5
	Rating int `json:"rating" gorm:"type:int" valid:"required~Rating is required,range(1|5)~Rating must be between 1 and 5"`

	// ข้อความรีวิว
	Comment string `json:"comment" gorm:"type:text" valid:"required~Comment is required,length(1|1000)~Comment must be between 1 and 1000 characters"`

	// IsFeatured = true หมายถึงแอดมินเลือกให้รีวิวนี้แสดงในหน้าแรกของระบบ
	IsFeatured bool `json:"is_featured" gorm:"default:false"`
}
