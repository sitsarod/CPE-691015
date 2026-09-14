package main

// คำสั่งแยกสำหรับ "seed ข้อมูลทดสอบ" โดยเฉพาะ — ไม่ล้างฐานข้อมูล
//
// ต่างจาก cmd/init ที่ DROP SCHEMA ทิ้งทั้งหมดก่อน seed ใหม่
// ไฟล์นี้แค่ "เพิ่ม" ข้อมูลเข้าไป ปลอดภัยกับฐานข้อมูลที่มีข้อมูลจริงอยู่แล้ว
//
// สร้างนักเรียน 8 คน (loadtest1..8) ลงแพ็กเกจที่มีตารางเรียน แล้วยืนยันมาเรียนทุกคน
// ในคาบของสัปดาห์ปัจจุบัน เพื่อให้หน้าจัดตารางสอนโชว์ "ยืนยัน 8/8" + แจ้งเตือน "ควรเพิ่มโค้ช"
//
// วิธีรัน:  cd backend && go run ./cmd/seedloadtest
// idempotent: ถ้ามี loadtest1@gmail.com แล้วจะข้าม รันซ้ำได้ไม่พัง
//
// ล้างข้อมูลทดสอบทีหลังได้ด้วย SQL:
//   DELETE FROM users WHERE email LIKE 'loadtest%@gmail.com';
//   (customers/enrollments/class_confirmations ที่ผูกไว้จะถูกลบตาม cascade ถ้าตั้งไว้
//    ถ้าไม่ ให้ลบ class_confirmations/enrollments/customers ของ user เหล่านั้นก่อน)

import (
	"fmt"
	"log"
	"os"
	"time"

	"CPE-691015/internal/models"
	"CPE-691015/internal/services"

	"github.com/joho/godotenv"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func main() {
	// โหลด .env (path เดียวกับ cmd/init) — ถ้าไม่เจอใช้ environment variable ของเครื่องแทน
	if err := godotenv.Load("../../../.env"); err != nil {
		if err := godotenv.Load(".env"); err != nil {
			log.Println("คำเตือน: ไม่พบไฟล์ .env จะใช้ Environment Variable ของเครื่องแทน")
		}
	}

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("กรุณาตั้งค่า DATABASE_URL ใน .env ก่อน")
	}

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatalf("เชื่อมต่อฐานข้อมูลไม่สำเร็จ: %v", err)
	}
	fmt.Println("เชื่อมต่อฐานข้อมูลสำเร็จ (โหมดเพิ่มข้อมูล ไม่ล้าง DB)")

	// migrate เฉพาะตารางที่ใช้ (เพิ่มอย่างเดียว ไม่ลบข้อมูล) เผื่อ DB เก่ายังไม่มีตารางนี้
	if err := db.AutoMigrate(&models.ClassConfirmation{}); err != nil {
		log.Fatalf("AutoMigrate ClassConfirmation ไม่สำเร็จ: %v", err)
	}

	seedClassLoadTest(db)
}

