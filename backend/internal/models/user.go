package models

import (
	"gorm.io/gorm"
)

type UserRole string

const (
	AdminRole		UserRole = "admin"
	CustomerRole	UserRole = "customer"
	CoachRole		UserRole = "coach"

)
type User struct {
	gorm.Model
	Role		UserRole `json:"role"`
	FirstName	string `json:"firstName"`
	LastName  	string `json:"lastName"`
	Email 		string `json:"email" gorm:"unique"`
	Password 	string `json:"password"`

	Customers 	[]Customer `gorm:"foreignKey:UserID"`
	
	StudentAttendances []StudentAttendance `json:"studentAttendances" gorm:"foreignKey:UserID"`
}