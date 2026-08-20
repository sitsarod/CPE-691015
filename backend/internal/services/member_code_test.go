package services

import (
	"errors"
	"testing"

	"CPE-691015/internal/models"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func newMemberCodeTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
		Logger:                                   logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatalf("เปิด sqlite ไม่สำเร็จ: %v", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		t.Fatalf("ดึง *sql.DB ไม่สำเร็จ: %v", err)
	}
	sqlDB.SetMaxOpenConns(1)

	if err := db.AutoMigrate(&models.Customer{}, &models.Coach{}); err != nil {
		t.Fatalf("AutoMigrate ไม่สำเร็จ: %v", err)
	}
	return db
}

// ฐานว่างต้องได้รหัสแรกเป็นเลข 1
func TestGenerateMemberCodeStartsAtOne(t *testing.T) {
	t.Setenv("SCHOOL_CODE", "KY")
	db := newMemberCodeTestDB(t)

	code, err := GenerateMemberCode(db, models.CustomerRole)
	if err != nil {
		t.Fatalf("ออกรหัสไม่สำเร็จ: %v", err)
	}
	if code != "KYS0001" {
		t.Fatalf("ควรได้ KYS0001 แต่ได้ %s", code)
	}
}

// แต่ละบทบาทต้องเดินเลขของตัวเอง ไม่ปนกัน
//
// ถ้าเทสนี้พัง = เลขของนักเรียนจะมีช่องว่างตรงที่โค้ชแทรกเข้ามา
// ซึ่งเจ้าหน้าที่จะเข้าใจว่าข้อมูลหาย (เป็นเหตุผลที่เปลี่ยนมาใช้ KYS/KYC)
func TestGenerateMemberCodeKeepsSequencesSeparate(t *testing.T) {
	t.Setenv("SCHOOL_CODE", "KY")
	db := newMemberCodeTestDB(t)

	db.Create(&models.Customer{UserID: 1, Gender: models.GenderMale, MemberCode: "KYS0001", PersonalQRCode: "q1"})
	db.Create(&models.Coach{UserID: 2, Uid: "1", MemberCode: "KYC0001", PersonalQRCode: "q2"})

	student, err := GenerateMemberCode(db, models.CustomerRole)
	if err != nil {
		t.Fatalf("ออกรหัสนักเรียนไม่สำเร็จ: %v", err)
	}
	if student != "KYS0002" {
		t.Fatalf("นักเรียนควรได้ KYS0002 แต่ได้ %s", student)
	}

	coach, err := GenerateMemberCode(db, models.CoachRole)
	if err != nil {
		t.Fatalf("ออกรหัสโค้ชไม่สำเร็จ: %v", err)
	}
	if coach != "KYC0002" {
		t.Fatalf("โค้ชควรได้ KYC0002 แต่ได้ %s (เลขต้องไม่ปนกับนักเรียน)", coach)
	}
}

// แอดมินไม่มีรหัสประจำตัว เพราะไม่ได้เช็คชื่อเข้าเรียนหรือเข้างาน
func TestGenerateMemberCodeRejectsAdmin(t *testing.T) {
	db := newMemberCodeTestDB(t)

	if _, err := GenerateMemberCode(db, models.AdminRole); !errors.Is(err, ErrMemberCodeNoRole) {
		t.Fatalf("ควรได้ ErrMemberCodeNoRole แต่ได้: %v", err)
	}
}

// แถวที่ถูก soft delete ยังกินเลขอยู่ ต้องไม่ออกรหัสซ้ำกับคนที่ลบไปแล้ว
//
// คอลัมน์เป็น unique ระดับฐานข้อมูล ถ้าไม่นับรวมจะพังตอน INSERT แทน
func TestGenerateMemberCodeSkipsSoftDeleted(t *testing.T) {
	t.Setenv("SCHOOL_CODE", "KY")
	db := newMemberCodeTestDB(t)

	c := models.Customer{UserID: 1, Gender: models.GenderMale, MemberCode: "KYS0005", PersonalQRCode: "q1"}
	db.Create(&c)
	db.Delete(&c) // soft delete — แถวยังอยู่ในตาราง

	code, err := GenerateMemberCode(db, models.CustomerRole)
	if err != nil {
		t.Fatalf("ออกรหัสไม่สำเร็จ: %v", err)
	}
	if code != "KYS0006" {
		t.Fatalf("ต้องเดินต่อจากรหัสที่ถูกลบ ควรได้ KYS0006 แต่ได้ %s", code)
	}
}