// seedClassLoadTest สร้างนักเรียนทดสอบ 8 คน + ยืนยันมาเรียน เพื่อทดสอบแจ้งเตือน "ควรเพิ่มโค้ช"
func seedClassLoadTest(db *gorm.DB) {
	const markerEmail = "loadtest1@gmail.com"
	var existing models.User
	if err := db.Where("email = ?", markerEmail).First(&existing).Error; err == nil {
		fmt.Println("ข้ามการ seed — มีข้อมูลทดสอบ (loadtest1) อยู่แล้ว")
		return
	}

	// หาแพ็กเกจที่มีตารางเรียน (PackageSchedule) เพื่อผูกคาบให้ตรงกับที่หน้า assign แสดง
	var pkgs []models.Package
	if err := db.Preload("Schedules").Preload("Course").Find(&pkgs).Error; err != nil {
		log.Fatalf("โหลดแพ็กเกจไม่สำเร็จ: %v", err)
	}
	var pkg *models.Package
	for i := range pkgs {
		if len(pkgs[i].Schedules) > 0 {
			pkg = &pkgs[i]
			break
		}
	}
	if pkg == nil {
		log.Fatal("ไม่พบแพ็กเกจที่มีตารางเรียน (PackageSchedule) — สร้างคอร์ส/แพ็กเกจที่มีตารางก่อน")
	}
	sch := pkg.Schedules[0]

	// หาวันในสัปดาห์ปัจจุบัน (อาทิตย์-เสาร์) ที่ตรงกับ day_of_week ของคาบนี้
	now := time.Now()
	weekStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location()).
		AddDate(0, 0, -int(now.Weekday()))
	classDate := weekStart
	for i := 0; i < 7; i++ {
		d := weekStart.AddDate(0, 0, i)
		if d.Weekday().String() == string(sch.DayOfWeek) {
			classDate = d
			break
		}
	}

	hashed, _ := bcrypt.GenerateFromPassword([]byte("password123"), bcrypt.DefaultCost)
	startedAt := now.AddDate(0, 0, -30)
	expiresAt := now.AddDate(0, 0, 60)

	created := 0
	for n := 1; n <= 8; n++ {
		email := fmt.Sprintf("loadtest%d@gmail.com", n)
		err := db.Transaction(func(tx *gorm.DB) error {
			user := models.User{
				FirstName:       "โหลดเทสต์",
				LastName:        fmt.Sprintf("คนที่ %d", n),
				Email:           email,
				Password:        string(hashed),
				Role:            models.CustomerRole,
				EmailVerifiedAt: &now,
			}
			if err := tx.Create(&user).Error; err != nil {
				return err
			}
			qr, err := services.GenerateUniqueQRCode(tx)
			if err != nil {
				return err
			}
			customer := models.Customer{
				UserID:            user.ID,
				Nickname:          fmt.Sprintf("โหลด%d", n),
				Gender:            models.Gender("male"),
				BirthDate:         time.Date(2010, 1, 1, 0, 0, 0, 0, time.UTC),
				PhoneNumber:       fmt.Sprintf("09000000%02d", n),
				ParentEmail:       fmt.Sprintf("loadparent%d@gmail.com", n),
				ParentPhoneNumber: "0900000000",
				PersonalQRCode:    qr,
				Status:            models.CustomerStatusActive,
			}
			if err := tx.Create(&customer).Error; err != nil {
				return err
			}
			enr := models.Enrollment{
				EnrollmentDate:    startedAt,
				TotalSessions:     20,
				RemainingSessions: 20,
				Status:            models.EnrollmentStatusActive,
				StartedAt:         &startedAt,
				ExpiresAt:         &expiresAt,
				PackageID:         pkg.ID,
				CustomerID:        customer.ID,
			}
			if err := tx.Create(&enr).Error; err != nil {
				return err
			}
			conf := models.ClassConfirmation{
				EnrollmentID:      enr.ID,
				ClassDate:         classDate,
				Status:            models.ClassConfirmationGoing,
				ScheduleStartTime: sch.StartTime,
				ScheduleEndTime:   sch.EndTime,
				RespondedAt:       now,
			}
			return tx.Create(&conf).Error
		})
		if err != nil {
			log.Printf("สร้างนักเรียนทดสอบ %s ไม่สำเร็จ: %v", email, err)
			continue
		}
		created++
	}

	courseName := ""
	if pkg.Course != nil {
		courseName = pkg.Course.CourseName
	}
	fmt.Printf("เสร็จ: สร้างนักเรียนทดสอบ %d คน ยืนยันมาเรียน คอร์ส '%s' %s %s-%s วันที่ %s\n",
		created, courseName, string(sch.DayOfWeek), sch.StartTime, sch.EndTime, classDate.Format("2006-01-02"))
	fmt.Println("เปิดหน้าจัดตารางสอน (สัปดาห์ปัจจุบัน) จะเห็น 'ยืนยัน 8/8' + แจ้งเตือน 'ควรเพิ่มโค้ช'")
}
