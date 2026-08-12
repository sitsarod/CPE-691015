// reissueqr: ออก QR ประจำตัวให้คนที่ยังไม่มี หรือยังใช้ QR แบบเก่าที่คำนวณจากอีเมล
//
// ครอบคลุมทั้งนักเรียน (customers) และโค้ช (coaches)
//
// ที่มา:
//   - นักเรียน: โค้ดชุดเดิมตั้งค่า personal_qr_code = "QR_" + อีเมล ทำให้ใครที่รู้อีเมล
//     สร้าง QR ของคนนั้นขึ้นมาเองแล้วเช็คชื่อแทนได้ ตอนนี้เปลี่ยนไปใช้ค่าสุ่ม 128 บิตแล้ว
//     แต่ข้อมูลเก่าในฐานยังเป็นค่าเดิม จึงต้องรันสคริปต์นี้ออกใบใหม่ครั้งเดียว
//   - โค้ช: เพิ่งเพิ่มคอลัมน์ personal_qr_code เข้ามา แถวเดิมจึงยังว่างอยู่ ต้องออกให้ครั้งแรก
//
// วิธีรัน:
//
//	cd backend/cmd/reissueqr
//	go run .              # ดูก่อนว่าจะกระทบใครบ้าง (ยังไม่เขียนฐานข้อมูล)
//	go run . -apply       # ลงมือเปลี่ยนจริง
//	go run . -apply -all  # ออกใบใหม่ให้ทุกคน ไม่ใช่แค่คนที่มีปัญหา
//
// ⚠️ ต้องรัน cmd/migrate ก่อน เพื่อให้คอลัมน์ personal_qr_code ของตาราง coaches ถูกสร้างขึ้น
//
// หมายเหตุ: หลังรันแล้ว คนที่ได้ QR ใบใหม่ต้องเปิดแอปเพื่อดู QR อันใหม่
// ใบเก่าที่ปรินต์ไว้หรือถ่ายรูปเก็บไว้จะใช้ไม่ได้อีก ควรแจ้งล่วงหน้า
package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"strings"

	"CPE-691015/internal/models"
	"CPE-691015/internal/services"

	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// target คือ 1 รายการที่ต้องออก QR ใหม่ ใช้ร่วมกันทั้งนักเรียนและโค้ช
type target struct {
	kind    string // "นักเรียน" หรือ "โค้ช"
	id      uint   // customers.id หรือ coaches.id
	email   string
	oldCode string
	reason  string
}

