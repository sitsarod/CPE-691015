package models

import (
	"gorm.io/gorm"
	"time"
)

type CustomerStatus string
type Gender string

const (
	CustomerStatusActive   CustomerStatus = "active"
	CustomerStatusInactive CustomerStatus = "inactive"

)

const (
	GenderMale   = "male"
	GenderFemale = "female"
)

type Customer struct {
	gorm.Model
	UserID            uint            `json:"user_id" valid:"required~UserID is required"`
    User              *User           `json:"user" ` 
    Nickname          string          `json:"nickname" gorm:"type:varchar(10)" valid:"required~nickname is required"`
    BirthDate         time.Time       `json:"birthDate" valid:"required~Birth date is required"`
	Gender            Gender          `json:"gender" gorm:"type:enum('male', 'female')" valid:"required~Gender is required, in(male,female)~Gender must be either 'male' or 'female'"`
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

