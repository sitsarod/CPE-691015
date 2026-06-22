package models

import (
	"gorm.io/gorm"
	"time"
)

type CustomerStatus string

const (
	CustomerStatusActive   CustomerStatus = "active"
	CustomerStatusInactive CustomerStatus = "inactive"

)

type Customer struct {
	gorm.Model
	UserID				uint			`json:"userId"`
	FirstName			string			`json:"firstName"`
	LastName  			string 			`json:"lastName"`
	Email 				string 			`json:"email" gorm:"unique"`
	Password 			string 			`json:"password"`
	PhoneNumber 		string 			`json:"phoneNumber"`
	BirthDate 			time.Time		`json:"birthDate"`
	ParentEmail			string 			`json:"parentEmail"`
	ParentPhoneNumber 	string 			`json:"parentPhoneNumber"`
	ConsentedPurposes 	bool 			`json:"consentedPurposes" gorm:"default:false"`
	PersonalQRCode 		string 			`json:"personalQR" gorm:"unique"`
	Status 				CustomerStatus 	`json:"status" gorm:"default:'active'"`


	Photos            	[]CustomerPhoto `gorm:"foreignKey:CustomerID"`
	Evaluations       	[]Evaluation    `gorm:"foreignKey:CustomerID"`
	Feedbacks         	[]Feedback      `gorm:"foreignKey:CustomerID"`
	DetectedVideos    	[]DetectedVideo `gorm:"foreignKey:CustomerID"`
}

