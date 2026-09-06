package services

import (
	"testing"

	"CPE-691015/internal/models"

	"gorm.io/gorm"
)

// เทสชุดนี้คุมกติกา unique ที่ "ไม่นับคนที่ถูกลบไปแล้ว"
//
// มีสองด้านที่ต้องจริงพร้อมกัน และพังคนละแบบถ้าทำหลุดข้างใดข้างหนึ่ง:
//
//	ผ่อนไม่พอ  → ลบโค้ชแล้วรับคนเดิมกลับมาทำงานใหม่ไม่ได้ตลอดกาล
//	ผ่อนเกินไป → สมาชิกที่ยังใช้งานอยู่ใช้อีเมลซ้ำกันได้ ซึ่งพังกว่าเดิมมาก
//	             (ล็อกอินแล้วไม่รู้ว่าเข้าบัญชีใคร · ลืมรหัสผ่านส่งไปหาผิดคน)
//
// เทสฝั่ง "ผ่อนเกินไป" สำคัญเป็นพิเศษ เพราะตอนแก้เราถอดแท็ก `gorm:"unique"`
// ออกจากโมเดล ถ้า EnsureSoftDeleteUniqueIndexes ไม่ถูกเรียกหรือสร้าง index ไม่สำเร็จ
// ระบบจะไม่มีอะไรกันอีเมลซ้ำเลยแม้แต่ชั้นเดียว

func newIndexTestDB(t *testing.T) *gorm.DB {
	// ต้อง migrate ทั้ง users และ coaches เพื่อให้ index ถูกสร้างครบทั้งสองตัว
	return newTestDB(t, &models.User{}, &models.Coach{},
		&models.Photo{}, &models.FaceImage{},
		&models.CoachAvailability{}, &models.WorkSchedule{})
}

// ─────────────────────────────────────────────────────────────────────────────
// ด้านที่ 1 — ต้องยังกันของซ้ำในหมู่คนที่ยังใช้งานอยู่
// ─────────────────────────────────────────────────────────────────────────────

func TestActiveEmailStillBlocksDuplicate(t *testing.T) {
	db := newIndexTestDB(t)

	seedUser(t, db, models.CoachRole, "somchai@gmail.com")

	dup := models.User{
		Role: models.CoachRole, FirstName: "อีกคน", LastName: "ชื่อซ้ำ",
		Email: "somchai@gmail.com", Password: "hashed",
	}
	if err := db.Create(&dup).Error; err == nil {
		t.Fatal("อีเมลซ้ำกับคนที่ยังใช้งานอยู่ต้องสร้างไม่ได้ แต่ db ยอมให้สร้าง")
	}
}

