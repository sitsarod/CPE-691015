package models

import (
	"gorm.io/gorm"
)

type Coach struct {
	gorm.Model

	FirstName      string `json:"first_name" gorm:"type:varchar(100)" valid:"required~firstName is required"`
	LastName       string `json:"last_name" gorm:"type:varchar(100)" valid:"required~lastName is required"`
	Email          string `json:"email" gorm:"type:varchar(100);unique" valid:"required~email is required"`
	Phone          string `json:"phone" gorm:"type:varchar(20)" valid:"required~phone is required"`
	Password       string `json:"password" gorm:"type:varchar(255)" valid:"required~password is required"`
	Uid            string `json:"uid" gorm:"type:varchar(255);unique" valid:"required~uid is required"`
	Address        string `json:"address" gorm:"type:varchar(255)" valid:"required~address is required"`
	BirthDate      string `json:"birth_date" gorm:"type:date" valid:"required~birthDate is required"` // ปรับเป็น type:date เพื่อมาตรฐานข้อมูล
	Nickname       string `json:"nickname" gorm:"type:varchar(100)" valid:"required~nickname is required"`
	ProfilePicture string `json:"profile_picture" gorm:"type:varchar(255)" valid:"required~profilePicture is required"`
	Specialization string `json:"specialization" gorm:"type:varchar(255)" valid:"required~specialization is required"`
	BankAccount    string `json:"bank_account" gorm:"type:varchar(255)" valid:"required~bankAccount is required"`
	PaymentInfo    string `json:"payment_info" gorm:"type:varchar(255)" valid:"required~paymentInfo is required"`

	CoachAvailability []CoachAvailability `json:"coach_availability" gorm:"foreignKey:CoachID;constraint:OnDelete:CASCADE;"`
	WorkSchedules     []WorkSchedule      `json:"work_schedules" gorm:"foreignKey:CoachID;constraint:OnDelete:CASCADE;"`
	Photos            []Photo             `json:"photos" gorm:"foreignKey:CoachID;constraint:OnDelete:CASCADE;"`
	CoachAttendances []CoachAttendance `json:"coach_attendances" gorm:"foreignKey:CoachID;constraint:OnDelete:CASCADE;"`
}
