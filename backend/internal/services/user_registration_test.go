package services

import (
	"testing"
	"time"

	"CPE-691015/internal/models"

	"gorm.io/gorm"
)

// เทสชุดนี้คุมบั๊กที่เจอจริง: สมัครด้วยอีเมลผิด/ปลอมแล้ว OTP ไปไม่ถึง บัญชีที่ยัง unverified
// จะค้างอยู่ถาวร "จอง" อีเมลนั้นไว้ตลอดกาล เพราะ CreateUser เดิมเช็คแค่ "มีอีเมลนี้อยู่แล้วไหม"
// ไม่ได้แยกว่า verify แล้วหรือยัง

func newRegistrationTestDB(t *testing.T) *gorm.DB {
	return newTestDB(t,
		&models.User{}, &models.Customer{}, &models.Coach{}, &models.EmailVerificationOTP{},
	)
}

// newRegisterableUser คือ user ที่ผ่านทุกกติกาของ CreateUser (รหัสผ่าน/อีเมล/วันเกิด)
// เหลือแค่ปรับ Email/Role/Customer ตามที่แต่ละเทสต้องการ
func newRegisterableUser(email string) *models.User {
	return &models.User{
		Role:      models.CustomerRole,
		FirstName: "ทดสอบ",
		LastName:  "สมัคร",
		Email:     email,
		Password:  "password123", // ผ่าน ValidatePasswordStrength (>=8 ตัว มีเลข)
		Customer:  &models.Customer{Nickname: "u", Gender: models.GenderMale, PhoneNumber: "0800000000"},
	}
}

// สมัครด้วยอีเมลที่มีบัญชีเดิม "ยังไม่ verify" ค้างอยู่ — ต้องลบของเก่าทิ้งแล้วสร้างใหม่แทนที่
// ไม่ใช่บล็อกด้วย "บัญชีผู้ใช้นี้มีอยู่แล้ว" (พฤติกรรมเดิมที่ทำให้อีเมลถูกจองค้างถาวรไม่มีทางแก้เอง)
func TestCreateUserReplacesUnverifiedDuplicateEmail(t *testing.T) {
	db := newRegistrationTestDB(t)
	svc := NewUserService(db)

	const email = "typo@example.com"

	// สมัครครั้งแรก (จำลองพิมพ์อีเมลผิด) — ยังไม่ verify
	first := newRegisterableUser(email)
	if err := svc.CreateUser(first); err != nil {
		t.Fatalf("สมัครครั้งแรกควรผ่าน แต่ได้: %v", err)
	}
	firstUserID := first.ID

	// มี OTP ค้างอยู่จากการสมัครครั้งแรก (จำลองสิ่งที่ SendOTP สร้างไว้)
	db.Create(&models.EmailVerificationOTP{
		UserID: firstUserID, CodeHash: "hash", ExpiresAt: time.Now().Add(10 * time.Minute),
	})

	// สมัครซ้ำด้วยอีเมลเดียวกัน (แก้ไขแล้ว หรือเจ้าของอีเมลจริงมาสมัคร)
	second := newRegisterableUser(email)
	if err := svc.CreateUser(second); err != nil {
		t.Fatalf("สมัครซ้ำด้วยอีเมลที่ยังไม่ verify ควรผ่าน (แทนที่บัญชีเก่า) แต่ได้: %v", err)
	}

	if second.ID == firstUserID {
		t.Fatalf("ควรได้ user ใหม่คนละ id กับของเดิม แต่ id เดิมซ้ำกัน")
	}

	var userCount int64
	db.Model(&models.User{}).Where("email = ?", email).Count(&userCount)
	if userCount != 1 {
		t.Fatalf("ควรเหลือ user แค่แถวเดียวสำหรับอีเมลนี้ แต่เหลือ %d แถว", userCount)
	}

	var oldUserExists int64
	db.Model(&models.User{}).Where("id = ?", firstUserID).Count(&oldUserExists)
	if oldUserExists != 0 {
		t.Fatalf("บัญชีเก่าที่ไม่เคย verify ควรถูกลบทิ้งไปแล้ว แต่ยังอยู่")
	}

	var otpCount int64
	db.Model(&models.EmailVerificationOTP{}).Where("user_id = ?", firstUserID).Count(&otpCount)
	if otpCount != 0 {
		t.Fatalf("แถว OTP ของบัญชีเก่าควรถูกลบไปด้วย แต่ยังเหลือ %d แถว", otpCount)
	}

	var customerCount int64
	db.Model(&models.Customer{}).Where("user_id = ?", firstUserID).Count(&customerCount)
	if customerCount != 0 {
		t.Fatalf("โปรไฟล์ customer ของบัญชีเก่าควรถูกลบไปด้วย แต่ยังเหลือ %d แถว", customerCount)
	}
}

