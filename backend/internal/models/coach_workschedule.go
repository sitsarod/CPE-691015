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

	// PayRateSnapshot = ค่าจ้างต่อคาบของโค้ชคนนี้ ณ วันที่คาบนี้ถูกมอบหมาย
	//
	// ⚠️ ต้องเก็บสแนปช็อต ห้ามคูณด้วย coaches.pay_rate ตอนคำนวณ
	//
	// เดิมยอดค้างจ่ายคิดจาก (จำนวนคาบทั้งหมด × เรตปัจจุบัน) ผลคือวันที่ขึ้นค่าจ้าง
	// โค้ชจาก 300 เป็น 400 ระบบจะคิดว่าค้างจ่ายย้อนหลัง "ทุกคาบที่เคยสอนมา"
	// ในอัตราใหม่ทันที = หนี้ที่ไม่มีอยู่จริงโผล่ขึ้นมาเป็นก้อน
	//
	// เก็บเป็น 0 สำหรับโค้ชรายเดือน เพราะไม่มีค่าจ้างรายคาบให้สแนปช็อต
	// (ถ้าเปลี่ยนเป็นรายครั้งทีหลัง คาบเก่าจะยังเป็น 0 — จ่ายย้อนหลังผ่าน coach_other)
	//
	// หมายเหตุเรื่อง default tag: GORM ตัดฟิลด์ที่เป็นค่าศูนย์ออกจาก INSERT เมื่อมี
	// default tag แล้วปล่อยให้ฐานเติมให้ ตรงนี้ไม่เป็นปัญหาเพราะค่าที่ฐานเติมคือ 0
	// เท่ากับค่าที่ตั้งใจจะเขียนอยู่แล้ว (ต่างจากกรณี bool ใน CoachAttendance.IsScheduled
	// ที่ค่า default ของฐานไม่ตรงกับค่าที่ต้องการ)
	PayRateSnapshot float64 `json:"pay_rate_snapshot" gorm:"type:decimal(10,2);not null;default:0"`
}
