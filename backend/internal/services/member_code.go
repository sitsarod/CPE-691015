package services

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"

	"CPE-691015/internal/models"

	"gorm.io/gorm"
)

// ─────────────────────────────────────────────────────────────────────────────
// รหัสประจำตัวสมาชิก — ใช้ร่วมกันทั้งนักเรียนและโค้ช
//
// รูปแบบ: อักษรย่อสถาบัน 2 ตัว + อักษรบอกบทบาท 1 ตัว + เลข 4 หลัก
//   นักเรียน KYS0001 / โค้ช KYC0001
//
// ─── ต่างจาก PersonalQRCode ยังไง (สำคัญมาก อย่าสับสน) ───
//
//	PersonalQRCode : ค่าสุ่ม 128 บิต เดาไม่ได้ ทำหน้าที่ "ยืนยันตัวตน"
//	MemberCode     : เลขเรียงกัน เดาได้ ทำหน้าที่ "อ้างอิงถึงคน" เท่านั้น
//
// ⚠️ ห้ามใช้ MemberCode เป็นหลักฐานยืนยันตัวตนเดี่ยว ๆ ตอนเช็คชื่อเด็ดขาด
//
// เพราะใครเห็น KYS0001 ก็เดาได้ว่ามี KYS0002 KYS0003 ต่อไป ถ้าระบบยอมให้พิมพ์รหัส
// แล้วบันทึกการเช็คชื่อทันที จะเป็นช่องโหว่เดียวกับ QR แบบเก่าที่คำนวณจากอีเมล
// ซึ่งทำให้เช็คชื่อแทนคนอื่นได้ (ดูเหตุผลเต็มใน personal_qr.go)
//
// วิธีใช้ที่ทีมตกลงกันไว้: เป็นทางสำรองตอนสแกน QR ไม่ได้ (มือถือแบตหมด ลืมบัตร)
// โดยเจ้าหน้าที่พิมพ์รหัส → ระบบแสดงชื่อและรูป → เจ้าหน้าที่ยืนยันด้วยตาว่าใช่คนนี้
// แล้วจึงกดบันทึก คือมีคนตรวจอีกชั้นเสมอ ไม่ใช่รหัสถูกแล้วผ่านเลย
//
// ─── ทำไมมีอักษรบอกบทบาทคั่นกลาง ───
//
//	นักเรียน : KYS0001  KYS0002  KYS0003
//	โค้ช     : KYC0001  KYC0002  KYC0003
//
// เคยลองใช้เลขชุดเดียวกันทั้งสองบทบาท (KY0001..KY0007 เรียงรวมกัน) แล้วพบว่า
// เลขของนักเรียนจะมีช่องว่างตรงที่โค้ชแทรกเข้ามา เช่นนักเรียนได้ 0001-0003
// แล้วกระโดดไป 0008 ซึ่งเจ้าหน้าที่ที่ไม่ได้เขียนโปรแกรมจะเข้าใจว่าข้อมูลหาย
//
// การมีอักษรบทบาทคั่นแก้ได้ทั้งสองเรื่องพร้อมกัน:
//   - แต่ละบทบาทเดินเลขของตัวเองต่อเนื่อง ไม่มีช่องว่าง
//   - รหัสยังไม่ซ้ำกันข้ามตาราง เพราะคนละคำนำหน้า
//     รหัสหนึ่งค่าจึงยังชี้ไปหาคนได้คนเดียวเสมอ เจ้าหน้าที่พิมพ์แล้วหาเจอเลย
//     ไม่ต้องเลือกก่อนว่าจะค้นนักเรียนหรือโค้ช
//   - อ่านรหัสแล้วรู้ทันทีว่าเป็นใคร
// ─────────────────────────────────────────────────────────────────────────────

const (
	// memberCodeDigits จำนวนหลักของเลขรัน — 4 หลัก = รองรับ 9,999 คนต่อสถาบัน
	memberCodeDigits = 4

	// memberCodeMaxNumber เลขสูงสุดที่ยังอยู่ในรูปแบบ 4 หลัก
	memberCodeMaxNumber = 9999

	// memberCodeMaxRetry จำนวนครั้งที่ยอมลองเลขถัดไปเมื่อชนกับที่มีอยู่แล้ว
	//
	// ต่างจาก QR ที่สุ่มค่า ตัวนี้เดินเลขเรียงกัน การชนจึงเกิดได้จริงเมื่อมีคน
	// สมัครพร้อมกันสองคน (ทั้งคู่อ่านเลขล่าสุดได้ค่าเดียวกัน) จึงต้องมี retry
	memberCodeMaxRetry = 10

	// defaultSchoolCode ตัวย่อที่ใช้เมื่อไม่ได้ตั้ง SCHOOL_CODE ใน .env
	defaultSchoolCode = "KY"
)