func TestActiveCoachUidStillBlocksDuplicate(t *testing.T) {
	db := newIndexTestDB(t)

	u1 := seedUser(t, db, models.CoachRole, "a@gmail.com")
	u2 := seedUser(t, db, models.CoachRole, "b@gmail.com")

	mustCreate(t, db, &models.Coach{UserID: u1, Uid: "1234567890123", PersonalQRCode: "QR_1"})

	dup := models.Coach{UserID: u2, Uid: "1234567890123", PersonalQRCode: "QR_2"}
	if err := db.Create(&dup).Error; err == nil {
		t.Fatal("เลขบัตรซ้ำกับโค้ชที่ยังทำงานอยู่ต้องสร้างไม่ได้ แต่ db ยอมให้สร้าง")
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// ด้านที่ 2 — ลบแล้วต้องใช้ค่าเดิมซ้ำได้
// ─────────────────────────────────────────────────────────────────────────────

// สถานการณ์จริง: โค้ชลาออก แอดมินกดลบ ผ่านไปครึ่งปีโค้ชกลับมาทำงานใหม่
// แอดมินต้องรับกลับเข้าระบบด้วยอีเมลกับเลขบัตรใบเดิมได้
//
// ก่อนแก้ ตรงนี้เด้ง SQLSTATE 23505 ออกมาเป็น error 500 ดิบ ๆ
// เพราะแถวที่ soft delete ไปแล้วยังจองค่าไว้อยู่
func TestDeletedCoachCanBeRehiredWithSameIdentity(t *testing.T) {
	db := newIndexTestDB(t)
	actor := seedUser(t, db, models.AdminRole, "actor@gmail.com")

	const email = "somchai@gmail.com"
	const idCard = "1234567890123"

	oldUser := seedUser(t, db, models.CoachRole, email)
	oldCoach := models.Coach{UserID: oldUser, Uid: idCard, PersonalQRCode: "QR_old"}
	mustCreate(t, db, &oldCoach)

	if err := NewCoachService(db).Delete(oldCoach.ID, actor); err != nil {
		t.Fatalf("ลบโค้ชควรผ่าน แต่ได้: %v", err)
	}

	// รับกลับเข้ามาใหม่ด้วยตัวตนเดิม
	newUser := models.User{
		Role: models.CoachRole, FirstName: "สมชาย", LastName: "กลับมาแล้ว",
		Email: email, Password: "hashed",
	}
	if err := db.Create(&newUser).Error; err != nil {
		t.Fatalf("สมัครด้วยอีเมลเดิมหลังถูกลบควรผ่าน แต่ได้: %v", err)
	}

	newCoach := models.Coach{UserID: newUser.ID, Uid: idCard, PersonalQRCode: "QR_new"}
	if err := db.Create(&newCoach).Error; err != nil {
		t.Fatalf("สมัครด้วยเลขบัตรเดิมหลังถูกลบควรผ่าน แต่ได้: %v", err)
	}

	// โปรไฟล์ใหม่ต้องเป็นคนละแถวกับของเก่า ประวัติเก่าจึงไม่ถูกเขียนทับ
	if newCoach.ID == oldCoach.ID {
		t.Fatal("ต้องได้โปรไฟล์ใหม่คนละแถว ไม่ใช่ไปทับแถวเดิม")
	}

	// แถวเก่ายังต้องอยู่ให้ join หาประวัติย้อนหลังได้
	var archived models.Coach
	if err := db.Unscoped().First(&archived, oldCoach.ID).Error; err != nil {
		t.Fatalf("โปรไฟล์เก่าต้องยังอยู่ในฐานให้ตรวจย้อนหลังได้ แต่ได้: %v", err)
	}
	if !archived.DeletedAt.Valid {
		t.Error("โปรไฟล์เก่าต้องยังคงสถานะถูกลบไว้")
	}
}

// ลบ–สมัครใหม่–ลบอีก วนได้เรื่อย ๆ ไม่ใช่ใช้ซ้ำได้แค่รอบเดียว
//
// จุดที่พลาดได้: ถ้าเขียน index เป็น unique ธรรมดาบน (email, deleted_at)
// แทนที่จะเป็น partial index จะผ่านรอบแรกแล้วไปพังรอบสอง
// เพราะแถวที่ลบแล้วสองแถวมี deleted_at คนละค่ากันก็จริง แต่พอลบพร้อมกัน
// ในวินาทีเดียวกันจะชนทันที
func TestIdentityCanBeReusedRepeatedly(t *testing.T) {
	db := newIndexTestDB(t)
	actor := seedUser(t, db, models.AdminRole, "actor@gmail.com")

	const email = "revolving@gmail.com"
	const idCard = "9999999999999"

	for round := 1; round <= 3; round++ {
		user := models.User{
			Role: models.CoachRole, FirstName: "วนรอบ", LastName: "ที่",
			Email: email, Password: "hashed",
		}
		if err := db.Create(&user).Error; err != nil {
			t.Fatalf("รอบที่ %d: สมัครไม่สำเร็จ: %v", round, err)
		}

		coach := models.Coach{
			UserID: user.ID, Uid: idCard,
			PersonalQRCode: "QR_round_" + string(rune('0'+round)),
		}
		if err := db.Create(&coach).Error; err != nil {
			t.Fatalf("รอบที่ %d: สร้างโปรไฟล์โค้ชไม่สำเร็จ: %v", round, err)
		}

		if err := NewCoachService(db).Delete(coach.ID, actor); err != nil {
			t.Fatalf("รอบที่ %d: ลบไม่สำเร็จ: %v", round, err)
		}
	}
}

// ระหว่างที่คนเดิมยังไม่ถูกลบ ห้ามสมัครซ้ำ — กันเคสที่แอดมินเผลอเพิ่มคนเดิมสองครั้ง
// (ต่างจากเทสด้านบนตรงที่ตรวจว่า "ยังไม่ลบ" ไม่ใช่ "ลบแล้ว")
func TestRehireBlockedWhileStillActive(t *testing.T) {
	db := newIndexTestDB(t)

	const email = "active@gmail.com"
	seedUser(t, db, models.CoachRole, email)

	again := models.User{
		Role: models.CoachRole, FirstName: "เพิ่ม", LastName: "ซ้ำ",
		Email: email, Password: "hashed",
	}
	if err := db.Create(&again).Error; err == nil {
		t.Fatal("คนเดิมที่ยังทำงานอยู่ต้องเพิ่มซ้ำไม่ได้")
	}
}
