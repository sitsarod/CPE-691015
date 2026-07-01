package main

import (
	"fmt"
	"log"
	"os"
	"time"

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
	// 2. clear database and auto migrate models
	//db.Exec("DROP SCHEMA public CASCADE;")
    //db.Exec("CREATE SCHEMA public;")
	// สั่ง Auto Migrate โดยดึงโมเดลมาจาก package models
	err = db.AutoMigrate(
		&models.User{},
		&models.Product{}, // อย่าลืมสร้างไฟล์ product.go ใน internal/models/
		&models.Customer{},
		&models.Photo{},
		&models.Evaluation{},
		&models.Feedback{},
		&models.DetectedVideo{},
		&models.RawVideo{},
		&models.Course{},
		&models.Package{},
		&models.Enrollment{},
		&models.WeeklySchedule{},
		&models.StudentAttendance{},
		&models.CoachAttendance{},
		&models.Billing{},
		&models.BillingType{},
		&models.Invoice{},
		&models.PaymentItem{},
		&models.Announcement{},
		&models.Category{},
	)
	if err != nil {
		log.Fatalf("การทำ Auto Migration ล้มเหลว: %v", err)
	}

	// === SEEDING DEFAULT BILLING TYPES ===
	var count int64
	if err := db.Model(&models.BillingType{}).Count(&count).Error; err != nil {
		log.Printf("ไม่สามารถเช็คจำนวนข้อมูล BillingType ได้: %v", err)
	} else if count == 0 {
		defaultTypes := []models.BillingType{
			{BillingTypeName: "ค่าคอร์สเรียน"},
			{BillingTypeName: "ค่าเช่าสนาม"},
			{BillingTypeName: "ค่าอุปกรณ์"},
			{BillingTypeName: "ค่าสมาชิก"},
			{BillingTypeName: "อื่นๆ"},
		}
		if err := db.Create(&defaultTypes).Error; err != nil {
			log.Fatalf("การทำ Seed BillingType ล้มเหลว: %v", err)
		}
		fmt.Println("Seed BillingType สำเร็จเรียบร้อย!")
	} else {
		fmt.Println("ข้ามขั้นตอนการ Seed BillingType เนื่องจากมีข้อมูลอยู่แล้ว")
	}

	// === SEEDING DEFAULT USERS, COACHES, CUSTOMERS ===
	seedAdmins(db)
	seedCoaches(db)
	seedCustomers(db)
}

func seedAdmins(db *gorm.DB) {
	admins := []models.User{
		{
			FirstName: "สมชาย",
			LastName:  "แอดมินดีดี",
			Email:     "admin1@example.com",
			Password:  "password123",
			Role:      models.AdminRole,
		},
		{
			FirstName: "สมหญิง",
			LastName:  "แอดมินเก่ง",
			Email:     "admin2@example.com",
			Password:  "password123",
			Role:      models.AdminRole,
		},
		{
			FirstName: "ณรงค์",
			LastName:  "แอดมินหลัก",
			Email:     "admin3@example.com",
			Password:  "password123",
			Role:      models.AdminRole,
		},
	}

	for _, admin := range admins {
		var existing models.User
		if err := db.Where("email = ?", admin.Email).First(&existing).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				if err := db.Create(&admin).Error; err != nil {
					log.Printf("ไม่สามารถสร้าง Admin %s ได้: %v", admin.Email, err)
				} else {
					fmt.Printf("Seed Admin %s สำเร็จเรียบร้อย!\n", admin.Email)
				}
			} else {
				log.Printf("เกิดข้อผิดพลาดในการตรวจสอบ Admin %s: %v", admin.Email, err)
			}
		} else {
			fmt.Printf("ข้ามขั้นตอนการ Seed Admin %s เนื่องจากมีข้อมูลอยู่แล้ว\n", admin.Email)
		}
	}
}