var (
	ErrMemberCodeFailed    = errors.New("ไม่สามารถออกรหัสประจำตัวได้")
	ErrMemberCodeExhausted = errors.New("รหัสประจำตัวเต็มแล้ว (ครบ 9999 คน) ต้องขยายจำนวนหลักก่อน")
	ErrMemberCodeNoRole    = errors.New("บทบาทนี้ไม่มีรหัสประจำตัว (มีเฉพาะผู้เรียนและโค้ช)")
)

// SchoolCode คืนอักษรย่อสถาบัน 2 ตัวจาก .env
//
//	SCHOOL_CODE=KY
//
// อ่านจาก env แทนการฮาร์ดโค้ด เพราะทีมเลือกแนวติดตั้งแยกชุดต่อโรงเรียน
// (แต่ละโรงเรียนมีฐานข้อมูลและ .env ของตัวเอง) ตัวย่อจึงเป็นค่าตั้งของแต่ละชุด
// ไม่ใช่ข้อมูลในตาราง ถ้าวันหนึ่งเปลี่ยนไปใช้ฐานเดียวหลายโรงเรียน
// ต้องย้ายค่านี้ไปเก็บในตาราง schools แทน
func SchoolCode() string {
	raw := strings.ToUpper(strings.TrimSpace(os.Getenv("SCHOOL_CODE")))

	// ยอมรับเฉพาะอักษรอังกฤษ 2 ตัว ค่าอื่นถือว่าตั้งผิดแล้วถอยไปใช้ค่าเริ่มต้น
	// ปล่อยให้ค่าเพี้ยนผ่านไปอันตรายกว่า เพราะรหัสที่ออกไปแล้วแก้ย้อนหลังยาก
	if len(raw) != 2 || !isAllLetters(raw) {
		return defaultSchoolCode
	}
	return raw
}

func isAllLetters(s string) bool {
	for _, r := range s {
		if r < 'A' || r > 'Z' {
			return false
		}
	}
	return true
}

// MemberCodePrefix คืนคำนำหน้ารหัสของบทบาทนั้น เช่น "KYS" (นักเรียน) หรือ "KYC" (โค้ช)
//
// บทบาทอื่น (แอดมิน) ไม่มีรหัสประจำตัว เพราะไม่ได้เช็คชื่อเข้าเรียนหรือเข้างาน
func MemberCodePrefix(role models.UserRole) (string, error) {
	switch role {
	case models.CustomerRole:
		return SchoolCode() + "S", nil
	case models.CoachRole:
		return SchoolCode() + "C", nil
	default:
		return "", ErrMemberCodeNoRole
	}
}

// FormatMemberCode ประกอบรหัสจากคำนำหน้าและเลขรัน เช่น (KYS, 7) → "KYS0007"
func FormatMemberCode(prefix string, number int) string {
	return fmt.Sprintf("%s%0*d", prefix, memberCodeDigits, number)
}

// GenerateMemberCode ออกรหัสประจำตัวใบถัดไปของบทบาทนั้นที่ยังไม่มีใครใช้
//
// เดินเลขต่อจากรหัสล่าสุดของบทบาทเดียวกัน ไม่ได้สุ่ม เพราะต้องการให้อ่านแล้วรู้ลำดับ
// การชนกันเกิดได้เมื่อมีคนสมัครพร้อมกัน จึงวนลองเลขถัดไปจนกว่าจะได้ค่าว่าง
func GenerateMemberCode(db *gorm.DB, role models.UserRole) (string, error) {
	prefix, err := MemberCodePrefix(role)
	if err != nil {
		return "", err
	}

	next, err := nextMemberNumber(db, prefix)
	if err != nil {
		return "", err
	}

	for i := 0; i < memberCodeMaxRetry; i++ {
		if next > memberCodeMaxNumber {
			return "", ErrMemberCodeExhausted
		}

		code := FormatMemberCode(prefix, next)

		taken, err := memberCodeTaken(db, code)
		if err != nil {
			return "", err
		}
		if !taken {
			return code, nil
		}
		next++
	}
	return "", ErrMemberCodeFailed
}

