package services

import (
	"errors"
	"strings"
	"testing"
	"time"

	"CPE-691015/internal/models"

	"gorm.io/gorm"
)

// newDeleteTestDB สร้าง DB พร้อมทุกตารางที่การลบสมาชิกไปแตะ
func newDeleteTestDB(t *testing.T) *gorm.DB {
	return newTestDB(t, &models.User{}, &models.Customer{}, &models.Coach{},
		&models.FaceImage{}, &models.CoachAvailability{}, &models.WorkSchedule{})
}

// seedUser สร้างผู้ใช้หนึ่งคนตามบทบาทที่กำหนด แล้วคืน id
func seedUser(t *testing.T, db *gorm.DB, role models.UserRole, email string) uint {
	t.Helper()

	user := models.User{
		Role:      role,
		FirstName: "ทดสอบ",
		LastName:  string(role),
		Email:     email,
		Password:  "hashed",
	}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("สร้าง user ไม่สำเร็จ: %v", err)
	}
	return user.ID
}

// แอดมินคนสุดท้ายต้องลบไม่ได้
//
// ถ้าเทสนี้พัง = ลบแล้วจะไม่มีใครเข้าหน้าแอดมินได้อีกเลย
// และระบบยังไม่มีคำสั่งสร้างแอดมินจากเครื่อง (ข้อ 11 ในลิสต์) จึงกู้คืนไม่ได้
func TestDeleteUserBlocksLastAdmin(t *testing.T) {
	db := newDeleteTestDB(t)
	svc := NewUserService(db)

	lastAdmin := seedUser(t, db, models.AdminRole, "admin@gmail.com")
	actor := seedUser(t, db, models.AdminRole, "actor@gmail.com")

	// ลบ actor ก่อน เหลือ lastAdmin คนเดียว
	if err := svc.DeleteUser(actor, lastAdmin); err != nil {
		t.Fatalf("ลบแอดมินคนที่สองควรผ่าน แต่ได้ error: %v", err)
	}

	// ตอนนี้เหลือแอดมินคนเดียว ต้องลบไม่ได้
	// (ใช้ actor id ปลอมที่ไม่ใช่ตัวเอง เพื่อให้ไปชนด่าน "คนสุดท้าย" ไม่ใช่ด่าน "ลบตัวเอง")
	err := svc.DeleteUser(lastAdmin, 9999)
	if !errors.Is(err, ErrLastAdmin) {
		t.Fatalf("ควรได้ ErrLastAdmin แต่ได้: %v", err)
	}

	var count int64
	db.Model(&models.User{}).Where("role = ?", models.AdminRole).Count(&count)
	if count != 1 {
		t.Fatalf("แอดมินต้องยังอยู่ 1 คน แต่เหลือ %d", count)
	}
}

// ลบบัญชีตัวเองไม่ได้ แม้จะมีแอดมินคนอื่นเหลืออยู่ก็ตาม
func TestDeleteUserBlocksSelfDelete(t *testing.T) {
	db := newDeleteTestDB(t)
	svc := NewUserService(db)

	me := seedUser(t, db, models.AdminRole, "me@gmail.com")
	seedUser(t, db, models.AdminRole, "other@gmail.com")

	err := svc.DeleteUser(me, me)
	if !errors.Is(err, ErrDeleteSelf) {
		t.Fatalf("ควรได้ ErrDeleteSelf แต่ได้: %v", err)
	}
}

// มีแอดมินหลายคนต้องลบได้ตามปกติ — ด่านที่เพิ่มมาต้องไม่บล็อกการใช้งานปกติ
func TestDeleteUserAllowsAdminWhenOthersRemain(t *testing.T) {
	db := newDeleteTestDB(t)
	svc := NewUserService(db)

	actor := seedUser(t, db, models.AdminRole, "actor@gmail.com")
	target := seedUser(t, db, models.AdminRole, "target@gmail.com")
	seedUser(t, db, models.AdminRole, "spare@gmail.com")

	if err := svc.DeleteUser(target, actor); err != nil {
		t.Fatalf("ยังมีแอดมินเหลือ ควรลบได้ แต่ได้ error: %v", err)
	}
}

