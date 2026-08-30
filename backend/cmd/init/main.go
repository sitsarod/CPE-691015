package main

import (
	"fmt"
	"log"
	"os"

	"CPE-691015/internal/models" // เปลี่ยน "backend" เป็นชื่อโมดูลใน go.mod ของเธอนะยะ!
	"CPE-691015/internal/services"

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
	// 2. clear database and auto migrate models
	db.Exec("DROP SCHEMA public CASCADE;")
    db.Exec("CREATE SCHEMA public;")
	// สั่ง Auto Migrate โดยดึงโมเดลมาจาก package models
	err = db.AutoMigrate(
		&models.User{},
		&models.Coach{},
		&models.Product{}, // อย่าลืมสร้างไฟล์ product.go ใน internal/models/
		&models.Customer{},
		&models.Photo{},
		&models.Evaluation{},
		&models.Review{},
		&models.DetectedVideo{},
		&models.RawVideo{},
		&models.DetectedPhoto{},
		&models.RawPhoto{},
		&models.Course{},
		&models.Package{},
		&models.PackageSchedule{},
		&models.Enrollment{},
		&models.EnrollmentExtension{},
		&models.AttendanceSession{},
		&models.StudentAttendance{},
		&models.CoachAttendance{},
		&models.Billing{},
		&models.BillingType{},
		&models.Invoice{},
		&models.PaymentItem{},
		&models.Announcement{},
		&models.Category{},
		&models.HomeContent{},
		&models.HeroSlide{},
		&models.BankAccount{},
		&models.Expense{},
		&models.ChatSession{},
		&models.AutoQA{},
		&models.WorkSchedule{},
		&models.CoachAvailability{},
		&models.BiometricConsent{},
		&models.PasswordResetOTP{},
		&models.Court{},
		&models.Notification{},
	)
	if err != nil {
		log.Fatalf("การทำ Auto Migration ล้มเหลว: %v", err)
	}

	// === SEEDING DEFAULT DATA ===
	// index แบบมีเงื่อนไขที่ GORM ประกาศผ่านแท็กไม่ได้ ต้องสร้างก่อน seed
	// ไม่งั้นข้อมูลตัวอย่างที่ยังไม่มีรหัสประจำตัวจะชนกันเอง
	if err := services.EnsureMemberCodeIndexes(db); err != nil {
		log.Fatalf("สร้าง index ของรหัสประจำตัวไม่สำเร็จ: %v", err)
	}

	seedBillingTypes(db)
	seedAdmins(db)
	seedCoaches(db)
	seedCustomers(db)
	seedCoursesAndPackages(db)
	seedBankAccounts(db)
	seedHomeContent(db)
	seedOperationalData(db) // คาบสอน + การเงิน (ต้องรันหลังคอร์ส/ลูกค้า/โค้ช)
}


