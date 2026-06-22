package models

import (
	"gorm.io/gorm"

)

type CustomerPhoto struct {
	gorm.Model
	CustomerID    	uint      	`json:"customerId"`
	PhotoURL  		string    	`json:"photoUrl"` // URL รูปต้นฉบับ (เก็บเป็นความลับ)
	
	// เก็บค่า Face Embedding (ตัวเลขทศนิยมที่ AI แปลงออกมาจากใบหน้า)
	// สมมติว่าใช้โมเดลที่ให้ค่าออกมา 128 มิติ
	FaceEmbedding 	[]float64 	`json:"-" gorm:"type:float8[]"` 
	
	IsVerified 		bool      	`json:"isVerified" gorm:"default:false"` // เช็กว่ารูปนี้ผ่านการตรวจสอบใบหน้าหรือยัง

}