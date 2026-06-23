package models

import (
	"gorm.io/gorm"
)

type DetectedVideo struct {
	gorm.Model
	CustomerID 		uint   			`json:"customerId"`
	Customer   		*Customer  		`json:"customer" gorm:"foreignKey:CustomerID"`

	RawVideoID 		uint   			`json:"rawVideoId"` 
	RawVideo   		*RawVideo  		`json:"rawVideo" gorm:"foreignKey:RawVideoID"`

	VideoURL   		string 			`json:"videoUrl"` 

	

}