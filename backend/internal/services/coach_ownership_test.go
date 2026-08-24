package services

import (
	"errors"
	"testing"

	"CPE-691015/internal/models"

	"gorm.io/gorm"
)

// เทสชุดนี้คุมสองด่านที่หน้าตาคล้ายกันมากแต่ทำงานต่างกัน
//
//	VerifyCoachOwnership — เจ้าของ "หรือ" แอดมิน ผ่านได้
//	VerifyCoachSelf      — เจ้าของเท่านั้น แอดมินก็ไม่ผ่าน
//
// ความต่างอยู่ที่บรรทัดเดียว (admin ผ่าน vs admin ไม่ผ่าน) ซึ่งสลับกันได้ง่ายมาก
// ตอนแก้โค้ด ถ้าสลับผิดทาง:
//
//	ใช้ Ownership แทน Self  → แอดมินเปลี่ยนบัญชีธนาคารโค้ชได้โดยไม่ต้องรู้รหัสผ่าน
//	ใช้ Self แทน Ownership  → แอดมินแก้ข้อมูลโค้ชไม่ได้เลย ระบบใช้งานไม่ได้จริง

// seedCoachFor สร้างโค้ชผูกกับ users.id ที่ระบุ แล้วคืน coaches.id
//
// ⚠️ สองค่านี้คนละชุดเลข จงใจให้ต่างกันในเทส (user 100 → coach id อีกเลข)
// เพื่อจับกรณีที่โค้ดเผลอเอา userID ไปเทียบกับ coachID ตรง ๆ
//
// ต้องตั้ง PersonalQRCode ให้ไม่ซ้ำทุกครั้ง เพราะคอลัมน์นี้เป็น unique
// ถ้าปล่อยว่างไว้ โค้ชคนที่สองจะชนกับคนแรกทันที (ค่าว่างก็เป็นค่าหนึ่ง)
func seedCoachFor(t *testing.T, db *gorm.DB, userID uint, uid string) uint {
	t.Helper()

	coach := models.Coach{
		UserID:         userID,
		Uid:            uid,
		PersonalQRCode: "QR_test_" + uid,
	}
	if err := db.Create(&coach).Error; err != nil {
		t.Fatalf("สร้างโค้ชไม่สำเร็จ: %v", err)
	}
	return coach.ID
}

// ─────────────────────────────────────────────────────────────────────────────
// VerifyCoachOwnership — เจ้าของหรือแอดมิน
// ─────────────────────────────────────────────────────────────────────────────

func TestVerifyCoachOwnership(t *testing.T) {
	db := newTestDB(t, &models.Coach{})

	// สร้างโค้ชสองคน คนละ user
	coachA := seedCoachFor(t, db, 100, "uid-a")
	coachB := seedCoachFor(t, db, 200, "uid-b")

	t.Run("เจ้าของแก้ของตัวเองได้", func(t *testing.T) {
		if err := VerifyCoachOwnership(db, coachA, 100, "coach"); err != nil {
			t.Fatalf("ควรผ่าน แต่ได้: %v", err)
		}
	})

	t.Run("โค้ชแก้ของโค้ชคนอื่นไม่ได้", func(t *testing.T) {
		err := VerifyCoachOwnership(db, coachB, 100, "coach")
		if !errors.Is(err, ErrCoachForbidden) {
			t.Fatalf("ควรได้ ErrCoachForbidden แต่ได้: %v", err)
		}
	})

	t.Run("แอดมินแก้ของใครก็ได้", func(t *testing.T) {
		if err := VerifyCoachOwnership(db, coachA, 999, "admin"); err != nil {
			t.Fatalf("แอดมินควรผ่าน แต่ได้: %v", err)
		}
	})

	t.Run("ผู้ใช้ที่ไม่มีโปรไฟล์โค้ชเข้าไม่ได้", func(t *testing.T) {
		err := VerifyCoachOwnership(db, coachA, 777, "customer")
		if !errors.Is(err, ErrCoachForbidden) {
			t.Fatalf("ควรได้ ErrCoachForbidden แต่ได้: %v", err)
		}
	})
}

