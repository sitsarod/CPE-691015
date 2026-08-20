package services

import (
	"fmt"
	"strings"
	"testing"

	"CPE-691015/internal/models"
)

// newTestCustomer สร้าง Customer ตัวอย่างที่ผ่านข้อบังคับของตาราง
//
// ต้องกำหนด Gender เสมอ เพราะคอลัมน์นี้มี CHECK constraint
// gender IN ('male','female') ค่าว่างจะถูกปฏิเสธตั้งแต่ตอน INSERT
func newTestCustomer(userID uint, qrCode string) *models.Customer {
	return &models.Customer{
		UserID:         userID,
		PersonalQRCode: qrCode,
		Gender:         models.GenderMale,
	}
}

// newTestCoach สร้าง Coach ตัวอย่างที่ผ่านข้อบังคับของตาราง
//
// ต้องกำหนด Uid ให้ไม่ซ้ำ เพราะคอลัมน์นี้เป็น unique
// ถ้าปล่อยว่างแล้วสร้างหลายคน ค่าว่างจะชนกันเองตั้งแต่คนที่สอง
func newTestCoach(userID uint, qrCode string) *models.Coach {
	return &models.Coach{
		UserID:         userID,
		PersonalQRCode: qrCode,
		Uid:            fmt.Sprintf("UID%06d", userID),
	}
}

// TestQRTokenFormat ตรวจว่ารหัสที่สุ่มออกมามีรูปแบบตามที่ตกลงไว้
// (ขึ้นต้นด้วย QR_ และมีความยาวคงที่ เพื่อให้ฝั่งสแกนตั้งกฎ validate ได้)
func TestQRTokenFormat(t *testing.T) {
	code, err := newQRToken()
	if err != nil {
		t.Fatalf("สุ่มรหัสไม่สำเร็จ: %v", err)
	}

	if !strings.HasPrefix(code, QRCodePrefix) {
		t.Errorf("รหัสต้องขึ้นต้นด้วย %q แต่ได้ %q", QRCodePrefix, code)
	}

	// 16 ไบต์ เข้ารหัส base64 แบบไม่มี padding = 22 ตัวอักษร บวกคำนำหน้า "QR_" อีก 3 = 25
	const wantLen = len(QRCodePrefix) + 22
	if len(code) != wantLen {
		t.Errorf("ความยาวรหัสควรเป็น %d แต่ได้ %d (%q)", wantLen, len(code), code)
	}

	// base64 แบบ URL-safe ต้องไม่มี + / = ที่ทำให้ QR ยาวขึ้นหรือหลุดตอนใส่ใน URL
	if strings.ContainsAny(code, "+/=") {
		t.Errorf("รหัสต้องไม่มีอักขระ + / = แต่ได้ %q", code)
	}
}

// TestQRTokenIsRandom ตรวจว่ารหัสสุ่มจริง ไม่ซ้ำกันเอง
//
// นี่คือหัวใจของการแก้ช่องโหว่เดิม ถ้าเทสนี้พังแปลว่ามีคนเปลี่ยนกลับไปใช้
// ค่าที่คำนวณได้ (เช่นจากอีเมล) หรือเผลอเปลี่ยนไปใช้ math/rand
func TestQRTokenIsRandom(t *testing.T) {
	const n = 5000
	seen := make(map[string]bool, n)

	for i := 0; i < n; i++ {
		code, err := newQRToken()
		if err != nil {
			t.Fatalf("สุ่มรหัสไม่สำเร็จที่รอบ %d: %v", i, err)
		}
		if seen[code] {
			t.Fatalf("สุ่มได้รหัสซ้ำที่รอบ %d: %q — แปลว่าไม่ได้สุ่มจริง", i, code)
		}
		seen[code] = true
	}
}

// TestQRNotDerivedFromEmail ตรวจว่ารหัสไม่มีร่องรอยของอีเมลอยู่ข้างใน
//
// จำลองช่องโหว่เดิมโดยตรง: เดิมรหัสคือ "QR_" + อีเมล ทำให้ใครรู้อีเมล
// ก็สร้างรหัสของคนนั้นได้ เทสนี้กันไม่ให้ใครเผลอทำแบบนั้นอีก
func TestQRNotDerivedFromEmail(t *testing.T) {
	db := newTestDB(t, &models.Customer{}, &models.Coach{})
	const email = "student1@gmail.com"

	code, err := GenerateUniqueQRCode(db)
	if err != nil {
		t.Fatalf("สร้างรหัสไม่สำเร็จ: %v", err)
	}

	if code == QRCodePrefix+email {
		t.Fatal("รหัสยังเป็น QR_ + อีเมล — ช่องโหว่เดิมกลับมาแล้ว")
	}
	if strings.Contains(strings.ToLower(code), "student1") ||
		strings.Contains(strings.ToLower(code), "gmail") {
		t.Errorf("รหัสไม่ควรมีส่วนของอีเมลปนอยู่ แต่ได้ %q", code)
	}
}