// สมัครด้วยอีเมลที่มีบัญชีเดิม "verify แล้ว" ค้างอยู่ — ต้องบล็อกเหมือนเดิม ห้ามลบบัญชีจริงทิ้ง
func TestCreateUserBlocksVerifiedDuplicateEmail(t *testing.T) {
	db := newRegistrationTestDB(t)
	svc := NewUserService(db)

	const email = "real@example.com"

	first := newRegisterableUser(email)
	if err := svc.CreateUser(first); err != nil {
		t.Fatalf("สมัครครั้งแรกควรผ่าน แต่ได้: %v", err)
	}
	now := time.Now()
	if err := db.Model(&models.User{}).Where("id = ?", first.ID).Update("email_verified_at", now).Error; err != nil {
		t.Fatalf("ปรับสถานะ verify ไม่สำเร็จ: %v", err)
	}

	second := newRegisterableUser(email)
	err := svc.CreateUser(second)
	if err == nil {
		t.Fatalf("สมัครซ้ำด้วยอีเมลที่ verify แล้วควรถูกบล็อก แต่ผ่านไปได้")
	}

	var userCount int64
	db.Model(&models.User{}).Where("email = ?", email).Count(&userCount)
	if userCount != 1 {
		t.Fatalf("บัญชีจริงที่ verify แล้วต้องไม่ถูกแตะต้อง แต่จำนวนแถวเปลี่ยนเป็น %d", userCount)
	}
}

// job ลบบัญชีที่ไม่เคย verify เกิน 1 ชั่วโมง — ต้องลบเฉพาะที่เกินเวลาจริง ๆ ไม่แตะคนที่เพิ่งสมัคร
// หรือคนที่ verify แล้ว ไม่ว่าจะสมัครมานานแค่ไหนก็ตาม
func TestDeleteUnverifiedUsers(t *testing.T) {
	db := newRegistrationTestDB(t)
	svc := NewUserService(db)

	seedAt := func(email string, verified bool, createdAt time.Time) uint {
		u := newRegisterableUser(email)
		if err := svc.CreateUser(u); err != nil {
			t.Fatalf("สร้างผู้ใช้ทดสอบไม่สำเร็จ: %v", err)
		}
		if err := db.Model(&models.User{}).Where("id = ?", u.ID).UpdateColumn("created_at", createdAt).Error; err != nil {
			t.Fatalf("ปรับ created_at ไม่สำเร็จ: %v", err)
		}
		if verified {
			now := time.Now()
			if err := db.Model(&models.User{}).Where("id = ?", u.ID).Update("email_verified_at", now).Error; err != nil {
				t.Fatalf("ปรับสถานะ verify ไม่สำเร็จ: %v", err)
			}
		}
		return u.ID
	}

	staleUnverified := seedAt("stale@example.com", false, time.Now().Add(-2*time.Hour))
	recentUnverified := seedAt("recent@example.com", false, time.Now().Add(-10*time.Minute))
	staleVerified := seedAt("stale-verified@example.com", true, time.Now().Add(-2*time.Hour))

	deleted, err := svc.DeleteUnverifiedUsers(1 * time.Hour)
	if err != nil {
		t.Fatalf("ควรผ่าน แต่ได้: %v", err)
	}
	if deleted != 1 {
		t.Fatalf("ควรลบแค่บัญชีที่ไม่ verify และเกิน 1 ชม. 1 บัญชี แต่ลบไป %d", deleted)
	}

	exists := func(id uint) bool {
		var n int64
		db.Model(&models.User{}).Where("id = ?", id).Count(&n)
		return n > 0
	}

	if exists(staleUnverified) {
		t.Errorf("บัญชีที่ไม่ verify เกิน 1 ชม. ควรถูกลบ แต่ยังอยู่")
	}
	if !exists(recentUnverified) {
		t.Errorf("บัญชีที่เพิ่งสมัคร (ยังไม่เกิน 1 ชม.) ไม่ควรถูกลบ แต่หายไป")
	}
	if !exists(staleVerified) {
		t.Errorf("บัญชีที่ verify แล้วไม่ควรถูกลบไม่ว่าจะสมัครมานานแค่ไหน แต่หายไป")
	}
}