// ลบผู้เรียนแล้วแถว customers ต้องหายไปด้วย
//
// ถ้าเทสนี้พัง = ข้อมูลส่วนตัวของคนที่ถูกลบยังค้างอยู่ในฐานโดยไม่มีบัญชีเจ้าของ
// ซึ่งขัด PDPA เพราะเก็บข้อมูลไว้ทั้งที่ไม่มีฐานให้เก็บแล้ว
func TestDeleteUserRemovesCustomerProfile(t *testing.T) {
	db := newDeleteTestDB(t)
	svc := NewUserService(db)

	actor := seedUser(t, db, models.AdminRole, "actor@gmail.com")
	target := seedUser(t, db, models.CustomerRole, "student@gmail.com")

	if err := db.Create(&models.Customer{UserID: target, Gender: models.GenderMale}).Error; err != nil {
		t.Fatalf("สร้าง customer ไม่สำเร็จ: %v", err)
	}

	if err := svc.DeleteUser(target, actor); err != nil {
		t.Fatalf("ลบผู้เรียนควรผ่าน แต่ได้ error: %v", err)
	}

	var count int64
	db.Model(&models.Customer{}).Where("user_id = ?", target).Count(&count)
	if count != 0 {
		t.Fatalf("แถว customers ต้องถูกลบไปด้วย แต่ยังเหลือ %d แถว", count)
	}
}

// ลบโค้ชแล้วแถว coaches ต้องหายไปด้วย (แถวนี้เก็บเลขบัตรประชาชนและบัญชีธนาคาร)
func TestDeleteUserRemovesCoachProfile(t *testing.T) {
	db := newDeleteTestDB(t)
	svc := NewUserService(db)

	actor := seedUser(t, db, models.AdminRole, "actor@gmail.com")
	target := seedUser(t, db, models.CoachRole, "coach@gmail.com")

	coach := models.Coach{UserID: target, Uid: "1234567890123", BankAccount: "1112223334"}
	if err := db.Create(&coach).Error; err != nil {
		t.Fatalf("สร้าง coach ไม่สำเร็จ: %v", err)
	}

	if err := svc.DeleteUser(target, actor); err != nil {
		t.Fatalf("ลบโค้ชควรผ่าน แต่ได้ error: %v", err)
	}

	var count int64
	db.Model(&models.Coach{}).Where("user_id = ?", target).Count(&count)
	if count != 0 {
		t.Fatalf("แถว coaches ต้องถูกลบไปด้วย แต่ยังเหลือ %d แถว", count)
	}
}

