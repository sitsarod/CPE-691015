package models

import (
	"gorm.io/gorm"
)

type WorkSchedule struct {
	gorm.Model

	Date        string `json:"date" gorm:"type:date" valid:"required~date is required"`
	StartTime   string `json:"start_time" gorm:"type:varchar(10)" valid:"required~startTime is required"`
	EndTime     string `json:"end_time" gorm:"type:varchar(10)" valid:"required~endTime is required"`
	Description string `json:"description" gorm:"type:text" valid:"required~description is required"`
	Courtnumber string `json:"court_number" gorm:"column:court_number;type:varchar(10)" valid:"required~courtNumber is required"`

	CoachID uint   `json:"coach_id" gorm:"not null" valid:"required~coachId is required"`
	Coach   *Coach `json:"coach,omitempty" gorm:"foreignKey:CoachID;constraint:OnDelete:CASCADE;"`

	CourseID uint    `json:"course_id" gorm:"not null" valid:"required~courseId is required"`
	Course   *Course `json:"course,omitempty" gorm:"foreignKey:CourseID;constraint:OnDelete:CASCADE;"`

	// ผูกคาบสอนกับคาบเรียนของ package (session-centric assign)
	// เป็น nullable pointer เพื่อไม่ให้ของเดิมที่ยังไม่มีค่าเหล่านี้พัง และรองรับคาบที่สร้างแบบเก่า (กรอกเวลาเอง)
	PackageID         *uint `json:"package_id" gorm:"index"`
	PackageScheduleID *uint `json:"package_schedule_id" gorm:"index"`

	// IsEmergency = แถวนี้ถูกมอบหมายนอกกฎปกติ มีสองทางที่ทำให้เป็น true
	//
	//	1. แอดมินติ๊ก "กรณีฉุกเฉิน" ตอน assign (ข้ามเช็คเวลาว่าง แต่ยังเช็คเวลาชน/สนามซ้อน)
	//	2. โค้ชสแกนเช็คชื่อคาบที่ยังไม่ได้ assign — ระบบเพิ่มให้หน้างาน ไม่ผ่านการตรวจใด ๆ
	//	   และ court_number ว่างรอแอดมินเติม
	//
	// แยกสองกรณีจากกันได้ที่ Description
	//
	// ⚠️ เป็นข้อเท็จจริงทางประวัติศาสตร์ ไม่ใช่สถานะที่รอเคลียร์
	// แอดมินเติมสนามทีหลังแล้วธงยังเป็น true อยู่ — ตั้งใจ ไม่ใช่บั๊ก
	// เพราะคาบนั้นเคยถูกมอบหมายนอกกฎจริง ๆ (ดู Update ที่ไม่แตะฟิลด์นี้)
	IsEmergency bool `json:"is_emergency" gorm:"not null;default:false;index"`
}