// TestQRUniqueAcrossBothTables ตรวจว่ารหัสไม่ชนกับที่ถูกใช้ไปแล้ว
// ทั้งในตารางนักเรียนและตารางโค้ช (ใช้ namespace ร่วมกัน)
func TestQRUniqueAcrossBothTables(t *testing.T) {
	db := newTestDB(t, &models.Customer{}, &models.Coach{})

	const takenByCustomer = "QR_taken_by_customer"
	const takenByCoach = "QR_taken_by_coach"

	if err := db.Create(newTestCustomer(1, takenByCustomer)).Error; err != nil {
		t.Fatalf("สร้างนักเรียนตัวอย่างไม่สำเร็จ: %v", err)
	}
	if err := db.Create(newTestCoach(2, takenByCoach)).Error; err != nil {
		t.Fatalf("สร้างโค้ชตัวอย่างไม่สำเร็จ: %v", err)
	}

	taken, err := qrCodeTaken(db, takenByCustomer)
	if err != nil {
		t.Fatalf("เช็ครหัสซ้ำไม่สำเร็จ: %v", err)
	}
	if !taken {
		t.Error("รหัสที่นักเรียนใช้อยู่แล้ว ต้องถูกรายงานว่าซ้ำ")
	}

	taken, err = qrCodeTaken(db, takenByCoach)
	if err != nil {
		t.Fatalf("เช็ครหัสซ้ำไม่สำเร็จ: %v", err)
	}
	if !taken {
		t.Error("รหัสที่โค้ชใช้อยู่แล้ว ต้องถูกรายงานว่าซ้ำ (namespace ต้องใช้ร่วมกัน)")
	}

	taken, err = qrCodeTaken(db, "QR_never_used_before")
	if err != nil {
		t.Fatalf("เช็ครหัสซ้ำไม่สำเร็จ: %v", err)
	}
	if taken {
		t.Error("รหัสที่ยังไม่มีใครใช้ ต้องไม่ถูกรายงานว่าซ้ำ")
	}
}

// TestQRTakenIncludesSoftDeleted ตรวจว่ารหัสของคนที่ถูกลบไปแล้วยังถูกนับว่าใช้อยู่
//
// สำคัญเพราะ personal_qr_code เป็น unique ที่ระดับฐานข้อมูล และ soft delete
// ไม่ได้ลบแถวจริง ถ้าไม่นับรวมจะสุ่มได้ค่าซ้ำแล้วไปพังตอน INSERT แทน
func TestQRTakenIncludesSoftDeleted(t *testing.T) {
	db := newTestDB(t, &models.Customer{}, &models.Coach{})

	c := *newTestCustomer(1, "QR_soft_deleted")
	if err := db.Create(&c).Error; err != nil {
		t.Fatalf("สร้างนักเรียนตัวอย่างไม่สำเร็จ: %v", err)
	}
	if err := db.Delete(&c).Error; err != nil {
		t.Fatalf("ลบนักเรียนตัวอย่างไม่สำเร็จ: %v", err)
	}

	taken, err := qrCodeTaken(db, "QR_soft_deleted")
	if err != nil {
		t.Fatalf("เช็ครหัสซ้ำไม่สำเร็จ: %v", err)
	}
	if !taken {
		t.Error("รหัสของคนที่ถูก soft delete ต้องยังนับว่าใช้อยู่")
	}
}

// TestReissueChangesCode ตรวจว่าการออกใบใหม่เปลี่ยนค่าจริง และค่าเดิมใช้ไม่ได้อีก
func TestReissueChangesCode(t *testing.T) {
	db := newTestDB(t, &models.Customer{}, &models.Coach{})

	first, err := GenerateUniqueQRCode(db)
	if err != nil {
		t.Fatalf("สร้างรหัสไม่สำเร็จ: %v", err)
	}
	c := *newTestCustomer(1, first)
	if err := db.Create(&c).Error; err != nil {
		t.Fatalf("สร้างนักเรียนตัวอย่างไม่สำเร็จ: %v", err)
	}

	second, err := ReissueCustomerQRCode(db, c.ID)
	if err != nil {
		t.Fatalf("ออกใบใหม่ไม่สำเร็จ: %v", err)
	}
	if second == first {
		t.Fatal("ออกใบใหม่แล้วรหัสต้องเปลี่ยน")
	}

	var got models.Customer
	if err := db.First(&got, c.ID).Error; err != nil {
		t.Fatalf("อ่านนักเรียนกลับมาไม่สำเร็จ: %v", err)
	}
	if got.PersonalQRCode != second {
		t.Errorf("ค่าในฐานควรเป็น %q แต่ได้ %q", second, got.PersonalQRCode)
	}

	// รหัสเก่าต้องไม่ชี้ไปหาใครอีกแล้ว — ถ้ายังชี้ได้ แปลว่า QR ที่หลุดไปยังใช้เช็คชื่อได้อยู่
	var n int64
	if err := db.Model(&models.Customer{}).Where("personal_qr_code = ?", first).Count(&n).Error; err != nil {
		t.Fatalf("นับรหัสเก่าไม่สำเร็จ: %v", err)
	}
	if n != 0 {
		t.Error("รหัสเก่าต้องใช้ไม่ได้แล้วหลังออกใบใหม่")
	}
}

