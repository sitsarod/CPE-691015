// createadmin: สร้างบัญชีผู้ดูแลระบบจากเครื่อง โดยไม่ต้องล็อกอินเข้าระบบก่อน
//
// ─── ทำไมต้องมี ───
//
// หน้าเว็บสร้างแอดมินได้เฉพาะคนที่เป็นแอดมินอยู่แล้ว จึงเกิดปัญหาไก่กับไข่ 2 กรณี:
//
//  1. ติดตั้งระบบให้โรงเรียนใหม่ ยังไม่มีแอดมินสักคน จึงไม่มีใครสร้างแอดมินคนแรกได้
//     ก่อนหน้านี้ต้องไปเพิ่มแถวในฐานข้อมูลเอง ซึ่งเสี่ยงมากเพราะต้องเข้ารหัสผ่าน
//     ด้วย bcrypt เองให้ถูก ถ้าพลาดจะได้บัญชีที่ล็อกอินไม่ได้ หรือแย่กว่านั้นคือ
//     บัญชีที่เก็บรหัสผ่านเป็นข้อความเปล่า
//
//  2. แอดมินคนสุดท้ายลืมรหัสผ่าน ระบบยังไม่มีหน้าตั้งรหัสผ่านใหม่ (ดูข้อ 7 ในลิสต์)
//     จึงเข้าระบบไม่ได้อีกเลยทั้งที่ข้อมูลยังอยู่ครบ
//
// ─── วิธีรัน ───
//
//	cd backend/cmd/createadmin
//	go run .                            # สร้างแอดมินใหม่ (ถามข้อมูลทีละอย่าง)
//	go run . -email a@gmail.com -reset  # ตั้งรหัสผ่านใหม่ให้แอดมินที่มีอยู่แล้ว
//
// ⚠️ ต้องรันจากเครื่องที่เข้าถึงฐานข้อมูลได้เท่านั้น เครื่องมือนี้ไม่มีการยืนยันตัวตนใด ๆ
// ใครรันได้ก็สร้างแอดมินได้ ความปลอดภัยจึงขึ้นกับว่าใครเข้าถึงเซิร์ฟเวอร์และ .env ได้
//
// หมายเหตุ: รหัสผ่านที่พิมพ์จะปรากฏบนหน้าจอ (ไม่ได้ซ่อนเป็นดอกจัน) เพราะไม่อยากเพิ่ม
// dependency ใหม่เข้าโปรเจกต์เพียงเพื่อเรื่องนี้ แต่ตั้งใจให้รับทางคำถามแทน flag
// เพื่อไม่ให้รหัสผ่านไปค้างอยู่ในประวัติคำสั่งของ shell และใน process list
package main

import (
	"bufio"
	"errors"
	"flag"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"CPE-691015/internal/models"
	"CPE-691015/internal/services"

	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func main() {
	emailFlag := flag.String("email", "", "อีเมลของแอดมิน (ถ้าไม่ใส่จะถามตอนรัน)")
	reset := flag.Bool("reset", false, "ตั้งรหัสผ่านใหม่ให้แอดมินที่มีอยู่แล้ว แทนการสร้างบัญชีใหม่")
	flag.Parse()

	db := connectDB()
	reader := bufio.NewReader(os.Stdin)

	email := strings.ToLower(strings.TrimSpace(*emailFlag))
	if email == "" {
		email = ask(reader, "อีเมล")
	}
	if email == "" {
		log.Fatal("ต้องระบุอีเมล")
	}

	if *reset {
		resetPassword(db, reader, email)
		return
	}

	createAdmin(db, reader, email)
}

// connectDB ต่อฐานข้อมูลด้วยค่าเดียวกับที่เซิร์ฟเวอร์ใช้
func connectDB() *gorm.DB {
	if err := godotenv.Load("../../../.env"); err != nil {
		log.Println("คำเตือน: ไม่พบไฟล์ .env จะใช้ Environment Variable ของเครื่องแทน")
	}

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("กรุณาตั้งค่า DATABASE_URL ในไฟล์ .env ด้วย")
	}

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		// ปิด log ของ gorm เพื่อไม่ให้ SQL ที่มี hash รหัสผ่านโผล่บนหน้าจอ
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		log.Fatalf("เชื่อมต่อฐานข้อมูลไม่สำเร็จ: %v", err)
	}
	return db
}

