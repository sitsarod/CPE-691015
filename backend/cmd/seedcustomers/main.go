package main

// ข้อมูลจำลองผู้เรียน 3 คน สำหรับใช้ทดสอบ/เดโม
//
// ไม่ล้างฐานข้อมูล แค่เพิ่มเข้าไป (ต่างจาก cmd/init ที่ DROP SCHEMA ทิ้งก่อน)
// รันซ้ำได้ ถ้ามีอีเมลนั้นอยู่แล้วจะข้าม
//
// วิธีรัน:  cd backend/cmd/seedcustomers && go run .
// เข้าระบบด้วย: อีเมลด้านล่าง / รหัสผ่าน password123
//
// ล้างทิ้งทีหลัง:
//   DELETE FROM customers WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'mock%@gmail.com');
//   DELETE FROM users WHERE email LIKE 'mock%@gmail.com';

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

// mockCustomer คือข้อมูลดิบของผู้เรียนหนึ่งคน ก่อนแปลงเป็นแถวจริงในฐาน
//
// ตั้งใจให้สามคนต่างกันคนละแบบ เพื่อให้เจอเคสที่หน้าจอต้องรับมือจริง:
// เด็กที่มีผู้ปกครอง / วัยรุ่นที่กรอกข้อมูลไม่ครบ / ผู้ใหญ่ที่ไม่มีผู้ปกครอง
type mockCustomer struct {
	firstName  string
	lastName   string
	nickname   string
	email      string
	gender     string
	birthDate  time.Time
	phone      string
	lineID     string
	facebook   string
	parentMail string
	parentTel  string
	note       string
}

var mocks = []mockCustomer{
	{
		firstName:  "ปิยะพงษ์",
		lastName:   "ศรีสุวรรณ",
		nickname:   "น้องบูม",
		email:      "mock.boom@gmail.com",
		gender:     models.GenderMale,
		birthDate:  time.Date(2015, 3, 12, 0, 0, 0, 0, time.UTC),
		phone:      "0812345001",
		lineID:     "boom_badminton",
		parentMail: "somsak.sri@gmail.com",
		parentTel:  "0812345002",
		note:       "เด็กเล็ก มีข้อมูลผู้ปกครองครบ",
	},
	{
		firstName: "ณัฐธิดา",
		lastName:  "วงศ์ไพศาล",
		nickname:  "น้องเฟิร์น",
		email:     "mock.fern@gmail.com",
		gender:    models.GenderFemale,
		birthDate: time.Date(2009, 11, 28, 0, 0, 0, 0, time.UTC),
		phone:     "0899876543",
		facebook:  "fern.wongpaisan",
		// ตั้งใจไม่กรอก line_id กับข้อมูลผู้ปกครอง — วัยรุ่นที่ลงทะเบียนเอง
		note: "วัยรุ่น ข้อมูลไม่ครบทุกช่อง",
	},
	{
		firstName: "อรรถพล",
		lastName:  "เจริญทรัพย์",
		nickname:  "พี่ต้น",
		email:     "mock.ton@gmail.com",
		gender:    models.GenderMale,
		birthDate: time.Date(1994, 6, 5, 0, 0, 0, 0, time.UTC),
		phone:     "0865554321",
		lineID:    "ton.charoensap",
		facebook:  "ton.charoensap",
		note:      "ผู้ใหญ่ ไม่มีผู้ปกครอง",
	},
}

func main() {
	// path เดียวกับ cmd/init และ cmd/seedloadtest
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

	seedMockCustomers(db)
}

func seedMockCustomers(db *gorm.DB) {
	hashed, err := bcrypt.GenerateFromPassword([]byte("password123"), bcrypt.DefaultCost)
	if err != nil {
		log.Fatalf("เข้ารหัสรหัสผ่านไม่สำเร็จ: %v", err)
	}
	now := time.Now()

	for _, m := range mocks {
		var existing models.User
		err := db.Where("email = ?", m.email).First(&existing).Error
		if err == nil {
			fmt.Printf("ข้าม %s — มีอยู่แล้ว\n", m.email)
			continue
		}
		if err != gorm.ErrRecordNotFound {
			log.Printf("ตรวจสอบ %s ไม่สำเร็จ: %v", m.email, err)
			continue
		}

		// user กับ customer ต้องเกิดพร้อมกัน ถ้าอันหลังพลาดจะเหลือบัญชีลอย ๆ ที่ไม่มีโปรไฟล์
		if err := db.Transaction(func(tx *gorm.DB) error {
			user := models.User{
				FirstName: m.firstName,
				LastName:  m.lastName,
				Email:     m.email,
				Password:  string(hashed),
				Role:      models.CustomerRole,
				// ไม่ปักไว้จะ login ไม่ได้ เพราะสร้างตรงไม่ได้ผ่าน UserService.CreateUser
				EmailVerifiedAt: &now,
			}
			if err := tx.Create(&user).Error; err != nil {
				return err
			}

			// ⚠️ QR ประจำตัวต้องสุ่มผ่านตัวนี้เท่านั้น ห้ามคำนวณจากอีเมล/ชื่อ/เลขบัตร
			// (เหตุผลเต็มอยู่ที่ services/personal_qr.go)
			qr, err := services.GenerateUniqueQRCode(tx)
			if err != nil {
				return err
			}

			memberCode, err := services.GenerateMemberCode(tx, models.CustomerRole)
			if err != nil {
				return err
			}

			customer := models.Customer{
				UserID:            user.ID,
				Nickname:          m.nickname,
				Gender:            models.Gender(m.gender),
				BirthDate:         m.birthDate,
				PhoneNumber:       m.phone,
				LineID:            m.lineID,
				Facebook:          m.facebook,
				ParentEmail:       m.parentMail,
				ParentPhoneNumber: m.parentTel,
				PersonalQRCode:    qr,
				MemberCode:        memberCode,
				Status:            models.CustomerStatusActive,
			}
			return tx.Create(&customer).Error
		}); err != nil {
			log.Printf("สร้าง %s ไม่สำเร็จ: %v", m.email, err)
			continue
		}

		fmt.Printf("สร้าง %s (%s) สำเร็จ — %s\n", m.nickname, m.email, m.note)
	}

	fmt.Println("\nเข้าระบบด้วยรหัสผ่าน: password123")
}
