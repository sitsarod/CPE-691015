// cmd/mailtest — ส่งอีเมลทดสอบหนึ่งฉบับ เพื่อตรวจว่าตั้งค่า SMTP ถูกหรือยัง
//
// มีไว้เพราะเวลาทดสอบระบบกู้รหัสผ่านแล้วอีเมลไม่มา จะแยกไม่ออกว่าพังตรงไหน
// ระหว่าง "ตั้งค่า SMTP ผิด" กับ "ตรรกะกู้รหัสผ่านผิด" ตัวนี้ตัดตัวแปรทิ้ง
// เหลือแค่คำถามเดียวคือส่งอีเมลออกได้ไหม
//
// ไม่แตะฐานข้อมูลเลย จึงรันได้โดยไม่กระทบข้อมูลที่ใช้ร่วมกับเพื่อนใน Neon
//
// วิธีใช้ (ต้องรันจากโฟลเดอร์นี้ เพราะ .env ถูกอ้างแบบ relative path):
//
//	cd backend/cmd/mailtest
//	go run . -to yosikkiv@gmail.com
package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"CPE-691015/internal/services"

	"github.com/joho/godotenv"
)

func main() {
	to := flag.String("to", "", "อีเมลปลายทางที่จะส่งไปทดสอบ")
	flag.Parse()

	if strings.TrimSpace(*to) == "" {
		fmt.Println("กรุณาระบุอีเมลปลายทาง เช่น: go run . -to somchai@gmail.com")
		os.Exit(1)
	}

	if err := godotenv.Load("../../../.env"); err != nil {
		log.Println("คำเตือน: ไม่พบไฟล์ .env จะใช้ Environment Variable ของเครื่องแทน")
	}

	// ⚠️ ตรวจก่อนว่าตั้งค่าครบไหม
	//
	// NewMailer ถอยไปใช้ logMailer เงียบ ๆ เมื่อตั้งค่าไม่ครบ ซึ่งเป็นพฤติกรรมที่ถูก
	// สำหรับเซิร์ฟเวอร์ แต่สำหรับเครื่องมือทดสอบนี้มันคือผลลวง — จะขึ้นว่า "สำเร็จ"
	// ทั้งที่ไม่ได้ส่งอะไรออกไปเลย จึงต้องบอกให้ชัดตรงนี้
	missing := []string{}
	for _, key := range []string{"SMTP_HOST", "SMTP_USERNAME", "SMTP_PASSWORD"} {
		if strings.TrimSpace(os.Getenv(key)) == "" {
			missing = append(missing, key)
		}
	}
	if len(missing) > 0 {
		fmt.Println("ยังตั้งค่าไม่ครบ ขาด:", strings.Join(missing, ", "))
		fmt.Println()
		fmt.Println("เพิ่มบรรทัดพวกนี้ในไฟล์ .env ที่โฟลเดอร์รากของโปรเจกต์:")
		fmt.Println()
		fmt.Println("  SMTP_HOST=smtp.gmail.com")
		fmt.Println("  SMTP_PORT=587")
		fmt.Println("  SMTP_USERNAME=อีเมลของคุณ@gmail.com")
		fmt.Println("  SMTP_PASSWORD=รหัส App Password 16 หลัก")
		fmt.Println("  SMTP_FROM=Koyama Badminton <อีเมลของคุณ@gmail.com>")
		fmt.Println()
		fmt.Println("หมายเหตุ: SMTP_PASSWORD ต้องเป็น App Password ที่สร้างจาก")
		fmt.Println("Google Account > Security > App passwords ไม่ใช่รหัสผ่าน Gmail จริง")
		os.Exit(1)
	}

	fmt.Printf("กำลังส่งอีเมลทดสอบไปที่ %s ...\n\n", *to)

	mailer := services.NewMailer()
	body := fmt.Sprintf(
		"นี่คืออีเมลทดสอบจากระบบ Koyama Badminton\n\n"+
			"ถ้าอ่านข้อความนี้อยู่ แปลว่าตั้งค่า SMTP ถูกต้องแล้ว\n"+
			"ระบบกู้รหัสผ่านจะส่งรหัสยืนยันมาทางช่องทางนี้\n\n"+
			"เวลาที่ส่ง: %s\n",
		time.Now().Format("2 Jan 2006 15:04:05"),
	)

	if err := mailer.Send(*to, "ทดสอบการส่งอีเมล — Koyama Badminton", body); err != nil {
		fmt.Println("ส่งไม่สำเร็จ:", err)
		fmt.Println()
		fmt.Println("สาเหตุที่พบบ่อย:")
		fmt.Println("  535 / Username and Password not accepted")
		fmt.Println("      = ใส่รหัสผ่าน Gmail จริงแทน App Password หรือยังไม่ได้เปิด 2FA")
		fmt.Println("  ต่อไม่ติด / timeout")
		fmt.Println("      = เน็ตของสถาบันบล็อกพอร์ต 587 ลองใช้เน็ตมือถือดู")
		os.Exit(1)
	}

	fmt.Println("ส่งเรียบร้อย — ไปเช็คกล่องจดหมาย (ดูใน Spam ด้วย ฉบับแรกมักตกไปที่นั่น)")
}
