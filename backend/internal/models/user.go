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
	Role      UserRole `json:"role"`
	FirstName string   `json:"firstName"`
	LastName  string   `json:"lastName"`
	Email     string   `json:"email" gorm:"unique"`
	Password  string   `json:"password"`

	Customers          []Customer          `gorm:"foreignKey:UserID"`
	Courses            []Package           `json:"courses" gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE;"`
	StudentAttendances []StudentAttendance `json:"studentAttendances" gorm:"foreignKey:UserID"`

	CustomerBillings []Billing `json:"customer_billings" gorm:"foreignKey:CustomerID"`
	
	AdminBillings    []Billing `json:"admin_billings" gorm:"foreignKey:AdminID"`
	
	CustomerInvoices []Invoice `json:"customer_invoices" gorm:"foreignKey:CustomerID"`
}