// TestReissueCoach ตรวจว่าออกใบใหม่ให้โค้ชได้เหมือนกัน
func TestReissueCoach(t *testing.T) {
	db := newTestDB(t, &models.Customer{}, &models.Coach{})

	first, err := GenerateUniqueQRCode(db)
	if err != nil {
		t.Fatalf("สร้างรหัสไม่สำเร็จ: %v", err)
	}
	coach := *newTestCoach(1, first)
	if err := db.Create(&coach).Error; err != nil {
		t.Fatalf("สร้างโค้ชตัวอย่างไม่สำเร็จ: %v", err)
	}

	second, err := ReissueCoachQRCode(db, coach.ID)
	if err != nil {
		t.Fatalf("ออกใบใหม่ให้โค้ชไม่สำเร็จ: %v", err)
	}
	if second == first {
		t.Fatal("ออกใบใหม่แล้วรหัสต้องเปลี่ยน")
	}
}

// TestReissueNotFound ตรวจว่าออกใบใหม่ให้ id ที่ไม่มีอยู่จริงต้องได้ error
// ไม่ใช่เงียบ ๆ ผ่านไป (กันบั๊กที่แอดมินกดออกใบใหม่ให้คนที่ถูกลบไปแล้ว)
func TestReissueNotFound(t *testing.T) {
	db := newTestDB(t, &models.Customer{}, &models.Coach{})

	if _, err := ReissueCustomerQRCode(db, 99999); err == nil {
		t.Error("ออกใบใหม่ให้ customer id ที่ไม่มีอยู่ ต้องได้ error")
	}
	if _, err := ReissueCoachQRCode(db, 99999); err == nil {
		t.Error("ออกใบใหม่ให้ coach id ที่ไม่มีอยู่ ต้องได้ error")
	}
}

// TestQRLookupIsUnambiguous ตรวจว่ารหัส 1 ใบชี้ไปหาคนได้คนเดียวเท่านั้น
//
// เป็นสมมติฐานที่ระบบเช็คชื่อจะพึ่งพา: สแกน 1 ครั้ง ต้องรู้แน่ชัดว่าใคร
func TestQRLookupIsUnambiguous(t *testing.T) {
	db := newTestDB(t, &models.Customer{}, &models.Coach{})

	const total = 50
	codes := make([]string, 0, total)

	for i := 0; i < total; i++ {
		code, err := GenerateUniqueQRCode(db)
		if err != nil {
			t.Fatalf("สร้างรหัสไม่สำเร็จ: %v", err)
		}
		// สลับกันสร้างนักเรียนกับโค้ชเพื่อให้รหัสกระจายอยู่ทั้งสองตาราง
		if i%2 == 0 {
			err = db.Create(newTestCustomer(uint(i+1), code)).Error
		} else {
			err = db.Create(newTestCoach(uint(i+1), code)).Error
		}
		if err != nil {
			t.Fatalf("สร้างข้อมูลตัวอย่างไม่สำเร็จ: %v", err)
		}
		codes = append(codes, code)
	}

	for _, code := range codes {
		var nCustomer, nCoach int64
		if err := db.Model(&models.Customer{}).Where("personal_qr_code = ?", code).Count(&nCustomer).Error; err != nil {
			t.Fatalf("ค้นหาในตารางนักเรียนไม่สำเร็จ: %v", err)
		}
		if err := db.Model(&models.Coach{}).Where("personal_qr_code = ?", code).Count(&nCoach).Error; err != nil {
			t.Fatalf("ค้นหาในตารางโค้ชไม่สำเร็จ: %v", err)
		}
		if nCustomer+nCoach != 1 {
			t.Errorf("รหัส %q ชี้ไปหา %d คน (ต้องเป็น 1 คนเท่านั้น)", code, nCustomer+nCoach)
		}
	}
}