// nextMemberNumber หาเลขถัดไปจากรหัสล่าสุดของคำนำหน้านั้น
//
// ยังไล่ดูทั้งสองตารางแม้คำนำหน้าจะแยกบทบาทแล้ว เพราะเป็นการกันไว้ชั้นหนึ่ง
// เผื่อมีข้อมูลเก่าที่ออกด้วยกติกาชุดก่อนหน้าค้างอยู่ ราคาถูกกว่าปล่อยให้ชนตอน INSERT
//
// เทียบด้วยการเรียงสตริงได้เพราะเลขถูกเติมศูนย์ให้ครบ 4 หลักเสมอ
// KYS0009 < KYS0010 ทั้งในเชิงตัวเลขและเชิงตัวอักษร
func nextMemberNumber(db *gorm.DB, prefix string) (int, error) {
	highest := 0

	for _, model := range []any{&models.Customer{}, &models.Coach{}} {
		var code string

		// Unscoped เพราะแถวที่ soft delete ไปแล้วยังกินค่า unique อยู่
		// ถ้าไม่นับรวมจะออกรหัสซ้ำกับคนที่ลบไปแล้ว แล้วไปพังตอน INSERT
		err := db.Unscoped().Model(model).
			Where("member_code LIKE ?", prefix+"%").
			Order("member_code DESC").
			Limit(1).
			Pluck("member_code", &code).Error
		if err != nil {
			return 0, err
		}

		if n := parseMemberNumber(code, prefix); n > highest {
			highest = n
		}
	}

	return highest + 1, nil
}

// parseMemberNumber ดึงเลขรันออกจากรหัส คืน 0 ถ้ารูปแบบไม่ตรง
func parseMemberNumber(code, prefix string) int {
	if !strings.HasPrefix(code, prefix) {
		return 0
	}
	n, err := strconv.Atoi(strings.TrimPrefix(code, prefix))
	if err != nil {
		return 0
	}
	return n
}

// memberCodeTaken เช็คว่ารหัสนี้ถูกใช้ไปแล้วหรือยัง ทั้งตารางนักเรียนและโค้ช
func memberCodeTaken(db *gorm.DB, code string) (bool, error) {
	var n int64

	if err := db.Unscoped().Model(&models.Customer{}).
		Where("member_code = ?", code).Count(&n).Error; err != nil {
		return false, err
	}
	if n > 0 {
		return true, nil
	}

	if err := db.Unscoped().Model(&models.Coach{}).
		Where("member_code = ?", code).Count(&n).Error; err != nil {
		return false, err
	}
	return n > 0, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// Index ของรหัสประจำตัว
// ─────────────────────────────────────────────────────────────────────────────

// EnsureMemberCodeIndexes สร้าง unique index แบบมีเงื่อนไข ให้กับคอลัมน์ member_code
//
// ⚠️ ทำไมต้องเป็น "partial index" ไม่ใช่ uniqueIndex ธรรมดา
//
// ตอนแรกประกาศ gorm:"uniqueIndex" ไว้ที่โมเดล ซึ่งพังทันทีที่มีสมาชิกมากกว่า
// หนึ่งคนที่ยังไม่มีรหัส เพราะ Go string ที่ไม่ได้ตั้งค่าคือ "" ไม่ใช่ NULL
// และในสายตาฐานข้อมูล "" ก็เป็นค่าหนึ่ง สองแถวที่เป็น "" เหมือนกันจึงชน unique
//
// อาการที่เกิดจริง: seeder สร้างผู้เรียนคนที่สองไม่ผ่าน และเทสที่สร้าง
// ผู้เรียนหลายคนพังหมด ทั้งที่ไม่มีใครตั้งใจใส่รหัสซ้ำเลย
//
// index แบบมีเงื่อนไขแก้ให้ตรงจุด คือ "บังคับไม่ให้ซ้ำเฉพาะแถวที่มีรหัสจริง"
// ส่วนแถวที่ยังไม่มีรหัสจะมีกี่แถวก็ได้
//
// เรียกหลัง AutoMigrate เสมอ (cmd/migrate, cmd/init และ newTestDB ในเทส)
// เพื่อให้ของจริงกับของในเทสมีกติกาเดียวกัน
func EnsureMemberCodeIndexes(db *gorm.DB) error {
	statements := []string{
		// ทิ้ง index ตัวเก่าที่ GORM สร้างไว้จากแท็ก uniqueIndex ก่อน
		// ถ้าไม่ทิ้ง ฐานข้อมูลเดิมจะยังบังคับกติกาเก่าอยู่
		`DROP INDEX IF EXISTS idx_customers_member_code`,
		`DROP INDEX IF EXISTS idx_coaches_member_code`,

		`CREATE UNIQUE INDEX IF NOT EXISTS uniq_customers_member_code
		 ON customers (member_code) WHERE member_code <> ''`,
		`CREATE UNIQUE INDEX IF NOT EXISTS uniq_coaches_member_code
		 ON coaches (member_code) WHERE member_code <> ''`,
	}

	for _, sql := range statements {
		if err := db.Exec(sql).Error; err != nil {
			return err
		}
	}
	return nil
}
