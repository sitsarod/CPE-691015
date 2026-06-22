package main

import (
	"fmt"
	"log"
	"os"

	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func main() {
	// โหลด .env
	_ = godotenv.Load("../../.env")
	dsn := os.Getenv("DATABASE_URL")

	// เชื่อมต่อ DB เพื่อส่งต่อให้ Repository/Service ไปใช้งานต่อ
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatalf("เปิดเซิร์ฟเวอร์ไม่สำเร็จเพราะเชื่อมต่อ DB ไม่ได้: %v", err)
	}

	fmt.Println("ฐานข้อมูลพร้อมใช้งาน... กำลังสตาร์ทเซิร์ฟเวอร์หลัก (serve)")
	
	// ตรงนี้ค่อยเอาตัวแปร `db` ไปผูกเข้ากับ Repository และ Service
	// ตัวอย่าง: repo := repositories.NewRepository(db)
	// และเขียนโค้ดเปิด Port รันเซิร์ฟเวอร์เลย
}