// ⚠️ เทสสำคัญที่สุดของไฟล์นี้
//
// coachID ที่มาจาก URL กับ userID ที่มาจาก JWT เป็นคนละชุดเลข
// ถ้าโค้ดเผลอเทียบสองค่านี้ตรง ๆ (userID == coachID) จะเกิดช่องโหว่ที่
// โค้ชคนหนึ่งแก้ข้อมูลของอีกคนได้ เมื่อบังเอิญเลขตรงกัน
func TestVerifyCoachOwnershipDoesNotCompareUserIDToCoachID(t *testing.T) {
	db := newTestDB(t, &models.Coach{})

	// โค้ชทุกคนในเทสนี้ผูกกับ users.id ช่วง 500+ ส่วน coaches.id จะเริ่มที่ 1
	// เลขสองชุดนี้จึงไม่มีทางตรงกันโดยบังเอิญ
	seedCoachFor(t, db, 500, "uid-1")
	seedCoachFor(t, db, 501, "uid-2")
	victim := seedCoachFor(t, db, 502, "uid-3")

	// จำลองคนร้ายที่ userID บังเอิญเท่ากับ coaches.id ของเหยื่อพอดี
	// (คนนี้ไม่มีโปรไฟล์โค้ชเลย เพราะโค้ชทุกคนผูกกับ user 500+)
	//
	// ถ้าโค้ดเทียบ userID == coachID ตรง ๆ เทสนี้จะผ่านด่านไปได้ทันที
	err := VerifyCoachOwnership(db, victim, victim, "coach")
	if !errors.Is(err, ErrCoachForbidden) {
		t.Fatalf("user %d ไม่มีโปรไฟล์โค้ช ต้องถูกปฏิเสธ แต่ได้: %v", victim, err)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// VerifyCoachSelf — เจ้าของเท่านั้น แอดมินก็ไม่ผ่าน
// ─────────────────────────────────────────────────────────────────────────────

func TestVerifyCoachSelf(t *testing.T) {
	db := newTestDB(t, &models.Coach{})

	coachA := seedCoachFor(t, db, 100, "uid-a")
	coachB := seedCoachFor(t, db, 200, "uid-b")

	t.Run("เจ้าของผ่าน", func(t *testing.T) {
		if err := VerifyCoachSelf(db, coachA, 100, "coach"); err != nil {
			t.Fatalf("ควรผ่าน แต่ได้: %v", err)
		}
	})

	t.Run("โค้ชคนอื่นไม่ผ่าน", func(t *testing.T) {
		err := VerifyCoachSelf(db, coachB, 100, "coach")
		if !errors.Is(err, ErrCoachForbidden) {
			t.Fatalf("ควรได้ ErrCoachForbidden แต่ได้: %v", err)
		}
	})

	// นี่คือความต่างจาก VerifyCoachOwnership
	//
	// ใช้กับการเปลี่ยนบัญชีรับเงิน ซึ่งต้องยืนยันรหัสผ่านด้วย
	// แอดมินไม่รู้รหัสผ่านโค้ชอยู่แล้ว จึงไม่ควรผ่านด่านนี้ตั้งแต่ต้น
	t.Run("แอดมินไม่ผ่าน", func(t *testing.T) {
		err := VerifyCoachSelf(db, coachA, 999, "admin")
		if !errors.Is(err, ErrCoachSelfOnly) {
			t.Fatalf("แอดมินต้องได้ ErrCoachSelfOnly แต่ได้: %v", err)
		}
	})
}

// สองด่านนี้ต้องให้ผลต่างกันกับแอดมินเสมอ
//
// ถ้าเทสนี้พัง = มีคนทำให้สองฟังก์ชันทำงานเหมือนกัน ซึ่งแปลว่า
// ด่านใดด่านหนึ่งกำลังทำงานผิดหน้าที่อยู่
func TestOwnershipAndSelfDifferForAdmin(t *testing.T) {
	db := newTestDB(t, &models.Coach{})
	coachID := seedCoachFor(t, db, 100, "uid-a")

	ownershipErr := VerifyCoachOwnership(db, coachID, 999, "admin")
	selfErr := VerifyCoachSelf(db, coachID, 999, "admin")

	if ownershipErr != nil {
		t.Fatalf("VerifyCoachOwnership ต้องให้แอดมินผ่าน แต่ได้: %v", ownershipErr)
	}
	if selfErr == nil {
		t.Fatal("VerifyCoachSelf ต้องไม่ให้แอดมินผ่าน แต่ผ่านไปได้")
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// ResolveCustomerID
// ─────────────────────────────────────────────────────────────────────────────

// ⚠️ users.id กับ customers.id เป็นคนละชุดเลข
//
// ถ้าเอา users.id ไปใช้แทน customers.id (หรือกลับกัน) จะเกิดช่องโหว่ที่
// ผู้เรียนคนหนึ่งเห็นข้อมูลของอีกคนได้ ตอนที่เลขบังเอิญตรงกัน
func TestResolveCustomerID(t *testing.T) {
	db := newTestDB(t, &models.Customer{})

	// สร้างผู้เรียนสองคนให้ customers.id ไม่ตรงกับ users.id
	db.Create(&models.Customer{UserID: 900, Gender: models.GenderMale, PersonalQRCode: "q1"})
	second := models.Customer{UserID: 901, Gender: models.GenderMale, PersonalQRCode: "q2"}
	db.Create(&second)

	got, err := ResolveCustomerID(db, 901)
	if err != nil {
		t.Fatalf("ควรหาเจอ แต่ได้: %v", err)
	}
	if got != second.ID {
		t.Fatalf("ควรได้ customers.id = %d แต่ได้ %d", second.ID, got)
	}
	if got == 901 {
		t.Fatal("คืน users.id มาแทน customers.id — สองค่านี้ต้องไม่ปนกัน")
	}
}

// ผู้ใช้ที่ไม่มีโปรไฟล์ผู้เรียนต้อง error ไม่ใช่คืน 0
//
// ถ้าคืน 0 เงียบ ๆ โค้ดที่เรียกต่อจะไปค้นด้วย customer_id = 0
// ซึ่งอาจไปเจอข้อมูลของใครสักคนโดยไม่ตั้งใจ
func TestResolveCustomerIDNotFound(t *testing.T) {
	db := newTestDB(t, &models.Customer{})

	id, err := ResolveCustomerID(db, 12345)
	if !errors.Is(err, ErrCustomerProfileNotFound) {
		t.Fatalf("ควรได้ ErrCustomerProfileNotFound แต่ได้: %v", err)
	}
	if id != 0 {
		t.Fatalf("ตอน error ควรคืน 0 แต่ได้ %d", id)
	}
}
