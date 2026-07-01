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

	UserID    		uint             `json:"user_id" valid:"required~UserID is required"`
	User      		*User            `json:"user" `
	
	CustomerID    	uint             `json:"customer_id"`
	Customer   		*Customer  		 `json:"customer" `

	Content   		string           `json:"content" valid:"required~Content is required,length(10|1000)~Content must be between 10 and 1000 characters"`
	
	Category  		FeedbackCategory `json:"category" gorm:"type:string" valid:"required~Category is required,oneof(place coach course service other)~Invalid category value"` 
	Status    		FeedbackStatus   `json:"status" gorm:"type:string;default:'UNREAD'"` 


	

}