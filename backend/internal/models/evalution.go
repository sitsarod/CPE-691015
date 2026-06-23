package models

import (
	"gorm.io/gorm"
)

type Evaluation struct {
	gorm.Model
	CustomerID 		uint   			`json:"customerId"` 
	Customer   		*Customer  		`json:"customer" gorm:"foreignKey:CustomerID"`

	CoachID    		uint   			`json:"coachId"` 
	Coach      		*Coach     		`json:"coach"    gorm:"foreignKey:CoachID"`
	   
	Assessment 		string 			`json:"assessment"` 
	Score      		int    			`json:"score"`   
	

	
}