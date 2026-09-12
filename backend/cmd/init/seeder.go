package main

import (
	"fmt"
	"log"
	"time"

	"CPE-691015/internal/models"
	"CPE-691015/internal/services"
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
			Email:     "admin1@gmail.com",
			Password:  string(hashedPassword),
			Role:      models.AdminRole,
		},
		{
			FirstName: "สมหญิง",
			LastName:  "แอดมินเก่ง",
			Email:     "admin2@gmail.com",
			Password:  string(hashedPassword),
			Role:      models.AdminRole,
		},
		{
			FirstName: "ณรงค์",
			LastName:  "แอดมินหลัก",
			Email:     "admin3@gmail.com",
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

// coachAvail = ช่วงเวลาว่างของโค้ชสำหรับ seed (วัน + เวลาเริ่ม-จบ)
type coachAvail struct {
	Day   models.DayOfWeek
	Start string
	End   string
}

func seedCoaches(db *gorm.DB) {
	hashedPassword, _ := bcrypt.GenerateFromPassword([]byte("password123"), bcrypt.DefaultCost)

	coachData := []struct {
		FirstName      string
		LastName       string
		Email          string
		Nickname       string
		Phone          string
		LineID         string
		Facebook       string
		Uid            string
		Address        string
		BirthDate      string
		ProfilePicture string
		Specialization string
		CoachLicense   string
		BankAccount    string  // ชื่อธนาคาร (ตรงกับ BANK_OPTIONS ฝั่ง frontend)
		PaymentInfo    string  // เลขบัญชี (ตัวเลขล้วน)
		PromptPay      string  // พร้อมเพย์ (เบอร์มือถือ/เลขบัตร) — ไม่บังคับ
		PaymentType    string  // per_session หรือ monthly
		PayRate        float64 // บาท/ครั้ง หรือ บาท/เดือน ตาม PaymentType
		Availabilities []coachAvail
	}{
		{
			FirstName:      "ธีรศิลป์",
			LastName:       "โค้ชเก่ง",
			Email:          "coach1@gmail.com",
			Nickname:       "โค้ชบอล",
			Phone:          "0812345678",
			LineID:         "coachball_th",
			Facebook:       "https://facebook.com/coachball.th",
			Uid:            "C001",
			Address:        "123/45 ถ.สุขุมวิท กรุงเทพฯ",
			BirthDate:      "1988-06-10",
			ProfilePicture: "https://example.com/profiles/coach1.png",
			Specialization: "S",
			CoachLicense:   "License A",
			BankAccount:    "ธนาคารกสิกรไทย",
			PaymentInfo:    "1234567890",
			PromptPay:      "0812345678",
			PaymentType:    "per_session",
			PayRate:        400,
			Availabilities: []coachAvail{
				{models.Monday, "17:00", "21:00"},
				{models.Wednesday, "17:00", "21:00"},
				{models.Friday, "17:00", "21:00"},
				{models.Saturday, "09:00", "12:00"},
				{models.Sunday, "09:00", "12:00"},
			},
		},
		{
			FirstName:      "ชนาธิป",
			LastName:       "โค้ชไว",
			Email:          "coach2@gmail.com",
			Nickname:       "โค้ชเจ",
			Phone:          "0823456789",
			LineID:         "coach_jay",
			Facebook:       "", // เว้นว่างไว้ทดสอบเคสไม่กรอก (ฟิลด์นี้ไม่บังคับ)
			Uid:            "C002",
			Address:        "456/78 ถ.เพชรบุรี กรุงเทพฯ",
			BirthDate:      "1993-10-05",
			ProfilePicture: "https://example.com/profiles/coach2.png",
			Specialization: "S",
			CoachLicense:   "License B",
			BankAccount:    "ธนาคารไทยพาณิชย์",
			PaymentInfo:    "9876543210",
			PromptPay:      "0823456789",
			PaymentType:    "monthly",
			PayRate:        12000,
			Availabilities: []coachAvail{
				{models.Tuesday, "18:00", "21:00"},
				{models.Thursday, "18:00", "21:00"},
				{models.Saturday, "13:00", "18:00"},
			},
		},
		{
			FirstName:      "สารัช",
			LastName:       "โค้ชแกร่ง",
			Email:          "coach3@gmail.com",
			Nickname:       "โค้ชตัง",
			Phone:          "0834567890",
			LineID:         "", // เว้นว่างไว้ทดสอบเคสไม่กรอก (ฟิลด์นี้ไม่บังคับ)
			Facebook:       "https://facebook.com/coachtang",
			Uid:            "C003",
			Address:        "789/12 ถ.พหลโยธิน กรุงเทพฯ",
			BirthDate:      "1992-05-30",
			ProfilePicture: "https://example.com/profiles/coach3.png",
			Specialization: "P",
			CoachLicense:   "License C",
			BankAccount:    "ธนาคารกรุงเทพ",
			PaymentInfo:    "1112222223",
			PromptPay:      "0834567890",
			PaymentType:    "per_session",
			PayRate:        350,
			Availabilities: []coachAvail{
				{models.Monday, "18:00", "20:00"},
				{models.Tuesday, "18:00", "20:00"},
				{models.Wednesday, "18:00", "20:00"},
				{models.Thursday, "18:00", "20:00"},
				{models.Friday, "18:00", "20:00"},
			},
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

					// QR ประจำตัวโค้ช สุ่มด้วยตัวสร้างตัวเดียวกับตอนแอดมินเพิ่มโค้ชจริง
					qrCode, err := services.GenerateUniqueQRCode(tx)
					if err != nil {
						return err
					}

					coach := models.Coach{
						UserID:         user.ID,
						PersonalQRCode: qrCode,
						Nickname:       data.Nickname,
						Phone:          data.Phone,
						LineID:         data.LineID,
						Facebook:       data.Facebook,
						Uid:            data.Uid,
						Address:        data.Address,
						BirthDate:      data.BirthDate,
						ProfilePicture: data.ProfilePicture,
						Specialization: data.Specialization,
						CoachLicense:   data.CoachLicense,
						BankAccount:    data.BankAccount,
						PaymentInfo:    data.PaymentInfo,
						PromptPay:      data.PromptPay,
						PaymentType:    data.PaymentType,
						PayRate:        data.PayRate,
					}
					if err := tx.Create(&coach).Error; err != nil {
						return err
					}

					// seed ตารางเวลาว่างประจำสัปดาห์ของโค้ช
					for _, a := range data.Availabilities {
						avail := models.CoachAvailability{
							CoachID:   coach.ID,
							DayOfWeek: a.Day,
							StartTime: a.Start,
							EndTime:   a.End,
						}
						if err := tx.Create(&avail).Error; err != nil {
							return err
						}
					}
					return nil
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
		Gender            string
		PhoneNumber       string
		LineID            string
		Facebook          string
		BirthDate         time.Time
		ParentEmail       string
		ParentPhoneNumber string
	}{
		{
			FirstName:         "สมศักดิ์",
			LastName:          "รักเรียน",
			Email:             "student1@gmail.com",
			Password:          string(hashedPassword),
			Nickname:          "ศักดิ์",
			Gender:            "male",
			PhoneNumber:       "0845678901",
			LineID:            "somsak_r",
			Facebook:          "https://facebook.com/somsak.rakrian",
			BirthDate:         time.Date(2010, 1, 15, 0, 0, 0, 0, time.UTC),
			ParentEmail:       "parent1@gmail.com",
			ParentPhoneNumber: "0898765432",
		},
		{
			FirstName:         "สุดา",
			LastName:          "ใจเรียน",
			Email:             "student2@gmail.com",
			Password:          string(hashedPassword),
			Nickname:          "ดา",
			Gender:            "female",
			PhoneNumber:       "0856789012",
			LineID:            "suda_j",
			Facebook:          "", // เว้นว่างไว้ทดสอบเคสไม่กรอก (ฟิลด์นี้ไม่บังคับ)
			BirthDate:         time.Date(2012, 5, 20, 0, 0, 0, 0, time.UTC),
			ParentEmail:       "parent2@gmail.com",
			ParentPhoneNumber: "0897654321",
		},
		{
			FirstName:         "มานะ",
			LastName:          "พากเพียร",
			Email:             "student3@gmail.com",
			Password:          string(hashedPassword),
			Nickname:          "นะ",
			Gender:            "male",
			PhoneNumber:       "0867890123",
			LineID:            "", // เว้นว่างไว้ทดสอบเคสไม่กรอก (ฟิลด์นี้ไม่บังคับ)
			Facebook:          "", // เว้นว่างไว้ทดสอบเคสไม่กรอกทั้งคู่
			BirthDate:         time.Date(2011, 11, 11, 0, 0, 0, 0, time.UTC),
			ParentEmail:       "parent3@gmail.com",
			ParentPhoneNumber: "0896543210",
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

					// QR ประจำตัวต้องสุ่มด้วยตัวสร้างตัวเดียวกับตอนสมัครสมาชิกจริง
					// เพื่อให้ข้อมูล seed มีหน้าตาเหมือนข้อมูลจริงทุกประการ
					// (เดิม hardcode เป็น QR_STUDENT_001 ซึ่งเดาได้และไม่ตรงกับของจริง)
					qrCode, err := services.GenerateUniqueQRCode(tx)
					if err != nil {
						return err
					}

					customer := models.Customer{
						UserID:            user.ID,
						Nickname:          data.Nickname,
						Gender:            models.Gender(data.Gender),
						BirthDate:         data.BirthDate,
						PhoneNumber:       data.PhoneNumber,
						LineID:            data.LineID,
						Facebook:          data.Facebook,
						ParentEmail:       data.ParentEmail,
						ParentPhoneNumber: data.ParentPhoneNumber,
						PersonalQRCode:    qrCode,
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

    // สร้างข้อมูลตามโปสเตอร์ Koyama Badminton School
    // LearningOutcomes เก็บเป็นข้อความหลายบรรทัด บรรทัดละ 1 ข้อ (ดู models.Course.LearningOutcomes)
    courseSeeds := []struct {
        CourseName       string
        Description      string
        LearningOutcomes string
        ImageURL         string
        Packages         []struct {
            SessionsCount uint
            HoursCount    uint
            Price         float64
            MaxSeats      uint
            StartTime     string
            EndTime       string
        }
    }{
        {
            CourseName:  "คอร์สปกติ",
            ImageURL:    "https://res.cloudinary.com/wwwka2em/image/upload/v1786610190/koyama2/file_tmxpfw.png",
            Description: "คอร์สเรียนรวมกลุ่มสำหรับผู้เริ่มต้นถึงระดับกลาง เน้นปูพื้นฐานให้แน่นตั้งแต่การจับไม้ การยืน ไปจนถึงลูกตีพื้นฐานครบทุกแบบ เรียนกับโค้ชผู้มีประสบการณ์ในบรรยากาศเป็นกันเอง",
            LearningOutcomes: `การจับไม้และการวางท่าทางพื้นฐานที่ถูกต้อง
ฟุตเวิร์กพื้นฐาน การเคลื่อนที่เข้าออก 6 จุดในสนาม
ลูกโยนหลัง (Clear) และลูกหยอดหน้าเน็ต (Net Drop)
ลูกตบ (Smash) และการรับลูกตบเบื้องต้น
การเสิร์ฟสั้นและเสิร์ฟยาวให้แม่นยำ
กติกาการแข่งขันและการนับคะแนน`,
            Packages: []struct{ SessionsCount, HoursCount uint; Price float64; MaxSeats uint; StartTime, EndTime string }{
                {8, 16, 1800, 10, "18:00", "20:00"},
                {12, 24, 2200, 10, "18:00", "20:00"},
                {16, 32, 2600, 10, "18:00", "20:00"},
                {20, 40, 3000, 10, "18:00", "20:00"},
            },
        },
        {
            CourseName:  "คอร์ส VIP นักกีฬา",
            ImageURL:    "https://res.cloudinary.com/wwwka2em/image/upload/v1788012043/koyama2/file_swzbxd.jpg",
            Description: "คอร์สเข้มข้นสำหรับผู้ที่มีพื้นฐานแล้วและต้องการลงแข่งขันจริงจัง เพิ่มเวลาเป็น 3 ชั่วโมงต่อครั้ง เน้นตีโต้และตีเกมจริงเพื่อสร้างความอึดและไหวพริบในสนาม",
            LearningOutcomes: `เทคนิคการตีขั้นสูง ลูกดาด (Drive) ลูกตัดหยอด (Drop Shot) และลูกหลอก
ฟุตเวิร์กความเร็วสูงและการทรงตัวขณะตีลูกยาก
การวางแผนเกมและอ่านทางคู่ต่อสู้
การเล่นคู่ ตำแหน่งยืนและการสลับหน้า-หลังกับคู่ขา
โปรแกรมเสริมสร้างความแข็งแรงและความอึดเฉพาะนักแบดมินตัน
การเตรียมตัวและการวางแผนก่อนลงแข่งขันรายการจริง`,
            Packages: []struct{ SessionsCount, HoursCount uint; Price float64; MaxSeats uint; StartTime, EndTime string }{
                {8, 16, 2000, 10, "18:00", "21:00"},
                {12, 24, 2400, 10, "18:00", "21:00"},
                {16, 32, 2800, 10, "18:00", "21:00"},
                {20, 40, 3200, 10, "18:00", "21:00"},
            },
        },
        {
            CourseName:  "คอร์ส PRIVATE (2 ชม.)",
            ImageURL:    "https://res.cloudinary.com/wwwka2em/image/upload/v1786531356/koyama2/file_asozst.png",
            Description: "เรียนตัวต่อตัวกับโค้ชแบบเต็ม 2 ชั่วโมงต่อครั้ง โค้ชออกแบบเนื้อหาให้ตรงกับจุดอ่อนของผู้เรียนแต่ละคนโดยเฉพาะ เหมาะกับผู้ที่ต้องการพัฒนาเร็วหรือมีเวลาจำกัด",
            LearningOutcomes: `แผนการฝึกที่ออกแบบเฉพาะบุคคลจากการประเมินฝีมือจริง
แก้ไขท่าทางที่ผิดแบบตัวต่อตัว ได้รับคำแนะนำทันทีทุกลูก
ฝึกซ้ำเฉพาะจุดที่เป็นจุดอ่อนจนกว่าจะแก้ได้
ตีโต้กับโค้ชเพื่อสร้างความสม่ำเสมอของลูก
ตีเกมจริงกับโค้ชพร้อมวิเคราะห์หลังจบเกม
ติดตามพัฒนาการรายครั้งตลอดคอร์ส`,
            Packages: []struct{ SessionsCount, HoursCount uint; Price float64; MaxSeats uint; StartTime, EndTime string }{
                {8, 16, 0, 2, "10:00", "12:00"},
                {12, 24, 0, 2, "14:00", "16:00"},
                {16, 32, 0, 2, "16:00", "18:00"},
                {20, 40, 0, 2, "21:00", "23:00"},
            },
        },
        {
            CourseName:  "คอร์ส PRIVATE (1 ชม.)",
            ImageURL:    "https://res.cloudinary.com/wwwka2em/image/upload/v1786355826/koyama2/file_fiyprm.png",
            Description: "เรียนตัวต่อตัวแบบกระชับ 1 ชั่วโมงต่อครั้ง เหมาะกับผู้ที่มีเวลาน้อยแต่อยากได้คำแนะนำแบบใกล้ชิด เน้นแก้จุดอ่อนทีละเรื่องให้เห็นผลชัดในแต่ละครั้ง",
            LearningOutcomes: `เลือกโฟกัสได้ครั้งละ 1 ทักษะ ทำให้เห็นพัฒนาการชัดเจน
แก้ไขท่าทางเฉพาะจุดโดยโค้ชดูแลใกล้ชิด
ฝึกความแม่นยำของลูกเสิร์ฟและลูกหยอด
เพิ่มความเร็วของฟุตเวิร์กด้วยแบบฝึกเฉพาะทาง
ได้รับการบ้านไปฝึกต่อเองระหว่างรอคาบถัดไป
ยืดหยุ่นเรื่องเวลา เลือกช่วงที่สะดวกได้`,
            Packages: []struct{ SessionsCount, HoursCount uint; Price float64; MaxSeats uint; StartTime, EndTime string }{
                {8, 8, 0, 2, "10:00", "11:00"},
                {12, 12, 0, 2, "13:00", "14:00"},
                {16, 16, 0, 2, "15:00", "16:00"},
                {20, 20, 0, 2, "21:00", "22:00"},
            },
        },
    }

    for _, seed := range courseSeeds {
        var course models.Course
        err := db.Where("course_name = ?", seed.CourseName).First(&course).Error
        if err == gorm.ErrRecordNotFound {
            course = models.Course{
                CourseName:       seed.CourseName,
                Description:      seed.Description,
                LearningOutcomes: seed.LearningOutcomes,
                ImageURL:         seed.ImageURL,
                Status:           models.CourseStatusActive,
                UserID:           admin.ID,
            }
            if err := db.Create(&course).Error; err != nil {
                log.Printf("ไม่สามารถสร้างคอร์ส %s ได้: %v", seed.CourseName, err)
                continue
            }
            fmt.Printf("Seed คอร์ส %s สำเร็จเรียบร้อย!\n", seed.CourseName)
        }

        for _, p := range seed.Packages {
            pkg := models.Package{
                SessionsCount: p.SessionsCount,
                HoursCount:    p.HoursCount,
                Price:         p.Price,
                MaxSeats:      p.MaxSeats,
                DurationDays: 30,
                CourseID:     course.ID,
            }
            db.Create(&pkg)

            // จัดตารางเรียน 3 วัน (ตัวอย่าง: จันทร์ พุธ ศุกร์)
            days := []models.DayOfWeek{models.Monday, models.Wednesday, models.Friday}
            for _, d := range days {
                db.Create(&models.PackageSchedule{
                    PackageID: pkg.ID,
                    DayOfWeek: d,
                    StartTime: p.StartTime,
                    EndTime:   p.EndTime,
                })
            }
        }
    }
}

// seedHomeContent เติมเนื้อหาหน้าแรกสาธารณะ (singleton) ให้ครบทุกช่องเป็นข้อมูลตัวอย่าง
// เว้นรูปสไลด์ (HeroSlide) และรูป/แผนที่ที่ต้องใช้ไฟล์จริงไว้ ให้แอดมินอัปเองผ่าน /admin/settings
func seedHomeContent(db *gorm.DB) {
	var count int64
	if err := db.Model(&models.HomeContent{}).Count(&count).Error; err != nil {
		log.Printf("ไม่สามารถเช็คจำนวนข้อมูล HomeContent ได้: %v", err)
		return
	}
	if count > 0 {
		fmt.Println("ข้ามขั้นตอนการ Seed HomeContent เนื่องจากมีข้อมูลอยู่แล้ว")
		return
	}

	content := models.HomeContent{
		// เกี่ยวกับเรา
		AboutTitle: "เกี่ยวกับเรา",
		AboutContent: "Koyama Badminton School โรงเรียนสอนแบดมินตันที่มุ่งพัฒนาผู้เรียนทุกระดับ " +
			"ตั้งแต่ผู้เริ่มต้นจนถึงนักกีฬาที่ต้องการลงแข่งขันจริงจัง ด้วยทีมโค้ชผู้มีประสบการณ์ " +
			"หลักสูตรที่ออกแบบอย่างเป็นระบบ และบรรยากาศการเรียนที่เป็นกันเอง",

		// หัวข้อ/คำโปรยของแต่ละส่วน
		CoachesTitle:    "ทีมโค้ชของเรา",
		CoachesSubtitle: "โค้ชผู้เชี่ยวชาญพร้อมดูแลผู้เรียนอย่างใกล้ชิด",
		CoursesTitle:    "คอร์สเรียน",
		CoursesSubtitle: "เลือกคอร์สที่เหมาะกับระดับและเป้าหมายของคุณ",

		// รีวิว featured
		ShowFeaturedReviews: true,
		ReviewsTitle:        "เสียงจากผู้เรียน",
		ReviewsSubtitle:     "ความประทับใจจากนักเรียนของเรา",

		// ลิงก์โซเชียลมีเดีย (ข้อมูลตัวอย่าง)
		FacebookURL:  "https://facebook.com/koyamabadminton",
		InstagramURL: "https://instagram.com/koyamabadminton",
		TiktokURL:    "https://tiktok.com/@koyamabadminton",
		YoutubeURL:   "https://youtube.com/@koyamabadminton",
		LineURL:      "https://line.me/ti/p/~koyamabadminton",

		// ข้อมูลติดต่อ (footer)
		SchoolName:     "Koyama Badminton School",
		ContactAddress: "123/45 ถ.สุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110",
		ContactPhone:   "02-123-4567",
		ContactEmail:   "info@koyamabadminton.com",
		OpeningHours:   "จันทร์–ศุกร์ 10:00–20:00\nเสาร์–อาทิตย์ 09:00–18:00",

		// เอกสารทางกฎหมาย (ข้อความตัวอย่าง ควรให้แอดมิน/ทนายปรับให้เหมาะกับธุรกิจจริง)
		PrivacyPolicy: "โรงเรียนเก็บรวบรวมข้อมูลส่วนบุคคลของผู้เรียนและผู้ปกครองเท่าที่จำเป็น " +
			"เพื่อการลงทะเบียนเรียน การติดต่อสื่อสาร และการให้บริการ โดยจะเก็บรักษาข้อมูลอย่างปลอดภัย " +
			"ไม่เปิดเผยต่อบุคคลภายนอกโดยไม่ได้รับความยินยอม ผู้เป็นเจ้าของข้อมูลมีสิทธิ์ขอเข้าถึง แก้ไข " +
			"หรือลบข้อมูลของตนได้ โดยติดต่อผ่านช่องทางของโรงเรียน",
		TermsOfService: "การใช้บริการของ Koyama Badminton School ถือว่าผู้เรียนยอมรับเงื่อนไขการเรียน " +
			"การชำระเงิน และนโยบายการยกเลิก/เลื่อนคาบเรียนตามที่โรงเรียนกำหนด " +
			"โรงเรียนขอสงวนสิทธิ์ในการปรับเปลี่ยนตารางเรียนหรือเงื่อนไขการให้บริการโดยจะแจ้งให้ทราบล่วงหน้า",

		// เนื้อหาหลักหน้าแรก (ตรงกับค่า default ที่ฝังในหน้าแรกเดิม)
		HeroEyebrow:  "สำหรับผู้ปกครอง · เปิดสอนตั้งแต่ปี 2562",
		HeroHeadline: "พื้นฐานที่ถูกต้อง\nสำคัญกว่าชนะเร็ว",
		HeroSubtext: "คลาสเยาวชนกลุ่มเล็ก โค้ชมีใบรับรอง และระบบที่ผู้ปกครองเข้าไปดูตารางเรียน " +
			"ค่าเรียน และพัฒนาการของลูกได้ทุกเมื่อ",
		CoursesFootnote: "รวมค่าคอร์ทและลูกขนไก่ · ยืมไม้ฟรีตลอดคอร์ส · แบ่งชำระ 2 งวดได้",
		CoachesNote:     "โค้ชทุกคนผ่านการตรวจประวัติอาชญากรรมและอบรมการปฐมพยาบาลเบื้องต้น",
		FacilityTitle:   "ภาพบรรยากาศ",
		FacilitySubtitle: "Facility",
		FooterCtaTitle:   "พร้อมเริ่มเรียน\nกับเราแล้วหรือยัง?",
		FooterCtaSubtitle: "ทดลองเรียนฟรี 1 ครั้ง ไม่มีข้อผูกมัด · Free trial class",

		// ข้อมูลชุดซ้ำ (JSON)
		HeroStatsJSON: `[{"value":"12","label":"เหรียญระดับจังหวัด"},` +
			`{"value":"450+","label":"นักเรียนที่ผ่านการฝึก"},` +
			`{"value":"6","label":"คอร์ทมาตรฐาน"},` +
			`{"value":"7","label":"ปีที่เปิดสอน"}]`,
		CoachStatsJSON: `[{"value":"8","label":"โค้ชประจำ"},` +
			`{"value":"100%","label":"มีใบรับรอง"},` +
			`{"value":"1 : 4","label":"สัดส่วนโค้ชต่อนักเรียน"}]`,
		FacilityTilesJSON: `[{"label":"คอร์ทหลัก มุมกว้าง","wide":true},` +
			`{"label":"โซนพักผู้ปกครอง","wide":false},` +
			`{"label":"ห้องเปลี่ยนเสื้อผ้า","wide":false},` +
			`{"label":"อุปกรณ์ฝึกซ้อม","wide":false},` +
			`{"label":"ที่จอดรถ","wide":false}]`,
		FaqItemsJSON: `[{"question":"ลูกไม่มีพื้นฐานเลย เรียนได้ไหม?",` +
			`"answer":"ได้ คลาสระดับเริ่มต้นออกแบบมาสำหรับเด็กที่ยังไม่เคยเล่น เริ่มจากการจับไม้และการเคลื่อนที่ให้ถูกต้อง ไม่มีการวัดผลแข่งขันในช่วงแรก"},` +
			`{"question":"ต้องเตรียมอุปกรณ์อะไรมาเอง?",` +
			`"answer":"แค่รองเท้าในร่มและชุดกีฬา ไม้แบดและลูกขนไก่ทางโรงเรียนมีให้ยืมฟรีตลอดคอร์ส"},` +
			`{"question":"ผู้ปกครองนั่งรอในสนามได้หรือไม่?",` +
			`"answer":"มีโซนพักสำหรับผู้ปกครองให้นั่งรอและชมการฝึกซ้อมได้ตลอดคาบเรียน"},` +
			`{"question":"ถ้าลูกป่วย เลื่อนคลาสได้ไหม?",` +
			`"answer":"แจ้งล่วงหน้าอย่างน้อย 24 ชั่วโมงสามารถเลื่อนคาบเรียนได้โดยไม่มีค่าใช้จ่าย"},` +
			`{"question":"มีคลาสทดลองเรียนก่อนสมัครหรือเปล่า?",` +
			`"answer":"มี ทดลองเรียนฟรี 1 ครั้ง โดยไม่มีข้อผูกมัด ติดต่อทางโทรศัพท์หรือ LINE เพื่อจองรอบทดลอง"}]`,
	}

	if err := db.Create(&content).Error; err != nil {
		log.Printf("การทำ Seed HomeContent ล้มเหลว: %v", err)
		return
	}
	fmt.Println("Seed HomeContent สำเร็จเรียบร้อย!")
}

// seedHeroSlides เติมรูปสไลด์ HeroSlider หน้าแรกเป็นข้อมูลตัวอย่าง (แอดมินแก้/เพิ่มเองได้ที่ /admin/settings)
func seedHeroSlides(db *gorm.DB) {
	var count int64
	if err := db.Model(&models.HeroSlide{}).Count(&count).Error; err != nil {
		log.Printf("ไม่สามารถเช็คจำนวนข้อมูล HeroSlide ได้: %v", err)
		return
	}
	if count > 0 {
		fmt.Println("ข้ามขั้นตอนการ Seed HeroSlide เนื่องจากมีข้อมูลอยู่แล้ว")
		return
	}

	slides := []models.HeroSlide{
		{
			ImageURL:  "https://res.cloudinary.com/wwwka2em/image/upload/v1786270445/koyama2/file_d80gv5.png",
			Caption:   "ยินดีต้อนรับสู่ Koyama Badminton School",
			SortOrder: 1,
			IsActive:  true,
		},
		{
			ImageURL:  "https://res.cloudinary.com/wwwka2em/image/upload/v1787525979/koyama2/course/file_chffnq.jpg",
			Caption:   "คอร์สเรียนครบทุกระดับ ตั้งแต่ผู้เริ่มต้นถึงนักกีฬา",
			SortOrder: 2,
			IsActive:  true,
		},
		{
			ImageURL:  "https://res.cloudinary.com/wwwka2em/image/upload/v1788337878/koyama2/slip/file_qch5kx.jpg",
			Caption:   "สมัครเรียนกับโค้ชผู้มีประสบการณ์ได้แล้ววันนี้",
			SortOrder: 3,
			IsActive:  true,
		},
	}

	if err := db.Create(&slides).Error; err != nil {
		log.Printf("การทำ Seed HeroSlide ล้มเหลว: %v", err)
		return
	}
	fmt.Printf("Seed HeroSlide สำเร็จเรียบร้อย! (%d สไลด์)\n", len(slides))
}

func seedBankAccounts(db *gorm.DB) {
    accounts := []models.BankAccount{
        {
            BankName:    "ธนาคารกรุงไทย (KTB)",
            AccountNo:   "6629946995",
            AccountName: "นายสิษฐ์สโรจ  กันทรสุรพล",
            PromptPayID: "1309801486371", // เลขพร้อมเพย์สำหรับ QR (ข้อมูลตัวอย่าง)
            IsActive:    true,
        },
        {
            BankName:    "ธนาคารกรุงไทย (KTB)",
            AccountNo:   "3350495907",
            AccountName: "นายธีรศักดิ์  กุลเกตุ",
            PromptPayID: "0830512752", // เลขพร้อมเพย์สำหรับ QR (ข้อมูลตัวอย่าง)
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