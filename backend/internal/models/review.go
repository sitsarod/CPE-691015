package models

import (
	"gorm.io/gorm"
)

// ReviewCategory คือหัวข้อของรีวิว/ข้อเสนอแนะ
// ลูกค้าเลือกได้ว่ากำลังรีวิว/ให้ข้อเสนอแนะเรื่องอะไร
type ReviewCategory string

const (
	ReviewCategoryCourse  ReviewCategory = "course"  // รีวิวคอร์ส
	ReviewCategoryCoach   ReviewCategory = "coach"   // รีวิวโค้ช
	ReviewCategoryPlace   ReviewCategory = "place"   // ข้อเสนอแนะเกี่ยวกับสถานที่
	ReviewCategoryService ReviewCategory = "service" // ข้อเสนอแนะเกี่ยวกับบริการ
	ReviewCategoryOther   ReviewCategory = "other"   // อื่นๆ
)

// Review คือรีวิว/คะแนน/ข้อเสนอแนะที่ลูกค้าให้กับคอร์ส โค้ช หรือสถานฝึกสอนโดยรวม
// ที่ตนได้ลงทะเบียนเรียน แยกหัวข้อด้วย Category
//
// แอดมินสามารถเลือกยกให้บางรีวิวไปแสดงหน้าแรกของระบบได้ (IsFeatured)
//
// ลูกค้าหนึ่งคนรีวิวได้ไม่จำกัดจำนวนครั้ง (ไม่มี unique constraint บน customer/course)
type Review struct {
	gorm.Model

	// ผู้เขียนรีวิว — อ้างถึง Customer เพราะรีวิวได้เฉพาะลูกค้าที่ลงทะเบียนเรียน
	CustomerID uint      `json:"customer_id" valid:"required~CustomerID is required"`
	Customer   *Customer `json:"customer"`

	// หัวข้อของรีวิว — บังคับเลือกเสมอ
	Category ReviewCategory `json:"category" gorm:"type:varchar(20);default:'course'" valid:"required~Category is required,in(course|coach|place|service|other)~Invalid category value"`

	// คอร์สที่รีวิว/ที่เป็นบริบทของข้อเสนอแนะ — บังคับเสมอ เพราะใช้ตรวจสิทธิ์ว่าเคยเข้าเรียนคอร์สนี้จริง
	CourseID *uint   `json:"course_id" valid:"required~CourseID is required"`
	Course   *Course `json:"course" gorm:"foreignKey:CourseID"`

	// โค้ชที่รีวิว — บังคับเฉพาะตอน Category = coach
	CoachID *uint  `json:"coach_id"`
	Coach   *Coach `json:"coach" gorm:"foreignKey:CoachID"`

	// คะแนนดาว 1-5
	Rating int `json:"rating" gorm:"type:int" valid:"required~Rating is required,range(1|5)~Rating must be between 1 and 5"`

	// ข้อความรีวิว
	Comment string `json:"comment" gorm:"type:text" valid:"required~Comment is required,length(1|1000)~Comment must be between 1 and 1000 characters"`

	// IsFeatured = true หมายถึงแอดมินเลือกให้รีวิวนี้แสดงในหน้าแรกของระบบ
	IsFeatured bool `json:"is_featured" gorm:"default:false"`
}
