package models

import (
	"gorm.io/gorm"
)

type Evaluation struct {
	gorm.Model
	CustomerID 		uint   			`json:"customer_id" valid:"required~UserID is required"` 
	Customer   		*Customer  		`json:"customer" gorm:"foreignKey:CustomerID"`

	CoachID    		uint   			`json:"coach_id"` 
	Coach      		*Coach     		`json:"coach"    gorm:"foreignKey:CoachID"`
	   
	Assessment 		string 			`json:"assessment"` 
	Score      		int    			`json:"score"`   
	
	
}