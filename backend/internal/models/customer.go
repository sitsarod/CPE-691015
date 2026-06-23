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
	UserID            uint            `json:"user_id" valid:"required~UserID is required"`
    User              *User           `json:"user" gorm:"foreignKey:UserID" ` 

    FirstName         string          `json:"firstName" valid:"required~First name is required"`
    LastName          string          `json:"lastName" valid:"required~Last name is required"`
    BirthDate         time.Time       `json:"birthDate" valid:"required~Birth date is required"`
    Email             string          `json:"email" gorm:"unique" valid:"required~Email is required,email~Invalid email format"`
    Password          string          `json:"password" valid:"required~Password is required,length(6|30)~Password must be between 6 and 30 characters"`
    PhoneNumber       string          `json:"phoneNumber" valid:"required~Phone number is required,numeric~Phone number must contain only numbers,length(10)~Invalid phone number length"`
    ParentEmail       string          `json:"parentEmail" valid:"email~Invalid parent email format,optional"`
    ParentPhoneNumber string          `json:"parentPhoneNumber" valid:"numeric~Parent phone number must contain only numbers,optional"`
    ConsentedPurposes bool            `json:"consentedPurposes" gorm:"default:false" `
    PersonalQRCode    string          `json:"personalQR" gorm:"unique" valid:"required~Personal QR Code is required"`
    Status            CustomerStatus  `json:"status" gorm:"default:'active'" valid:"required~Status is required"`


	Photos            	[]Photo 		`json:"photo" gorm:"foreignKey:CustomerID"`
	Evaluations       	[]Evaluation    `json:"evaluation" gorm:"foreignKey:CustomerID"`
	Feedbacks         	[]Feedback      `json:"feedback" gorm:"foreignKey:CustomerID"`
	DetectedVideos    	[]DetectedVideo `json:"detectedVideo" gorm:"foreignKey:CustomerID"`
	Enrollments    		[]Enrollment    `json:"enrollment" gorm:"foreignKey:CustomerID"`

	
}

