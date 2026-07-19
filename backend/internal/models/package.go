package models

import (
    "gorm.io/gorm"
)

type DayOfWeek string

const (
    Monday    DayOfWeek = "Monday"
    Tuesday   DayOfWeek = "Tuesday"
    Wednesday DayOfWeek = "Wednesday"
    Thursday  DayOfWeek = "Thursday"
    Friday    DayOfWeek = "Friday"
    Saturday  DayOfWeek = "Saturday"
    Sunday    DayOfWeek = "Sunday"
)

type Package struct {
    gorm.Model

    SessionsCount uint      `json:"sessions_count" valid:"required~sessionsCount is required"`
    HoursCount    uint      `json:"hours_count" valid:"required~hoursCount is required"`
    Price         float64   `json:"price" gorm:"type:decimal(10,2)" valid:"required~price is required"`
    MaxSeats      uint      `json:"max_seats" gorm:"default:10"`
    
    // Foreign Key
    CourseID uint    `json:"course_id" valid:"required~courseId is required"`
    Course   *Course `json:"course,omitempty" gorm:"foreignKey:CourseID"`

    // Relationships
    Schedules   []PackageSchedule `json:"schedules" gorm:"foreignKey:PackageID;constraint:OnDelete:CASCADE;"`
    Enrollments []Enrollment      `json:"enrollments" gorm:"foreignKey:PackageID;constraint:OnDelete:CASCADE;"`
}

type PackageSchedule struct {
    ID        uint      `json:"id" gorm:"primarykey"`
    PackageID uint      `json:"package_id" valid:"required~packageId is required"`
    DayOfWeek DayOfWeek `json:"day_of_week" gorm:"type:varchar(20)" valid:"required~dayOfWeek is required"`
    StartTime string    `json:"start_time" gorm:"type:varchar(10)" valid:"required"`
    EndTime   string    `json:"end_time" gorm:"type:varchar(10)" valid:"required"`
}   