// createAdmin สร้างบัญชีแอดมินใหม่
//
// ใช้ services.UserService.CreateUser แทนการ INSERT เอง เพื่อให้กติกาเรื่อง
// รูปแบบอีเมล ความยาวรหัสผ่าน และการเข้ารหัส bcrypt อยู่ที่เดียวกับตอนสมัครผ่านเว็บ
// ถ้าวันหนึ่งแก้กติกาพวกนั้น เครื่องมือนี้จะเปลี่ยนตามเองโดยไม่ต้องมาแก้ซ้ำ
func createAdmin(db *gorm.DB, reader *bufio.Reader, email string) {
	// เตือนไว้ก่อน ไม่ได้ห้าม — เพราะกรณีติดตั้งใหม่ควรมีแอดมินได้มากกว่าหนึ่งคน
	// (ระบบห้ามลบแอดมินคนสุดท้าย ถ้ามีคนเดียวแล้วบัญชีมีปัญหาจะยุ่งยาก)
	var adminCount int64
	db.Model(&models.User{}).Where("role = ?", models.AdminRole).Count(&adminCount)
	fmt.Printf("\nตอนนี้ระบบมีผู้ดูแลระบบอยู่ %d คน\n", adminCount)

	firstName := ask(reader, "ชื่อ")
	lastName := ask(reader, "นามสกุล")
	if firstName == "" || lastName == "" {
		log.Fatal("ต้องระบุทั้งชื่อและนามสกุล")
	}

	password := askPassword(reader)

	// ยืนยันอีเมลให้ทันที — เครื่องมือนี้รันได้เฉพาะคนที่เข้าถึงเซิร์ฟเวอร์อยู่แล้ว
	// ไม่มีหน้าเว็บให้กรอก OTP ต่อ ถ้าปล่อยว่างไว้จะได้แอดมินที่ login ไม่ได้เลย
	now := time.Now()
	user := &models.User{
		Role:            models.AdminRole,
		FirstName:       firstName,
		LastName:        lastName,
		Email:           email,
		Password:        password,
		EmailVerifiedAt: &now,
	}

	if err := services.NewUserService(db).CreateUser(user); err != nil {
		log.Fatalf("สร้างบัญชีไม่สำเร็จ: %v", err)
	}

	fmt.Printf("\nสร้างผู้ดูแลระบบเรียบร้อยแล้ว\n")
	fmt.Printf("  อีเมล: %s\n", user.Email)
	fmt.Printf("  ชื่อ : %s %s\n", user.FirstName, user.LastName)
	fmt.Printf("\nเข้าสู่ระบบที่หน้าเว็บได้เลย\n")
}

// resetPassword ตั้งรหัสผ่านใหม่ให้บัญชีที่มีอยู่แล้ว
//
// จำกัดเฉพาะบัญชีที่เป็นแอดมินโดยตั้งใจ เครื่องมือนี้มีไว้กู้ระบบตอนเข้าไม่ได้
// ไม่ใช่ช่องทางให้ใครก็ตามที่เข้าถึงเซิร์ฟเวอร์ได้ไปเปลี่ยนรหัสผ่านของโค้ชหรือผู้เรียน
// (ซึ่งจะทำให้เข้าถึงข้อมูลส่วนตัวและบัญชีธนาคารของเขาได้ทันที)
func resetPassword(db *gorm.DB, reader *bufio.Reader, email string) {
	var user models.User
	if err := db.Where("email = ?", email).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			log.Fatalf("ไม่พบบัญชีที่ใช้อีเมล %s", email)
		}
		log.Fatalf("ค้นหาบัญชีไม่สำเร็จ: %v", err)
	}

	if user.Role != models.AdminRole {
		log.Fatalf("บัญชีนี้เป็น %s ไม่ใช่ผู้ดูแลระบบ เครื่องมือนี้ตั้งรหัสผ่านใหม่ได้เฉพาะบัญชีผู้ดูแลระบบเท่านั้น", user.Role)
	}

	fmt.Printf("\nกำลังตั้งรหัสผ่านใหม่ให้: %s %s (%s)\n", user.FirstName, user.LastName, user.Email)

	password := askPassword(reader)

	// ใช้ทางเดียวกับที่หน้าเว็บใช้ — ตรวจความยาว เข้ารหัส และเดินเลขรุ่น token
	// ให้ครบในคำสั่งเดียว จะได้ไม่มีทางลืมขั้นตอนใดขั้นตอนหนึ่ง
	if err := services.SetPassword(db, &user, password); err != nil {
		log.Fatalf("ตั้งรหัสผ่านใหม่ไม่สำเร็จ: %v", err)
	}

	fmt.Printf("\nตั้งรหัสผ่านใหม่เรียบร้อยแล้ว\n")
	fmt.Printf("\ntoken เดิมของบัญชีนี้ถูกยกเลิกทั้งหมดแล้ว\n")
	fmt.Printf("   ใครที่ล็อกอินค้างอยู่จะถูกเตะออกจากระบบทันทีเมื่อเรียก API ครั้งถัดไป\n")
}

// ask ถามคำถามหนึ่งข้อแล้วคืนคำตอบที่ตัดช่องว่างหัวท้ายแล้ว
func ask(reader *bufio.Reader, label string) string {
	fmt.Printf("%s: ", label)
	line, err := reader.ReadString('\n')
	if err != nil && line == "" {
		log.Fatalf("อ่านค่าที่พิมพ์ไม่สำเร็จ: %v", err)
	}
	return strings.TrimSpace(line)
}

// askPassword ถามรหัสผ่านสองครั้งเพื่อกันพิมพ์ผิด
//
// ต้องถามซ้ำเพราะตัวอักษรที่พิมพ์ไม่ได้ถูกซ่อน แต่คนมักไม่ได้อ่านทวน
// ถ้าพิมพ์ผิดแล้วไม่รู้ตัว จะได้บัญชีที่ล็อกอินไม่ได้และไม่มีทางกู้
func askPassword(reader *bufio.Reader) string {
	fmt.Printf("\n(รหัสผ่านจะแสดงบนหน้าจอ ระวังคนข้างหลัง)\n")

	first := ask(reader, "รหัสผ่าน")
	second := ask(reader, "พิมพ์รหัสผ่านอีกครั้ง")

	if first != second {
		log.Fatal("รหัสผ่านสองครั้งไม่ตรงกัน กรุณารันใหม่")
	}
	if first == "" {
		log.Fatal("ต้องระบุรหัสผ่าน")
	}
	return first
}
