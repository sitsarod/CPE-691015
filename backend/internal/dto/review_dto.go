package dto

import "time"

// ReviewCustomerDTO ข้อมูลย่อของผู้เขียนรีวิว (ไม่เปิดเผยข้อมูลอ่อนไหว)
type ReviewCustomerDTO struct {
	ID        uint   `json:"id"`
	Nickname  string `json:"nickname"`
	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`
}

// ReviewCourseDTO ข้อมูลย่อของคอร์สที่ถูกรีวิว
type ReviewCourseDTO struct {
	ID         uint   `json:"id"`
	CourseName string `json:"course_name"`
}

// ReviewCoachDTO ข้อมูลย่อของโค้ชที่ถูกรีวิว
type ReviewCoachDTO struct {
	ID       uint   `json:"id"`
	Nickname string `json:"nickname"`
}

// CourseCoachDTO โค้ชที่สอนอยู่ในคอร์ส ใช้ให้ลูกค้าเลือกรีวิว
type CourseCoachDTO struct {
	ID             uint   `json:"id"`
	Nickname       string `json:"nickname"`
	Specialization string `json:"specialization"`
	ProfilePicture string `json:"profile_picture"`
}

type ReviewDTO struct {
	ID         uint               `json:"id"`
	CustomerID uint               `json:"customer_id"`
	Customer   *ReviewCustomerDTO `json:"customer"`
	Category   string             `json:"category"`
	CourseID   *uint              `json:"course_id"`
	Course     *ReviewCourseDTO   `json:"course"`
	CoachID    *uint              `json:"coach_id"`
	Coach      *ReviewCoachDTO    `json:"coach"`
	Rating     int                `json:"rating"`
	Comment    string             `json:"comment"`
	IsFeatured bool               `json:"is_featured"`
	CreatedAt  time.Time          `json:"created_at"`
	UpdatedAt  time.Time          `json:"updated_at"`
}

// CreateReviewReq ใช้ตอนลูกค้าส่งรีวิว (customer_id มาจาก JWT ไม่ใช่ body)
//
// CourseID บังคับเสมอ — ใช้ตรวจสิทธิ์ว่าเคยเข้าเรียนคอร์สนี้แล้ว แม้หัวข้อรีวิว
// จะเป็น place/service/other ก็ยังต้องผูกกับคอร์สที่กำลังเรียนอยู่
//
// CoachID บังคับเฉพาะตอน Category = "coach" (ตรวจที่ service)
type CreateReviewReq struct {
	Category string `json:"category" binding:"required,oneof=course coach place service other"`
	CourseID uint   `json:"course_id" binding:"required"`
	CoachID  *uint  `json:"coach_id"`
	Rating   int    `json:"rating" binding:"required,min=1,max=5"`
	Comment  string `json:"comment" binding:"required"`
}

// UpdateReviewReq ใช้ตอนแอดมินแก้ไขรีวิว (เช่น ปรับคะแนน/ข้อความ/หัวข้อ)
type UpdateReviewReq struct {
	Category string `json:"category" binding:"omitempty,oneof=course coach place service other"`
	Rating   int    `json:"rating" binding:"omitempty,min=1,max=5"`
	Comment  string `json:"comment"`
}

// FeatureReviewReq ใช้ตอนแอดมินเลือก/ยกเลิกการแสดงรีวิวในหน้าแรก
type FeatureReviewReq struct {
	IsFeatured bool `json:"is_featured"`
}
