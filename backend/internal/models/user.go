package models

import (
	"gorm.io/gorm"
)

type UserRole string

const (
	AdminRole    UserRole = "admin"
	CustomerRole UserRole = "customer"
	CoachRole    UserRole = "coach"
)

type User struct {
	gorm.Model
	Role				UserRole 		`json:"role" valid:"required~Role is required,oneof(admin customer coach)~Invalid role value"`
	FirstName			string 			`json:"firstName" valid:"required~First name is required"`
	LastName  			string 			`json:"lastName" valid:"required~Last name is required"`
	Email 				string 			`json:"email" gorm:"unique" valid:"required~Email is required,email~Invalid email format"`
	Password 			string 			`json:"password" valid:"required~Password is required,length(6|30)~Password must be between 6 and 30 characters"`

	Customer          *Customer          `json:"customer" gorm:"foreignKey:UserID"`
	Coach     		  *Coach             `json:"coach" gorm:"foreignKey:UserID"`
	Courses            []Course           `json:"courses" gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE;"`
	StudentAttendances []StudentAttendance `json:"studentAttendances" gorm:"foreignKey:UserID"`

	CustomerBillings []Billing `json:"customer_billings" gorm:"foreignKey:CustomerID"`
	
	AdminBillings    []Billing `json:"admin_billings" gorm:"foreignKey:AdminID"`
	
	CustomerInvoices []Invoice `json:"customer_invoices" gorm:"foreignKey:CustomerID"`

	Announcements []Announcement `json:"announcements" gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE;"`
}

