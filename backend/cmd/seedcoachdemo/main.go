package main

// ข้อมูลจำลองสำหรับนำเสนอหน้า "จัดตารางสอน" (มอบหมายโค้ช) ครบทุกสีของการ์ด
// ใช้คอร์ส/แพ็กเกจ/โค้ช/สนามที่มีอยู่จริง สร้างใหม่แค่นักเรียนจำลอง (ดูแผนใน demo.go)
//
// วิธีรัน (จาก backend/cmd/seedcoachdemo):
//   go run .                      สร้างข้อมูลของสัปดาห์นี้
//   go run . -week 2026-10-04     สร้างของสัปดาห์ที่เริ่มวันอาทิตย์นั้น (ใช้สัปดาห์ที่จะนำเสนอ)
//   go run . -reset -week ...     ลบของเดิมแล้วสร้างใหม่
//   go run . -check -week ...     ตรวจสีการ์ดอย่างเดียว ไม่เขียนอะไร
//   go run . -clean               ลบข้อมูลจำลองทั้งหมด
//   go run . -ratio 6 ...         ตั้งค่านักเรียนต่อโค้ช 1 คนก่อนสร้าง (ค่าของทั้งระบบ)
//
// ⚠️ เขียนลงฐานตาม DATABASE_URL ใน .env — ตรวจให้แน่ใจว่าเป็นฐานที่ตั้งใจก่อนรัน

import (
	"flag"
	"fmt"
	"log"
	"os"
	"sort"
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
	weekFlag := flag.String("week", "", "วันอาทิตย์ที่เริ่มสัปดาห์ YYYY-MM-DD (ว่าง = สัปดาห์นี้)")
	clean := flag.Bool("clean", false, "ลบข้อมูลจำลองทั้งหมด")
	reset := flag.Bool("reset", false, "ลบข้อมูลจำลองเดิมแล้วสร้างใหม่")
	check := flag.Bool("check", false, "ตรวจสีการ์ดอย่างเดียว")
	ratio := flag.Int("ratio", 0, "ตั้งค่านักเรียนต่อโค้ช 1 คนก่อนสร้าง (0 = ไม่เปลี่ยน)")
	flag.Parse()

	if err := godotenv.Load("../../../.env"); err != nil {
		if err := godotenv.Load(".env"); err != nil {
			log.Println("คำเตือน: ไม่พบไฟล์ .env จะใช้ Environment Variable ของเครื่องแทน")
		}
	}
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("กรุณาตั้งค่า DATABASE_URL ใน .env ก่อน")
	}
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		log.Fatalf("เชื่อมต่อฐานข้อมูลไม่สำเร็จ: %v", err)
	}
	fmt.Println("เชื่อมต่อฐาน:", dbHost(dsn))

	if *clean || *reset {
		counts, err := Clean(db)
		if err != nil {
			log.Fatalf("ลบข้อมูลจำลองไม่สำเร็จ: %v", err)
		}
		printCounts(counts)
		if *clean {
			return
		}
	}

	if *ratio > 0 {
		var admin models.User
		if err := db.Where("role = ?", models.AdminRole).Order("id ASC").First(&admin).Error; err != nil {
			log.Fatal("ต้องมีบัญชีแอดมินเพื่อบันทึกว่าใครเปลี่ยนค่าตั้งค่า")
		}
		before := services.NewSettingsService(db).GetStudentsPerCoach()
		if _, err := services.NewSettingsService(db).SetStudentsPerCoach(*ratio, admin.ID); err != nil {
			log.Fatalf("ตั้งอัตราส่วนไม่สำเร็จ: %v", err)
		}
		fmt.Printf("เปลี่ยนนักเรียนต่อโค้ช 1 คน: %d → %d\n", before, *ratio)
	}

	week, err := parseWeek(*weekFlag)
	if err != nil {
		log.Fatal(err)
	}

	if !*check {
		if err := Seed(db, week); err != nil {
			log.Fatalf("สร้างข้อมูลจำลองไม่สำเร็จ: %v", err)
		}
		fmt.Printf("สร้างข้อมูลจำลองของสัปดาห์ %s แล้ว (รหัสผ่านทุกบัญชี: %s)\n", week.Format("2006-01-02"), demoPassword)
	}

	cards, err := Verify(db, week)
	if err != nil {
		log.Fatalf("ตรวจการ์ดไม่สำเร็จ: %v", err)
	}
	ok := printCards(cards)
	if !ok {
		os.Exit(1)
	}
}

// parseWeek ว่าง = วันอาทิตย์ของสัปดาห์นี้ตามเวลาไทย
func parseWeek(v string) (time.Time, error) {
	if v == "" {
		loc, err := time.LoadLocation("Asia/Bangkok")
		if err != nil {
			loc = time.Local
		}
		now := time.Now().In(loc)
		sun := now.AddDate(0, 0, -int(now.Weekday()))
		return time.Date(sun.Year(), sun.Month(), sun.Day(), 0, 0, 0, 0, time.UTC), nil
	}
	t, err := time.Parse("2006-01-02", v)
	if err != nil {
		return t, fmt.Errorf("-week ต้องเป็น YYYY-MM-DD: %w", err)
	}
	if t.Weekday() != time.Sunday {
		return t, fmt.Errorf("-week ต้องเป็นวันอาทิตย์ (%s เป็นวัน %s)", v, t.Weekday())
	}
	return t, nil
}

func printCards(cards []CheckedCard) bool {
	ok := true
	fmt.Println("\nการ์ดบนหน้าจัดตารางสอน:")
	for _, c := range cards {
		mark := "✅"
		if c.Got != c.Want {
			mark, ok = "❌", false
		}
		fmt.Printf("%s %s %s %s  ยืนยัน %d/%d  โค้ช %s (แนะนำ %d)  → %s  · %s\n",
			mark, c.Date, c.Time, c.Course, c.Going, c.Total, joinNames(c.Coaches), c.Suggested, c.Got, c.Title)
		if c.Got != c.Want {
			fmt.Printf("     ควรเป็น %s\n", c.Want)
		}
	}
	return ok
}

func printCounts(counts map[string]int64) {
	keys := make([]string, 0, len(counts))
	for k := range counts {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	fmt.Println("ลบข้อมูลจำลองแล้ว:")
	for _, k := range keys {
		if counts[k] > 0 {
			fmt.Printf("  %s %d แถว\n", k, counts[k])
		}
	}
}

// dbHost ตัดรหัสผ่านออกก่อนพิมพ์
func dbHost(dsn string) string {
	if i := strings.Index(dsn, "@"); i >= 0 {
		dsn = dsn[i+1:]
	}
	if i := strings.IndexAny(dsn, "?"); i >= 0 {
		dsn = dsn[:i]
	}
	return dsn
}
