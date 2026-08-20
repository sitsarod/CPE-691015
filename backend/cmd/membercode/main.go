// membercode: ออกรหัสประจำตัวให้สมาชิกที่ยังไม่มี
//
//	นักเรียน : KYS0001  KYS0002  ...
//	โค้ช     : KYC0001  KYC0002  ...
//
// ที่มา: คอลัมน์ member_code เพิ่งถูกเพิ่มเข้ามา แถวที่มีอยู่ก่อนหน้าจึงยังว่าง
// ต้องรันสคริปต์นี้ครั้งเดียวเพื่อไล่ออกรหัสให้ครบ
//
// วิธีรัน:
//
//	cd backend/cmd/membercode
//	go run .                    # ดูก่อนว่าใครจะได้รหัสอะไร (ยังไม่เขียนฐานข้อมูล)
//	go run . -apply             # ออกรหัสให้เฉพาะคนที่ยังไม่มี
//	go run . -apply -reissue    # ล้างรหัสเดิมทิ้งแล้วออกใหม่ให้ทุกคน
//
// ⚠️ ต้องรัน cmd/migrate ก่อน เพื่อให้คอลัมน์ member_code ถูกสร้างขึ้น
//
// ⚠️ -reissue ใช้เมื่อเปลี่ยนรูปแบบรหัสเท่านั้น (เช่นตอนย้ายจาก KY0001 มาเป็น KYS0001)
// รหัสเดิมที่แจกไปแล้วจะใช้อ้างอิงไม่ได้อีก ถ้าพิมพ์บัตรหรือแจ้งผู้ปกครองไปแล้วต้องแจ้งใหม่
//
// รหัสเรียงตามลำดับการสมัคร (id น้อยได้เลขน้อย) เพื่อให้เลขสอดคล้องกับรุ่น
package main

