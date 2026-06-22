package main

import (
	"fmt"
	"log"
	"os"

	"CPE-691015/internal/models" // เปลี่ยน "backend" เป็นชื่อโมดูลใน go.mod ของเธอนะยะ!

	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func main() {
	// โหลดไฟล์ .env มาใช้งาน
	err := godotenv.Load("../../../.env")
	if err != nil {
		log.Println("คำเตือน: ไม่พบไฟล์ .env จะใช้ระบบ Environment Variable ของเครื่องแทน")
	}

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("กรุณาตั้งค่า DATABASE_URL ในไฟล์ .env ด้วยซะล่ะ!")
	}

	// เชื่อมต่อฐานข้อมูล
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatalf("เชื่อมต่อฐานข้อมูลไม่สำเร็จ: %v", err)
	}
	fmt.Println("เชื่อมต่อสำเร็จแล้ว!")

	// สั่ง Auto Migrate โดยดึงโมเดลมาจาก package models
	err = db.AutoMigrate(
		&models.User{},
		&models.Product{}, // อย่าลืมสร้างไฟล์ product.go ใน internal/models/
		&models.Customer{},
		&models.CustomerPhoto{},
		&models.Evaluation{},
		&models.Feedback{},
		&models.DetectedVideo{},
		&models.RawVideo{},
		
	)
	if err != nil {
		log.Fatalf("การทำ Auto Migration ล้มเหลวซะงั้น!: %v", err)
	}
}
