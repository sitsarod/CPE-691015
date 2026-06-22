package models

import (
	"time"

	"gorm.io/gorm"
)

type CoachAttendance struct {
	gorm.Model

	WorkDate      time.Time        `json:"work_date" gorm:"type:date" valid:"required~workDate is required"`
	CheckInTime   time.Time        `json:"check_in_time" valid:"required~checkInTime is required"`
	CheckInMethod CheckInMethod    `json:"check_in_method" gorm:"type:varchar(50)"`
	Status        AttendanceStatus `json:"status" gorm:"type:varchar(20);default:'present'"`

}