package models

import (
	"gorm.io/gorm"
	
)

type FeedbackCategory string

const (
	CategoryPlace  	FeedbackCategory = "place"  
	CategoryCoach 	FeedbackCategory = "coach" 
	CategoryCourse 	FeedbackCategory = "course" 
	CategoryService FeedbackCategory = "service"
	CategoryOther 	FeedbackCategory = "other"
)


type FeedbackStatus string

const (
	StatusUnread     FeedbackStatus = "UNREAD"      
	StatusRead       FeedbackStatus = "READ"        
	StatusInProgress FeedbackStatus = "IN_PROGRESS" // กำลังแก้ไข 
	StatusResolved   FeedbackStatus = "RESOLVED"	// แก้ไขเรียบร้อยแล้ว
)


type Feedback struct {
	gorm.Model

	UserID    		uint             `json:"userId"`
	User      		*User            `json:"user" gorm:"foreignKey:UserID"`
	
	CustomerID    	uint             `json:"customerId"`
	Customer   		*Customer  		 `json:"customer" gorm:"foreignKey:CustomerID"`

	Content   		string           `json:"content"`
	
	Category  		FeedbackCategory `json:"category" gorm:"type:string"` 
	Status    		FeedbackStatus   `json:"status" gorm:"type:string;default:'UNREAD'"` 


	

}