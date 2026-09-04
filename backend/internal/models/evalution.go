package models

import (
	"gorm.io/gorm"
)

type Evaluation struct {
	gorm.Model
	CustomerID 		uint   			`json:"customer_id" valid:"required~UserID is required"` 
	Customer   		*Customer  		`json:"customer" `

	CoachID    		uint   			`json:"coach_id"` 
	Coach      		*Coach     		`json:"coach"    gorm:"foreignKey:CoachID"`
	   
	Assessment 		string 			`json:"assessment"`
	VideoURL        string          `json:"video_url"`
}