func main() {
	apply := flag.Bool("apply", false, "เขียนค่าใหม่ลงฐานข้อมูลจริง (ถ้าไม่ใส่จะเป็นโหมดดูอย่างเดียว)")
	all := flag.Bool("all", false, "ออกใบใหม่ให้ทุกคน ไม่ใช่แค่คนที่ QR มีปัญหา")
	flag.Parse()

	if err := godotenv.Load("../../../.env"); err != nil {
		log.Println("คำเตือน: ไม่พบไฟล์ .env จะใช้ Environment Variable ของเครื่องแทน")
	}

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("กรุณาตั้งค่า DATABASE_URL ในไฟล์ .env ด้วย")
	}

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatalf("เชื่อมต่อฐานข้อมูลไม่สำเร็จ: %v", err)
	}

	if *apply {
		fmt.Println("โหมด: เขียนจริง (-apply)")
	} else {
		fmt.Println("โหมด: ดูอย่างเดียว — ยังไม่มีอะไรถูกเปลี่ยน (ใส่ -apply เพื่อลงมือจริง)")
	}
	fmt.Println()

	targets := collect(db, *all)
	if len(targets) == 0 {
		fmt.Println("ไม่พบใครที่ต้องออก QR ใหม่ — ข้อมูลสะอาดแล้ว")
		return
	}

	fmt.Printf("ต้องออก QR ใบใหม่: %d ราย\n", len(targets))
	fmt.Println(strings.Repeat("-", 78))

	changed, failed := 0, 0
	for _, t := range targets {
		if !*apply {
			old := t.oldCode
			if old == "" {
				old = "(ว่าง)"
			}
			fmt.Printf("  [ดูอย่างเดียว] %-8s id=%-4d %-28s %-28s QR เดิม: %s\n",
				t.kind, t.id, t.email, t.reason, old)
			continue
		}

		var newCode string
		var err error
		if t.kind == "โค้ช" {
			newCode, err = services.ReissueCoachQRCode(db, t.id)
		} else {
			newCode, err = services.ReissueCustomerQRCode(db, t.id)
		}

		if err != nil {
			fmt.Printf("  [ล้มเหลว] %-8s id=%-4d %-28s -> %v\n", t.kind, t.id, t.email, err)
			failed++
			continue
		}
		fmt.Printf("  [สำเร็จ]  %-8s id=%-4d %-28s QR ใหม่: %s\n", t.kind, t.id, t.email, newCode)
		changed++
	}

	fmt.Println(strings.Repeat("-", 78))
	if *apply {
		fmt.Printf("เสร็จสิ้น: สำเร็จ %d ราย, ล้มเหลว %d ราย\n", changed, failed)
		if failed > 0 {
			os.Exit(1)
		}
	} else {
		fmt.Printf("สรุป: มี %d รายที่จะถูกเปลี่ยน — รันซ้ำด้วย -apply เพื่อลงมือจริง\n", len(targets))
	}
}

// collect รวบรวมรายชื่อที่ต้องออก QR ใหม่จากทั้งสองตาราง
func collect(db *gorm.DB, all bool) []target {
	var out []target

	var customers []models.Customer
	if err := db.Preload("User").Find(&customers).Error; err != nil {
		log.Fatalf("ดึงข้อมูลนักเรียนไม่สำเร็จ: %v", err)
	}
	fmt.Printf("นักเรียนทั้งหมด: %d ราย\n", len(customers))

	for _, c := range customers {
		email := "(ไม่มี user)"
		if c.User != nil {
			email = c.User.Email
		}

		reason := ""
		switch {
		case all:
			reason = "ออกใหม่ยกชุด (-all)"
		case c.PersonalQRCode == "":
			reason = "ยังไม่มี QR"
		// เทียบแบบไม่สนตัวพิมพ์ เพราะอีเมลถูก normalize เป็นตัวเล็กทีหลัง
		// ข้อมูลเก่าบางแถวจึงอาจเก็บ QR ด้วยอีเมลตัวใหญ่ปนอยู่
		case c.User != nil && strings.EqualFold(c.PersonalQRCode, services.QRCodePrefix+c.User.Email):
			reason = "QR อิงอีเมล (เดาได้)"
		}
		if reason != "" {
			out = append(out, target{"นักเรียน", c.ID, email, c.PersonalQRCode, reason})
		}
	}

	var coaches []models.Coach
	if err := db.Preload("User").Find(&coaches).Error; err != nil {
		log.Fatalf("ดึงข้อมูลโค้ชไม่สำเร็จ: %v", err)
	}
	fmt.Printf("โค้ชทั้งหมด: %d ราย\n\n", len(coaches))

	for _, c := range coaches {
		email := "(ไม่มี user)"
		if c.User != nil {
			email = c.User.Email
		}

		reason := ""
		switch {
		case all:
			reason = "ออกใหม่ยกชุด (-all)"
		case c.PersonalQRCode == "":
			reason = "ยังไม่มี QR (คอลัมน์เพิ่งเพิ่ม)"
		case c.User != nil && strings.EqualFold(c.PersonalQRCode, services.QRCodePrefix+c.User.Email):
			reason = "QR อิงอีเมล (เดาได้)"
		}
		if reason != "" {
			out = append(out, target{"โค้ช", c.ID, email, c.PersonalQRCode, reason})
		}
	}

	return out
}