import (
	"flag"
	"fmt"
	"log"
	"os"

	"CPE-691015/internal/models"
	"CPE-691015/internal/services"

	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// target คือ 1 รายการที่ต้องออกรหัส ใช้ร่วมกันทั้งนักเรียนและโค้ช
type target struct {
	role  models.UserRole
	kind  string // คำไทยไว้แสดงผล
	id    uint   // customers.id หรือ coaches.id
	label string // ชื่อไว้ให้คนอ่านตรวจสอบ
	old   string // รหัสเดิม (ถ้ามี) ใช้ตอน -reissue
}

func main() {
	apply := flag.Bool("apply", false, "เขียนรหัสลงฐานข้อมูลจริง (ถ้าไม่ใส่จะเป็นโหมดดูอย่างเดียว)")
	reissue := flag.Bool("reissue", false, "ล้างรหัสเดิมทิ้งแล้วออกใหม่ให้ทุกคน (ใช้ตอนเปลี่ยนรูปแบบรหัส)")
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

	studentPrefix, _ := services.MemberCodePrefix(models.CustomerRole)
	coachPrefix, _ := services.MemberCodePrefix(models.CoachRole)
	fmt.Printf("คำนำหน้ารหัส — นักเรียน: %s / โค้ช: %s (อักษรย่อตั้งผ่าน SCHOOL_CODE ใน .env)\n\n",
		studentPrefix, coachPrefix)

	targets, err := collectTargets(db, *reissue)
	if err != nil {
		log.Fatalf("ดึงรายชื่อไม่สำเร็จ: %v", err)
	}

	if len(targets) == 0 {
		fmt.Println("ทุกคนมีรหัสประจำตัวครบแล้ว ไม่มีอะไรต้องทำ")
		return
	}

	fmt.Printf("พบ %d รายการ\n\n", len(targets))

	// โหมดดูอย่างเดียวคำนวณเลขในหัวเอง เพราะยังไม่ได้เขียนฐาน
	// ถ้าเรียก GenerateMemberCode ตรง ๆ จะได้เลขเดิมซ้ำทุกบรรทัดแล้วอ่านไม่รู้เรื่อง
	if !*apply {
		previewCodes(db, targets, *reissue)
		fmt.Println("\nโหมดดูอย่างเดียว ยังไม่ได้เขียนอะไรลงฐานข้อมูล")
		fmt.Println("รันจริงด้วย: go run . -apply" + reissueHint(*reissue))
		return
	}

	// ล้างรหัสเดิมก่อน ไม่งั้นเลขใหม่จะไปชนกับของเดิมแล้วข้ามเลขไปเรื่อย ๆ
	if *reissue {
		if err := clearAllCodes(db); err != nil {
			log.Fatalf("ล้างรหัสเดิมไม่สำเร็จ: %v", err)
		}
		fmt.Println("ล้างรหัสเดิมเรียบร้อยแล้ว กำลังออกรหัสใหม่...")
	}

	for _, t := range targets {
		code, err := services.GenerateMemberCode(db, t.role)
		if err != nil {
			log.Fatalf("ออกรหัสไม่สำเร็จ: %v", err)
		}

		if err := writeCode(db, t, code); err != nil {
			log.Fatalf("บันทึกรหัสไม่สำเร็จ (%s id=%d): %v", t.kind, t.id, err)
		}

		if t.old != "" {
			fmt.Printf("  %s id=%d %s : %s → %s\n", t.kind, t.id, t.label, t.old, code)
		} else {
			fmt.Printf("  %s id=%d %s → %s\n", t.kind, t.id, t.label, code)
		}
	}

	fmt.Printf("\nออกรหัสครบ %d รายการเรียบร้อยแล้ว\n", len(targets))
}

func reissueHint(reissue bool) string {
	if reissue {
		return " -reissue"
	}
	return ""
}

// previewCodes แสดงรหัสที่จะได้โดยไม่แตะฐานข้อมูล
func previewCodes(db *gorm.DB, targets []target, reissue bool) {
	counters := map[models.UserRole]int{}

	// ถ้าไม่ได้ล้างรหัสเดิม ต้องเดินเลขต่อจากของที่มีอยู่
	if !reissue {
		for _, role := range []models.UserRole{models.CustomerRole, models.CoachRole} {
			code, err := services.GenerateMemberCode(db, role)
			if err != nil {
				continue
			}
			prefix, _ := services.MemberCodePrefix(role)
			counters[role] = parsePreviewNumber(code, prefix) - 1
		}
	}

	for _, t := range targets {
		counters[t.role]++
		prefix, _ := services.MemberCodePrefix(t.role)
		code := services.FormatMemberCode(prefix, counters[t.role])

		if t.old != "" {
			fmt.Printf("  [ดูอย่างเดียว] %s id=%d %s : %s → %s\n", t.kind, t.id, t.label, t.old, code)
		} else {
			fmt.Printf("  [ดูอย่างเดียว] %s id=%d %s → %s\n", t.kind, t.id, t.label, code)
		}
	}
}

func parsePreviewNumber(code, prefix string) int {
	var n int
	if _, err := fmt.Sscanf(code, prefix+"%d", &n); err != nil {
		return 1
	}
	return n
}

// collectTargets ดึงคนที่ต้องออกรหัส เรียงตาม id เพื่อให้เลขสอดคล้องกับลำดับการสมัคร
func collectTargets(db *gorm.DB, all bool) ([]target, error) {
	var targets []target

	query := func(tx *gorm.DB) *gorm.DB {
		if all {
			return tx
		}
		return tx.Where("member_code IS NULL OR member_code = ''")
	}

	var customers []models.Customer
	if err := query(db).Order("id ASC").Find(&customers).Error; err != nil {
		return nil, err
	}
	for _, c := range customers {
		targets = append(targets, target{
			role: models.CustomerRole, kind: "นักเรียน", id: c.ID, label: c.Nickname, old: c.MemberCode,
		})
	}

	var coaches []models.Coach
	if err := query(db).Order("id ASC").Find(&coaches).Error; err != nil {
		return nil, err
	}
	for _, c := range coaches {
		targets = append(targets, target{
			role: models.CoachRole, kind: "โค้ช", id: c.ID, label: c.Nickname, old: c.MemberCode,
		})
	}

	return targets, nil
}

// clearAllCodes ล้างรหัสเดิมของทุกคน ใช้ก่อนออกรหัสชุดใหม่
//
// ⚠️ ต้องเซ็ตเป็น NULL ห้ามเซ็ตเป็นค่าว่าง ""
//
// คอลัมน์ member_code เป็น unique index ซึ่งในสายตา Postgres ค่าว่างก็คือ "ค่าหนึ่ง"
// พอล้างทุกแถวให้เป็น "" เหมือนกันหมดจะชน unique ทันที (SQLSTATE 23505)
// ส่วน NULL แปลว่า "ไม่มีค่า" จึงมีซ้ำกันได้หลายแถวโดยไม่ผิดกติกา
func clearAllCodes(db *gorm.DB) error {
	// ต้องมี Where ที่เป็นจริงเสมอ เพราะ GORM กันการ UPDATE ทั้งตารางโดยไม่มีเงื่อนไข
	if err := db.Model(&models.Customer{}).Where("1 = 1").
		Update("member_code", gorm.Expr("NULL")).Error; err != nil {
		return err
	}
	return db.Model(&models.Coach{}).Where("1 = 1").
		Update("member_code", gorm.Expr("NULL")).Error
}

func writeCode(db *gorm.DB, t target, code string) error {
	var model any = &models.Customer{}
	if t.role == models.CoachRole {
		model = &models.Coach{}
	}

	res := db.Model(model).Where("id = ?", t.id).Update("member_code", code)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}
