package main

import (
	"fmt"
	"log"

	"CPE-691015/internal/models"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

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
			Packages: []struct {
				SessionsCount, HoursCount uint
				Price                     float64
				MaxSeats                  uint
				StartTime, EndTime        string
			}{
				{8, 16, 1800, 40, "18:00", "20:00"},
				{12, 24, 2200, 40, "18:00", "20:00"},
				{16, 32, 2600, 40, "18:00", "20:00"},
				{20, 40, 3000, 40, "18:00", "20:00"},
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
			Packages: []struct {
				SessionsCount, HoursCount uint
				Price                     float64
				MaxSeats                  uint
				StartTime, EndTime        string
			}{
				{8, 16, 2000, 40, "18:00", "21:00"},
				{12, 24, 2400, 40, "18:00", "21:00"},
				{16, 32, 2800, 40, "18:00", "21:00"},
				{20, 40, 3200, 40, "18:00", "21:00"},
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
			Packages: []struct {
				SessionsCount, HoursCount uint
				Price                     float64
				MaxSeats                  uint
				StartTime, EndTime        string
			}{
				{8, 16, 4000, 10, "10:00", "12:00"},
				{12, 24, 6000, 10, "14:00", "16:00"},
				{16, 32, 8000, 10, "16:00", "18:00"},
				{20, 40, 10000, 10, "21:00", "23:00"},
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
			Packages: []struct {
				SessionsCount, HoursCount uint
				Price                     float64
				MaxSeats                  uint
				StartTime, EndTime        string
			}{
				{8, 8, 3000, 10, "10:00", "11:00"},
				{12, 12, 4000, 10, "13:00", "14:00"},
				{16, 16, 5000, 10, "15:00", "16:00"},
				{20, 20, 6000, 10, "21:00", "22:00"},
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
				DurationDays:  30,
				CourseID:      course.ID,
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

	// แพ็กเกจทดลองเรียนฟรี 1 ครั้ง ของ "คอร์สปกติ" (ราคา 0 ไม่ออกบิล สมัครได้ครั้งเดียวต่อคนต่อคอร์ส)
	seedTrialPackage(db, "คอร์สปกติ", "18:00", "20:00")
}

// seedTrialPackage สร้างแพ็กเกจทดลองเรียนฟรี 1 ครั้ง (IsTrial) ให้คอร์สที่ระบุ
// กันสร้างซ้ำด้วยการเช็คว่ามีแพ็กเกจทดลองของคอร์สนั้นอยู่แล้วหรือยัง
func seedTrialPackage(db *gorm.DB, courseName, startTime, endTime string) {
	var course models.Course
	if err := db.Where("course_name = ?", courseName).First(&course).Error; err != nil {
		log.Printf("ไม่พบคอร์ส %s สำหรับสร้างแพ็กเกจทดลองเรียน: %v", courseName, err)
		return
	}

	var count int64
	db.Model(&models.Package{}).Where("course_id = ? AND is_trial = ?", course.ID, true).Count(&count)
	if count > 0 {
		fmt.Printf("ข้ามการ Seed แพ็กเกจทดลองเรียนของ %s เนื่องจากมีอยู่แล้ว\n", courseName)
		return
	}

	pkg := models.Package{
		SessionsCount: 1,
		HoursCount:    2,
		Price:         0,
		MaxSeats:      40,
		DurationDays:  30,
		IsTrial:       true,
		CourseID:      course.ID,
	}
	if err := db.Create(&pkg).Error; err != nil {
		log.Printf("สร้างแพ็กเกจทดลองเรียนของ %s ไม่สำเร็จ: %v", courseName, err)
		return
	}

	// จัดตารางเรียน 3 วัน (ตัวอย่าง: จันทร์ พุธ ศุกร์) ให้เหมือนแพ็กเกจปกติของคอร์สนี้
	days := []models.DayOfWeek{models.Monday, models.Wednesday, models.Friday}
	for _, d := range days {
		db.Create(&models.PackageSchedule{
			PackageID: pkg.ID,
			DayOfWeek: d,
			StartTime: startTime,
			EndTime:   endTime,
		})
	}
	fmt.Printf("Seed แพ็กเกจทดลองเรียนฟรี 1 ครั้ง ของ %s สำเร็จเรียบร้อย!\n", courseName)
}
