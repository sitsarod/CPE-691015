package main

import (
	"fmt"
	"log"
	"os"

	"CPE-691015/internal/models"
	"CPE-691015/internal/services"

	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// migrate: อัปเดตสคีมาแบบ "ไม่ลบข้อมูล" ด้วย GORM AutoMigrate
// (เพิ่มคอลัมน์/ตารางที่ขาดเท่านั้น ไม่ DROP อะไรทั้งสิ้น)
// ใช้เมื่อเพิ่มฟิลด์ใหม่ในโมเดลแล้วอยากให้คอลัมน์ขึ้นในฐานเดิมโดยไม่ต้องรีเซ็ต
//
// วิธีรัน:  cd backend/cmd/migrate  แล้ว  go run .
func main() {
	if err := godotenv.Load("../../../.env"); err != nil {
		log.Println("คำเตือน: ไม่พบไฟล์ .env จะใช้ Environment Variable ของเครื่องแทน")
	}

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("กรุณาตั้งค่า DATABASE_URL ในไฟล์ .env ด้วยซะล่ะ!")
	}

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatalf("เชื่อมต่อฐานข้อมูลไม่สำเร็จ: %v", err)
	}
	fmt.Println("เชื่อมต่อสำเร็จแล้ว! กำลังอัปเดตสคีมา (ไม่ลบข้อมูล)...")

	// AutoMigrate ทุกโมเดล (รายการเดียวกับ cmd/init แต่ไม่ DROP SCHEMA)
	// เพิ่มคอลัมน์/ตารางที่ขาดให้อัตโนมัติทุกครั้งที่เพิ่มฟิลด์ใหม่ในโมเดล
	if err := db.AutoMigrate(
		&models.User{},
		&models.Coach{},
		&models.Product{},
		&models.Customer{},
		&models.Photo{},
		&models.Evaluation{},
		&models.Review{},
		&models.DetectedVideo{},
		&models.RawVideo{},
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
	); err != nil {
		log.Fatalf("AutoMigrate ไม่สำเร็จ: %v", err)
	}

	// index แบบมีเงื่อนไขที่ GORM ประกาศผ่านแท็กไม่ได้ (ดู services.EnsureMemberCodeIndexes)
	if err := services.EnsureMemberCodeIndexes(db); err != nil {
		log.Fatalf("สร้าง index ของรหัสประจำตัวไม่สำเร็จ: %v", err)
	}

	fmt.Println("อัปเดตสคีมาเรียบร้อย — เพิ่มคอลัมน์/ตารางที่ขาดของทุกโมเดลแล้ว (ข้อมูลเดิมอยู่ครบ)")
}
