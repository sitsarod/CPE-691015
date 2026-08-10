package models

import (
	"gorm.io/gorm"
)

type Coach struct {
	gorm.Model
	UserID            uint            `json:"user_id" valid:"required~UserID is required"`
    User              *User           `json:"user" ` 
	
	Phone          string `json:"phone" gorm:"type:varchar(20)" valid:"required~phone is required"`
	Uid            string `json:"uid" gorm:"type:varchar(255);unique" valid:"required~uid is required"`
	Address        string `json:"address" gorm:"type:varchar(255)" valid:"required~address is required"`
	BirthDate      string `json:"birth_date" gorm:"type:date" valid:"required~birthDate is required"` // ปรับเป็น type:date เพื่อมาตรฐานข้อมูล
	Nickname       string `json:"nickname" gorm:"type:varchar(100)" valid:"required~nickname is required"`
	ProfilePicture string `json:"profile_picture" gorm:"type:varchar(255)" valid:"required~profilePicture is required"`
	Specialization string `json:"specialization" gorm:"type:varchar(255)" valid:"required~specialization is required"`
	CoachLicense   string `json:"coach_license" gorm:"type:varchar(50)" valid:"required~coachLicense is required"`
	BankAccount    string `json:"bank_account" gorm:"type:varchar(255)" valid:"required~bankAccount is required"`
	PaymentInfo    string `json:"payment_info" gorm:"type:varchar(255)" valid:"required~paymentInfo is required"`
	// PaymentType กำหนดวิธีจ่ายค่าจ้างของโค้ชคนนี้: "per_session" (รายครั้ง) หรือ "monthly" (รายเดือน)
	// มีค่าเดียวต่อโค้ชหนึ่งคน — ไม่ให้กรอกอัตราทั้งสองแบบพร้อมกันเพื่อกันข้อมูลขัดแย้งกัน
	PaymentType string  `json:"payment_type" gorm:"type:varchar(20);default:'per_session'" valid:"required~paymentType is required"`
	PayRate     float64 `json:"pay_rate" gorm:"type:decimal(10,2);default:0"` // อัตราค่าจ้าง: บาท/ครั้ง ถ้า per_session หรือ บาท/เดือน ถ้า monthly

	// FeatureOnHome เลือกให้โค้ชคนนี้แสดงในส่วนบุคลากรของหน้าแรกสาธารณะ
	FeatureOnHome bool `json:"feature_on_home" gorm:"default:false"`

	CoachAvailability []CoachAvailability `json:"coach_availability" gorm:"foreignKey:CoachID;constraint:OnDelete:CASCADE;"`
	WorkSchedules     []WorkSchedule      `json:"work_schedules" gorm:"foreignKey:CoachID;constraint:OnDelete:CASCADE;"`
	Photos            []Photo             `json:"photo" gorm:"foreignKey:CoachID;constraint:OnDelete:CASCADE;"`
	CoachAttendances []CoachAttendance `json:"coach_attendances" gorm:"foreignKey:CoachID;constraint:OnDelete:CASCADE;"`
}