package models

import (
	"gorm.io/gorm"

)

type CustomerPhoto struct {
	gorm.Model
	CustomerID    	uint      	`json:"customerId"`
	Customer   		*Customer  	`json:"customer" gorm:"foreignKey:CustomerID"`

	PhotoURL  		string    	`json:"photoUrl"` // URL รูปต้นฉบับ 
	
	

}