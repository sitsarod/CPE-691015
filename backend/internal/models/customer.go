package models

import (
	"gorm.io/gorm"
	"time"
)

type Customer struct {
	gorm.Model
	FirstName			string			`json:"firstName"`
	LastName  			string 			`json:"lastName"`
	Email 				string 			`json:"email" gorm:"unique"`
	Password 			string 			`json:"password"`
	PhoneNumber 		string 			`json:"phoneNumber"`
	BirthDate 			time.Time		`json:"birthDate"`
	ParentEmail			string 			`json:"emailParent"`
	ParentPhoneNumber 	string 			`json:"parentPhoneNumber"`
	ConsentedPurposes 	bool 			`json:"consentedPurposes" gorm:"default:false"`
	PersonalQRCode 		string 			`json:"personalQR" gorm:"unique"`
	
}