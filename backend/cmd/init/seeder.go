package main

import (
	"fmt"
	"log"
	"time"

	"CPE-691015/internal/models"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

func seedBillingTypes(db *gorm.DB) {
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
}

func seedAdmins(db *gorm.DB) {
	hashedPassword, _ := bcrypt.GenerateFromPassword([]byte("password123"), bcrypt.DefaultCost)
	admins := []models.User{
		{
			FirstName: "สมชาย",
			LastName:  "แอดมินดีดี",
			Email:     "admin1@example.com",
			Password:  string(hashedPassword),
			Role:      models.AdminRole,
		},
		{
			FirstName: "สมหญิง",
			LastName:  "แอดมินเก่ง",
			Email:     "admin2@example.com",
			Password:  string(hashedPassword),
			Role:      models.AdminRole,
		},
		{
			FirstName: "ณรงค์",
			LastName:  "แอดมินหลัก",
			Email:     "admin3@example.com",
			Password:  string(hashedPassword),
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
	hashedPassword, _ := bcrypt.GenerateFromPassword([]byte("password123"), bcrypt.DefaultCost)

	coachData := []struct {
		FirstName      string
		LastName       string
		Email          string
		Nickname       string
		Phone          string
		Uid            string
		Address        string
		BirthDate      string
		ProfilePicture string
		Specialization string
		BankAccount    string
		PaymentInfo    string
	}{
		{
			FirstName:      "ธีรศิลป์",
			LastName:       "โค้ชเก่ง",
			Email:          "coach1@example.com",
			Nickname:       "โค้ชบอล",
			Phone:          "0812345678",
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
			Email:          "coach2@example.com",
			Nickname:       "โค้ชเจ",
			Phone:          "0823456789",
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
			Email:          "coach3@example.com",
			Nickname:       "โค้ชตัง",
			Phone:          "0834567890",
			Uid:            "C003",
			Address:        "789/12 ถ.พหลโยธิน กรุงเทพฯ",
			BirthDate:      "1992-05-30",
			ProfilePicture: "https://example.com/profiles/coach3.png",
			Specialization: "การจัดตำแหน่งและการตั้งรับ",
			BankAccount:    "ธ.กรุงเทพ 111-2-22222-3",
			PaymentInfo:    "PromptPay: 0834567890",
		},
	}

	for _, data := range coachData {
		var existingUser models.User
		if err := db.Where("email = ?", data.Email).First(&existingUser).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				err := db.Transaction(func(tx *gorm.DB) error {
					user := models.User{
						FirstName: data.FirstName,
						LastName:  data.LastName,
						Email:     data.Email,
						Password:  string(hashedPassword),
						Role:      models.CoachRole,
					}
					if err := tx.Create(&user).Error; err != nil {
						return err
					}

					coach := models.Coach{
						UserID:         user.ID,
						Nickname:       data.Nickname,
						Phone:          data.Phone,
						Uid:            data.Uid,
						Address:        data.Address,
						BirthDate:      data.BirthDate,
						ProfilePicture: data.ProfilePicture,
						Specialization: data.Specialization,
						BankAccount:    data.BankAccount,
						PaymentInfo:    data.PaymentInfo,
					}
					return tx.Create(&coach).Error
				})

				if err != nil {
					log.Printf("ไม่สามารถสร้าง Coach %s ได้: %v", data.Email, err)
				} else {
					fmt.Printf("Seed Coach %s สำเร็จเรียบร้อย!\n", data.Email)
				}
			} else {
				log.Printf("เกิดข้อผิดพลาดในการตรวจสอบ Coach %s: %v", data.Email, err)
			}
		} else {
			fmt.Printf("ข้ามขั้นตอนการ Seed Coach %s เนื่องจากมีข้อมูลอยู่แล้ว\n", data.Email)
		}
	}
}

func seedCustomers(db *gorm.DB) {
	hashedPassword, _ := bcrypt.GenerateFromPassword([]byte("password123"), bcrypt.DefaultCost)

	customerData := []struct {
		FirstName         string
		LastName          string
		Email             string
		Password          string
		Nickname          string
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
			Password:          string(hashedPassword),
			Nickname:          "ศักดิ์",
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
			Password:          string(hashedPassword),
			Nickname:          "ดา",
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
			Password:          string(hashedPassword),
			Nickname:          "นะ",
			PhoneNumber:       "0867890123",
			BirthDate:         time.Date(2011, 11, 11, 0, 0, 0, 0, time.UTC),
			ParentEmail:       "parent3@example.com",
			ParentPhoneNumber: "0896543210",
			ConsentedPurposes: true,
			PersonalQRCode:    "QR_STUDENT_003",
		},
	}

	for _, data := range customerData {
		var user models.User
		if err := db.Where("email = ?", data.Email).First(&user).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				err := db.Transaction(func(tx *gorm.DB) error {
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

					customer := models.Customer{
						UserID:            user.ID,
						Nickname:          data.Nickname,
						BirthDate:         data.BirthDate,
						PhoneNumber:       data.PhoneNumber,
						ParentEmail:       data.ParentEmail,
						ParentPhoneNumber: data.ParentPhoneNumber,
						ConsentedPurposes: data.ConsentedPurposes,
						PersonalQRCode:    data.PersonalQRCode,
						Status:            models.CustomerStatusActive,
					}
					return tx.Create(&customer).Error
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

func seedCoursesAndPackages(db *gorm.DB) {
	var admin models.User
	if err := db.Where("role = ?", models.AdminRole).First(&admin).Error; err != nil {
		log.Printf("ไม่สามารถค้นหาแอดมินหลักได้เพื่อสร้างคอร์ส: %v", err)
		return
	}

	courseSeeds := []struct {
		CourseName    string
		Description   string
		Status        models.CourseStatus
		SessionsCount uint
		HoursCount    uint
		Price         float64
		Schedules     []models.PackageSchedule
	}{
		{
			CourseName:    "คอร์สฟุตบอลระดับพื้นฐาน (Basic Football)",
			Description:   "ฝึกทักษะการเลี้ยงบอล ส่งบอล และโหม่งบอลขั้นพื้นฐานสำหรับผู้เริ่มต้น",
			Status:        models.CourseStatusActive,
			SessionsCount: 10,
			HoursCount:    15,
			Price:         3500.00,
			Schedules: []models.PackageSchedule{
				{DayOfWeek: models.Monday, StartTime: "17:00", EndTime: "18:30"},
				{DayOfWeek: models.Wednesday, StartTime: "17:00", EndTime: "18:30"},
			},
		},
		{
			CourseName:    "คอร์สผู้รักษาประตู (Goalkeeper Pro)",
			Description:   "ฝึกทักษะเฉพาะด้านผู้รักษาประตู การรับลูก การเซฟ และการขว้างบอลเปิดเกม",
			Status:        models.CourseStatusActive,
			SessionsCount: 8,
			HoursCount:    12,
			Price:         4000.00,
			Schedules: []models.PackageSchedule{
				{DayOfWeek: models.Saturday, StartTime: "09:00", EndTime: "10:30"},
				{DayOfWeek: models.Sunday, StartTime: "09:00", EndTime: "10:30"},
			},
		},
		{
			CourseName:    "คอร์สทีมเวิร์คและแทคติกการเล่น (Team Tactics)",
			Description:   "ฝึกทักษะการจัดตำแหน่ง การส่งบอลแบบทะลุช่อง และการเล่นสอดประสานในเกมการแข่งจริง",
			Status:        models.CourseStatusActive,
			SessionsCount: 12,
			HoursCount:    24,
			Price:         5000.00,
			Schedules: []models.PackageSchedule{
				{DayOfWeek: models.Tuesday, StartTime: "18:00", EndTime: "20:00"},
				{DayOfWeek: models.Thursday, StartTime: "18:00", EndTime: "20:00"},
			},
		},
	}

	for _, seed := range courseSeeds {
		var course models.Course
		err := db.Where("course_name = ?", seed.CourseName).First(&course).Error
		if err != nil {
			if err == gorm.ErrRecordNotFound {
				course = models.Course{
					CourseName:  seed.CourseName,
					Description: seed.Description,
					Status:      seed.Status,
					UserID:      admin.ID,
				}
				if err := db.Create(&course).Error; err != nil {
					log.Printf("ไม่สามารถสร้างคอร์ส %s ได้: %v", seed.CourseName, err)
					continue
				}
				fmt.Printf("Seed คอร์ส %s สำเร็จเรียบร้อย!\n", seed.CourseName)
			} else {
				log.Printf("เกิดข้อผิดพลาดในการตรวจสอบคอร์ส %s: %v", seed.CourseName, err)
				continue
			}
		} else {
			fmt.Printf("ข้ามขั้นตอนการ Seed คอร์ส %s เนื่องจากมีข้อมูลอยู่แล้ว\n", seed.CourseName)
		}

		var pkg models.Package
		err = db.Where("course_id = ? AND price = ?", course.ID, seed.Price).First(&pkg).Error
		if err != nil {
			if err == gorm.ErrRecordNotFound {
				pkg = models.Package{
					SessionsCount: seed.SessionsCount,
					HoursCount:    seed.HoursCount,
					Price:         seed.Price,
					CourseID:      course.ID,
				}
				if err := db.Create(&pkg).Error; err != nil {
					log.Printf("ไม่สามารถสร้าง Package สำหรับคอร์ส %s ได้: %v", course.CourseName, err)
					continue 
				}
				fmt.Printf("Seed Package ราคา %.2f สำหรับคอร์ส %s สำเร็จเรียบร้อย!\n", seed.Price, course.CourseName)

				for _, sch := range seed.Schedules {
					sch.PackageID = pkg.ID 
					if err := db.Create(&sch).Error; err != nil {
						log.Printf("ไม่สามารถสร้างตารางเรียนให้แพ็กเกจได้: %v", err)
					}
				}
			} else {
				log.Printf("เกิดข้อผิดพลาดในการตรวจสอบ Package สำหรับคอร์ส %s: %v", course.CourseName, err)
			}
		} else {
			fmt.Printf("ข้ามขั้นตอนการ Seed Package สำหรับคอร์ส %s เนื่องจากมีข้อมูลอยู่แล้ว\n", course.CourseName)
		}
	}
}

func seedBankAccounts(db *gorm.DB) {
	accounts := []models.BankAccount{
		{
			BankName:    "ธนาคารกรุงไทย (KTB)",
			AccountNo:   "6629946995",
			AccountName: "นายสิษฐ์สโรจ  กันทรสุรพล",
			IsActive:    true,
		},
		{
			BankName:    "ธนาคารกรุงไทย (KTB)",
			AccountNo:   "3350495907",
			AccountName: "นายธีรศักดิ์  กุลเกตุ",
			IsActive:    false,
		},
	}

	for _, acc := range accounts {
		var existing models.BankAccount
		if err := db.Where("account_no = ?", acc.AccountNo).First(&existing).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				if err := db.Create(&acc).Error; err != nil {
					log.Printf("ไม่สามารถสร้างบัญชีธนาคาร %s ได้: %v", acc.BankName, err)
				} else {
					fmt.Printf("Seed บัญชีธนาคาร %s สำเร็จเรียบร้อย!\n", acc.BankName)
				}
			} else {
				log.Printf("เกิดข้อผิดพลาดในการตรวจสอบบัญชีธนาคาร %s: %v", acc.BankName, err)
			}
		} else {
			fmt.Printf("ข้ามขั้นตอนการ Seed บัญชีธนาคาร %s เนื่องจากมีข้อมูลอยู่แล้ว\n", acc.BankName)
		}
	}
}