func seedCoaches(db *gorm.DB) {
	coaches := []models.Coach{
		{
			FirstName:      "ธีรศิลป์",
			LastName:       "โค้ชเก่ง",
			Nickname:       "โค้ชบอล",
			Email:          "coach1@example.com",
			Phone:          "0812345678",
			Password:       "password123",
			Uid:            "C001",
			Address:        "123/45 ถ.สุขุมวิท กรุงเทพฯ",
			BirthDate:      "1988-06-10",
			ProfilePicture: "https://example.com/profiles/coach1.png",
			Specialization: "เทคนิคการเตะและการเลี้ยงบอล",
			BankAccount:    "ธ.กสิกรไทย 123-4-56789-0",
			PaymentInfo:    "PromptPay: 0812345678",
		},
		{
			FirstName:      "ชนาธิป",
			LastName:       "โค้ชไว",
			Nickname:       "โค้ชเจ",
			Email:          "coach2@example.com",
			Phone:          "0823456789",
			Password:       "password123",
			Uid:            "C002",
			Address:        "456/78 ถ.เพชรบุรี กรุงเทพฯ",
			BirthDate:      "1993-10-05",
			ProfilePicture: "https://example.com/profiles/coach2.png",
			Specialization: "ความคล่องตัวและการจ่ายบอล",
			BankAccount:    "ธ.ไทยพาณิชย์ 987-6-54321-0",
			PaymentInfo:    "PromptPay: 0823456789",
		},
		{
			FirstName:      "สารัช",
			LastName:       "โค้ชแกร่ง",
			Nickname:       "โค้ชตัง",
			Email:          "coach3@example.com",
			Phone:          "0834567890",
			Password:       "password123",
			Uid:            "C003",
			Address:        "789/12 ถ.พหลโยธิน กรุงเทพฯ",
			BirthDate:      "1992-05-30",
			ProfilePicture: "https://example.com/profiles/coach3.png",
			Specialization: "การจัดตำแหน่งและการตั้งรับ",
			BankAccount:    "ธ.กรุงเทพ 111-2-22222-3",
			PaymentInfo:    "PromptPay: 0834567890",
		},
	}

	for _, coach := range coaches {
		var existingCoach models.Coach
		if err := db.Where("email = ?", coach.Email).First(&existingCoach).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				err := db.Transaction(func(tx *gorm.DB) error {
					if err := tx.Create(&coach).Error; err != nil {
						return err
					}
					// Create corresponding User record
					user := models.User{
						FirstName: coach.FirstName,
						LastName:  coach.LastName,
						Email:     coach.Email,
						Password:  coach.Password,
						Role:      models.CoachRole,
					}
					var existingUser models.User
					if err := tx.Where("email = ?", coach.Email).First(&existingUser).Error; err != nil {
						if err := tx.Create(&user).Error; err != nil {
							return err
						}
					}
					return nil
				})
				if err != nil {
					log.Printf("ไม่สามารถสร้าง Coach %s ได้: %v", coach.Email, err)
				} else {
					fmt.Printf("Seed Coach %s สำเร็จเรียบร้อย!\n", coach.Email)
				}
			} else {
				log.Printf("เกิดข้อผิดพลาดในการตรวจสอบ Coach %s: %v", coach.Email, err)
			}
		} else {
			fmt.Printf("ข้ามขั้นตอนการ Seed Coach %s เนื่องจากมีข้อมูลอยู่แล้ว\n", coach.Email)
		}
	}
}

func seedCustomers(db *gorm.DB) {
	customerData := []struct {
		FirstName         string
		LastName          string
		Email             string
		Password          string
		PhoneNumber       string
		BirthDate         time.Time
		ParentEmail       string
		ParentPhoneNumber string
		ConsentedPurposes bool
		PersonalQRCode    string
	}{
		{
			FirstName:         "สมศักดิ์",
			LastName:          "รักเรียน",
			Email:             "student1@example.com",
			Password:          "password123",
			PhoneNumber:       "0845678901",
			BirthDate:         time.Date(2010, 1, 15, 0, 0, 0, 0, time.UTC),
			ParentEmail:       "parent1@example.com",
			ParentPhoneNumber: "0898765432",
			ConsentedPurposes: true,
			PersonalQRCode:    "QR_STUDENT_001",
		},
		{
			FirstName:         "สุดา",
			LastName:          "ใจเรียน",
			Email:             "student2@example.com",
			Password:          "password123",
			PhoneNumber:       "0856789012",
			BirthDate:         time.Date(2012, 5, 20, 0, 0, 0, 0, time.UTC),
			ParentEmail:       "parent2@example.com",
			ParentPhoneNumber: "0897654321",
			ConsentedPurposes: true,
			PersonalQRCode:    "QR_STUDENT_002",
		},
		{
			FirstName:         "มานะ",
			LastName:          "พากเพียร",
			Email:             "student3@example.com",
			Password:          "password123",
			PhoneNumber:       "0867890123",
			BirthDate:         time.Date(2011, 11, 11, 0, 0, 0, 0, time.UTC),
			ParentEmail:       "parent3@example.com",
			ParentPhoneNumber: "0896543210",
			ConsentedPurposes: true,
			PersonalQRCode:    "QR_STUDENT_003",
		},
	}

	for _, data := range customerData {
		var existingCustomer models.Customer
		if err := db.Where("email = ?", data.Email).First(&existingCustomer).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				err := db.Transaction(func(tx *gorm.DB) error {
					// 1. Create/Find User
					var user models.User
					if err := tx.Where("email = ?", data.Email).First(&user).Error; err != nil {
						if err == gorm.ErrRecordNotFound {
							user = models.User{
								FirstName: data.FirstName,
								LastName:  data.LastName,
								Email:     data.Email,
								Password:  data.Password,
								Role:      models.CustomerRole,
							}
							if err := tx.Create(&user).Error; err != nil {
								return err
							}
						} else {
							return err
						}
					}

					// 2. Create Customer linking to User.ID
					customer := models.Customer{
						UserID:            user.ID,
						FirstName:         data.FirstName,
						LastName:          data.LastName,
						BirthDate:         data.BirthDate,
						Email:             data.Email,
						Password:          data.Password,
						PhoneNumber:       data.PhoneNumber,
						ParentEmail:       data.ParentEmail,
						ParentPhoneNumber: data.ParentPhoneNumber,
						ConsentedPurposes: data.ConsentedPurposes,
						PersonalQRCode:    data.PersonalQRCode,
						Status:            models.CustomerStatusActive,
					}
					if err := tx.Create(&customer).Error; err != nil {
						return err
					}
					return nil
				})
				if err != nil {
					log.Printf("ไม่สามารถสร้าง Customer %s ได้: %v", data.Email, err)
				} else {
					fmt.Printf("Seed Customer %s สำเร็จเรียบร้อย!\n", data.Email)
				}
			} else {
				log.Printf("เกิดข้อผิดพลาดในการตรวจสอบ Customer %s: %v", data.Email, err)
			}
		} else {
			fmt.Printf("ข้ามขั้นตอนการ Seed Customer %s เนื่องจากมีข้อมูลอยู่แล้ว\n", data.Email)
		}
	}
}

