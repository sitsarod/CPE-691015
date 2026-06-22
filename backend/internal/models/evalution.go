package models

import (
	"gorm.io/gorm"
)

type Evaluation struct {
	gorm.Model
	CustomerID uint   `json:"customerId"` 
	CoachID    uint   `json:"coachId"`    
	Assessment string `json:"assessment"` 
	Score      int    `json:"score"`      
}