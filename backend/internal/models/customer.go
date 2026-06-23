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
	User   				*User  			`json:"user" gorm:"foreignKey:UserID"`
	
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


	Photos            	[]CustomerPhoto `json:"photo" gorm:"foreignKey:CustomerID"`
	Evaluations       	[]Evaluation    `json:"evaluation" gorm:"foreignKey:CustomerID"`
	Feedbacks         	[]Feedback      `json:"feedback" gorm:"foreignKey:CustomerID"`
	DetectedVideos    	[]DetectedVideo `json:"detectedVideo" gorm:"foreignKey:CustomerID"`
	Enrollments    		[]Enrollment    `json:"enrollment" gorm:"foreignKey:CustomerID"`

	
}