// เลขต้องเรียงถูกต้องแม้ข้ามหลัก (9 → 10)
//
// เทียบด้วยการเรียงสตริงได้เพราะเติมศูนย์ครบ 4 หลักเสมอ
// ถ้าวันหนึ่งมีคนเอาศูนย์นำหน้าออก การเรียงจะเพี้ยนทันที (KYS9 > KYS10)
func TestGenerateMemberCodeCrossesDigitBoundary(t *testing.T) {
	t.Setenv("SCHOOL_CODE", "KY")
	db := newMemberCodeTestDB(t)

	db.Create(&models.Customer{UserID: 1, Gender: models.GenderMale, MemberCode: "KYS0009", PersonalQRCode: "q1"})

	code, err := GenerateMemberCode(db, models.CustomerRole)
	if err != nil {
		t.Fatalf("ออกรหัสไม่สำเร็จ: %v", err)
	}
	if code != "KYS0010" {
		t.Fatalf("ควรได้ KYS0010 แต่ได้ %s", code)
	}
}

// อักษรย่อสถาบันมาจาก .env
func TestSchoolCodeReadsEnv(t *testing.T) {
	t.Setenv("SCHOOL_CODE", "bd")

	if got := SchoolCode(); got != "BD" {
		t.Fatalf("ควรได้ BD (แปลงเป็นตัวใหญ่) แต่ได้ %s", got)
	}
}

// ค่าที่ตั้งผิดต้องถอยไปใช้ค่าเริ่มต้น ไม่ใช่ปล่อยให้รหัสเพี้ยน
//
// รหัสที่ออกไปแล้วแก้ย้อนหลังยาก (พิมพ์ลงบัตร แจ้งผู้ปกครองไปแล้ว)
// จึงยอมใช้ค่าเริ่มต้นดีกว่ายอมรับค่าที่ผิดรูปแบบ
func TestSchoolCodeFallsBackOnBadValue(t *testing.T) {
	cases := []struct {
		name string
		raw  string
	}{
		{"ไม่ได้ตั้งค่า", ""},
		{"ยาวเกินสองตัว", "KOYAMA"},
		{"สั้นเกินไป", "K"},
		{"มีตัวเลขปน", "K1"},
		{"ไม่ใช่อักษรอังกฤษ", "กย"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("SCHOOL_CODE", tc.raw)

			if got := SchoolCode(); got != defaultSchoolCode {
				t.Fatalf("ควรถอยไปใช้ %s แต่ได้ %s", defaultSchoolCode, got)
			}
		})
	}
}

func TestFormatMemberCode(t *testing.T) {
	cases := []struct {
		number int
		want   string
	}{
		{1, "KYS0001"},
		{42, "KYS0042"},
		{9999, "KYS9999"},
	}

	for _, tc := range cases {
		if got := FormatMemberCode("KYS", tc.number); got != tc.want {
			t.Errorf("เลข %d ควรได้ %s แต่ได้ %s", tc.number, tc.want, got)
		}
	}
}

// เปลี่ยนอักษรย่อแล้วเลขต้องเริ่มนับใหม่ ไม่ไปต่อจากของสถาบันอื่น
func TestGenerateMemberCodeIsScopedToPrefix(t *testing.T) {
	db := newMemberCodeTestDB(t)

	t.Setenv("SCHOOL_CODE", "KY")
	db.Create(&models.Customer{UserID: 1, Gender: models.GenderMale, MemberCode: "KYS0050", PersonalQRCode: "q1"})

	t.Setenv("SCHOOL_CODE", "BD")
	code, err := GenerateMemberCode(db, models.CustomerRole)
	if err != nil {
		t.Fatalf("ออกรหัสไม่สำเร็จ: %v", err)
	}
	if code != "BDS0001" {
		t.Fatalf("อักษรย่อใหม่ควรเริ่มที่ BDS0001 แต่ได้ %s", code)
	}
}