// ลบโค้ชแล้วข้อมูลพ่วงต้องถูกจัดการให้ถูกประเภท
//
// ตารางพวกนี้ประกาศ constraint:OnDelete:CASCADE ไว้ในโมเดล แต่ cascade
// ไม่ทำงานเพราะเป็น soft delete (UPDATE ไม่ใช่ DELETE) เทสนี้จึงยืนยันว่า
// เราลบเองครบ ถ้าวันหนึ่งมีคนถอดโค้ดลบเองออกเพราะคิดว่า cascade จัดการให้แล้ว
// เทสนี้จะพังทันที
func TestDeleteUserCleansCoachRelatedData(t *testing.T) {
	db := newDeleteTestDB(t)
	svc := NewUserService(db)

	actor := seedUser(t, db, models.AdminRole, "actor@gmail.com")
	target := seedUser(t, db, models.CoachRole, "coach@gmail.com")

	coach := models.Coach{UserID: target, Uid: "1234567890123"}
	if err := db.Create(&coach).Error; err != nil {
		t.Fatalf("สร้าง coach ไม่สำเร็จ: %v", err)
	}

	// ภาพใบหน้า (ข้อมูลชีวภาพ) — ต้องหาย
	db.Create(&models.FaceImage{CoachID: &coach.ID, StorageKey: "faces/coach-delete-test", Pose: models.PoseFront, Status: models.FaceImageReady})
	// เวลาว่างประจำสัปดาห์ — ต้องหาย
	db.Create(&models.CoachAvailability{CoachID: coach.ID, DayOfWeek: "monday", StartTime: "09:00", EndTime: "12:00"})

	past := time.Now().AddDate(0, 0, -7).Format("2006-01-02")
	future := time.Now().AddDate(0, 0, 7).Format("2006-01-02")
	db.Create(&models.WorkSchedule{CoachID: coach.ID, CourseID: 1, Date: past, StartTime: "09:00", EndTime: "10:00"})
	db.Create(&models.WorkSchedule{CoachID: coach.ID, CourseID: 1, Date: future, StartTime: "09:00", EndTime: "10:00"})

	if err := svc.DeleteUser(target, actor); err != nil {
		t.Fatalf("ลบโค้ชควรผ่าน แต่ได้ error: %v", err)
	}

	assertCount := func(model any, want int64, label string) {
		t.Helper()
		var got int64
		db.Model(model).Where("coach_id = ?", coach.ID).Count(&got)
		if got != want {
			t.Fatalf("%s: ควรเหลือ %d แถว แต่เหลือ %d", label, want, got)
		}
	}

	assertCount(&models.FaceImage{}, 0, "ภาพใบหน้าเป็นข้อมูลชีวภาพ ต้องถูกลบตาม PDPA")
	assertCount(&models.CoachAvailability{}, 0, "เวลาว่างของโค้ชที่ออกไปแล้วต้องไม่ค้างในระบบ")

	// คาบในอนาคตต้องหาย แต่คาบที่ผ่านมาแล้วต้องอยู่ เพราะใช้คิดค่าจ้างย้อนหลัง
	assertCount(&models.WorkSchedule{}, 1, "ต้องเหลือเฉพาะคาบที่สอนไปแล้ว")

	var remaining models.WorkSchedule
	if err := db.Where("coach_id = ?", coach.ID).First(&remaining).Error; err != nil {
		t.Fatalf("ดึงคาบที่เหลือไม่สำเร็จ: %v", err)
	}

	// เทียบแค่ส่วน YYYY-MM-DD ไม่เทียบทั้งสตริง
	//
	// WorkSchedule.Date เป็น string ที่ประกาศ gorm:"type:date" ซึ่งแต่ละไดรเวอร์
	// คืนค่ากลับมาคนละรูปแบบ: sqlite (ที่ใช้ในเทส) ได้ "2026-08-10T00:00:00Z"
	// ส่วน postgres (ที่ใช้จริง) ได้ "2026-08-10" เฉย ๆ
	//
	// ไม่กระทบตรรกะการลบ เพราะเงื่อนไข date >= ? เทียบจากหัวสตริงเหมือนกัน
	// ทั้งสองรูปแบบ (ส่วน YYYY-MM-DD เรียงตามตัวอักษรแล้วได้ลำดับเวลาที่ถูกต้อง)
	if !strings.HasPrefix(remaining.Date, past) {
		t.Fatalf("คาบที่เหลือควรเป็นของวันที่ผ่านมาแล้ว (%s) แต่ได้ %s", past, remaining.Date)
	}
}

// ลบผู้เรียนแล้วภาพใบหน้าต้องหายไปด้วย
func TestDeleteUserRemovesCustomerFaceImages(t *testing.T) {
	db := newDeleteTestDB(t)
	svc := NewUserService(db)

	actor := seedUser(t, db, models.AdminRole, "actor@gmail.com")
	target := seedUser(t, db, models.CustomerRole, "student@gmail.com")

	customer := models.Customer{UserID: target, Gender: models.GenderMale}
	if err := db.Create(&customer).Error; err != nil {
		t.Fatalf("สร้าง customer ไม่สำเร็จ: %v", err)
	}
	db.Create(&models.FaceImage{CustomerID: &customer.ID, StorageKey: "faces/customer-delete-test", Pose: models.PoseFront, Status: models.FaceImageReady})

	if err := svc.DeleteUser(target, actor); err != nil {
		t.Fatalf("ลบผู้เรียนควรผ่าน แต่ได้ error: %v", err)
	}

	var count int64
	db.Model(&models.FaceImage{}).Where("customer_id = ?", customer.ID).Count(&count)
	if count != 0 {
		t.Fatalf("ภาพใบหน้าของผู้เรียนต้องถูกลบ แต่เหลือ %d แถว", count)
	}
}

// ลบผู้ใช้ที่ไม่มีอยู่ต้องได้ ErrRecordNotFound ไม่ใช่ลบอะไรมั่ว ๆ
func TestDeleteUserNotFound(t *testing.T) {
	db := newDeleteTestDB(t)
	svc := NewUserService(db)

	err := svc.DeleteUser(9999, 1)
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("ควรได้ ErrRecordNotFound แต่ได้: %v", err)
	}
}
