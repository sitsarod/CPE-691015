package models

import (
	"gorm.io/gorm"

)

type Photo struct {

	gorm.Model
	CustomerID    	uint      	`json:"customer_id"`
	Customer   		*Customer  	`json:"customer" `

	CoachID    		uint      	`json:"coach_id" valid:"required~CoachID is required"`
	Coach   		*Coach  	`json:"coach"`

	PhotoURL  		string    	`json:"photoUrl" valid:"required~Photo URL is required,url~Invalid photo URL format"` // URL รูปต้นฉบับ 

	// เก็บค่า Face Embedding (ตัวเลขทศนิยมที่ AI แปลงออกมาจากใบหน้า)
	// สมมติว่าใช้โมเดลที่ให้ค่าออกมา 128 มิติ
	FaceEmbedding 	[]float64 	`json:"-" gorm:"type:float8[]"` 
	
	IsVerified 		bool      	`json:"isVerified" gorm:"default:false"` // เช็กว่ารูปนี้ผ่านการตรวจสอบใบหน้าหรือยัง
	
	

}