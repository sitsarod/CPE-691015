package services

import (
	"fmt"
	"testing"

	"CPE-691015/internal/models"

	"gorm.io/gorm"
)

// เทสชุดนี้คุมกติกาเดียว: หัวหน้าผู้ฝึกสอนมีได้คนเดียวทั้งระบบ
//
// เดิมหน้าแรกเดาจาก "ใครมาเป็นคนแรกในรายการ" ลำดับเปลี่ยนเมื่อไหร่คนอื่นก็กลายเป็น
// หัวหน้าโค้ชทันทีโดยไม่มีใครสั่ง ตอนนี้แอดมินติ๊กเอง จึงต้องกันไม่ให้ติ๊กได้หลายคน

func newHeadCoachTestDB(t *testing.T) *gorm.DB {
	return newTestDB(t, &models.User{}, &models.Coach{})
}

func seedHeadCoachFixture(t *testing.T, db *gorm.DB, n int) []uint {
	t.Helper()
	ids := make([]uint, 0, n)
	for i := 0; i < n; i++ {
		c := models.Coach{
			Nickname:       fmt.Sprintf("โค้ช%d", i+1),
			Uid:            fmt.Sprintf("head-uid-%d", i+1),
			PersonalQRCode: fmt.Sprintf("head-qr-%d", i+1),
			Status:         coachStatusActive,
		}
		mustCreate(t, db, &c)
		ids = append(ids, c.ID)
	}
	return ids
}

func headCoachIDs(t *testing.T, db *gorm.DB) []uint {
	t.Helper()
	var rows []models.Coach
	if err := db.Where("is_head_coach = ?", true).Order("id ASC").Find(&rows).Error; err != nil {
		t.Fatalf("อ่านรายชื่อหัวหน้าโค้ชไม่สำเร็จ: %v", err)
	}
	out := make([]uint, 0, len(rows))
	for _, r := range rows {
		out = append(out, r.ID)
	}
	return out
}

// ─── 1. ตั้งคนใหม่ต้องปลดคนเดิมให้เอง ───────────────────────────────────────

// ⚠️ ถ้าไม่ปลด หน้าแรกจะขึ้นป้าย HEAD COACH สองใบพร้อมกัน
func TestSetHeadCoachReplacesPrevious(t *testing.T) {
	db := newHeadCoachTestDB(t)
	svc := NewHomeContentService(db)
	ids := seedHeadCoachFixture(t, db, 3)

	if _, err := svc.SetHeadCoach(ids[0], true); err != nil {
		t.Fatalf("ตั้งหัวหน้าโค้ชคนแรกไม่สำเร็จ: %v", err)
	}
	if got := headCoachIDs(t, db); len(got) != 1 || got[0] != ids[0] {
		t.Fatalf("ต้องมีหัวหน้าโค้ชคนเดียวคือ %d แต่ได้ %v", ids[0], got)
	}

	// ตั้งคนที่สอง — คนแรกต้องถูกปลดอัตโนมัติ
	if _, err := svc.SetHeadCoach(ids[1], true); err != nil {
		t.Fatalf("ตั้งหัวหน้าโค้ชคนที่สองไม่สำเร็จ: %v", err)
	}

	got := headCoachIDs(t, db)
	if len(got) != 1 {
		t.Fatalf("ทั้งระบบต้องมีหัวหน้าโค้ชคนเดียว แต่ได้ %d คน (%v)", len(got), got)
	}
	if got[0] != ids[1] {
		t.Fatalf("หัวหน้าโค้ชต้องเป็นคนที่เพิ่งตั้ง (%d) แต่ได้ %d", ids[1], got[0])
	}
}

// ─── 2. ยกเลิกได้ และไม่ไปแตะคนอื่น ─────────────────────────────────────────

func TestSetHeadCoachCanBeCleared(t *testing.T) {
	db := newHeadCoachTestDB(t)
	svc := NewHomeContentService(db)
	ids := seedHeadCoachFixture(t, db, 2)

	if _, err := svc.SetHeadCoach(ids[0], true); err != nil {
		t.Fatalf("ตั้งหัวหน้าโค้ชไม่สำเร็จ: %v", err)
	}
	if _, err := svc.SetHeadCoach(ids[0], false); err != nil {
		t.Fatalf("ยกเลิกหัวหน้าโค้ชไม่สำเร็จ: %v", err)
	}

	if got := headCoachIDs(t, db); len(got) != 0 {
		t.Fatalf("ยกเลิกแล้วต้องไม่เหลือหัวหน้าโค้ช แต่ได้ %v", got)
	}
}

// ⚠️ ยกเลิกคนหนึ่งต้องไม่ไปปลดคนอื่นด้วย
func TestClearingHeadCoachDoesNotTouchOthers(t *testing.T) {
	db := newHeadCoachTestDB(t)
	svc := NewHomeContentService(db)
	ids := seedHeadCoachFixture(t, db, 2)

	if _, err := svc.SetHeadCoach(ids[0], true); err != nil {
		t.Fatalf("ตั้งหัวหน้าโค้ชไม่สำเร็จ: %v", err)
	}
	// สั่งยกเลิกกับคนที่ไม่ได้เป็นหัวหน้าอยู่แล้ว
	if _, err := svc.SetHeadCoach(ids[1], false); err != nil {
		t.Fatalf("สั่งยกเลิกกับคนที่ไม่ได้เป็นหัวหน้า ไม่ควรพัง แต่ได้: %v", err)
	}

	if got := headCoachIDs(t, db); len(got) != 1 || got[0] != ids[0] {
		t.Fatalf("หัวหน้าโค้ชเดิมต้องยังอยู่ (%d) แต่ได้ %v", ids[0], got)
	}
}

// ─── 3. หัวหน้าโค้ชต้องมาก่อนในรายการที่หน้าแรกใช้ ─────────────────────────

// การ์ดใบแรกของหน้าแรกเป็นตำแหน่งเด่น ถ้าเรียงตาม id เฉย ๆ หัวหน้าโค้ชที่ถูกเพิ่ม
// ทีหลังจะไปอยู่ท้ายแถว
func TestListCoachesPutsHeadCoachFirst(t *testing.T) {
	db := newHeadCoachTestDB(t)
	svc := NewHomeContentService(db)
	ids := seedHeadCoachFixture(t, db, 3)

	// ตั้งคนสุดท้าย (id มากสุด) เป็นหัวหน้า
	if _, err := svc.SetHeadCoach(ids[2], true); err != nil {
		t.Fatalf("ตั้งหัวหน้าโค้ชไม่สำเร็จ: %v", err)
	}

	list, err := svc.ListCoaches(false)
	if err != nil {
		t.Fatalf("ดึงรายชื่อโค้ชไม่สำเร็จ: %v", err)
	}
	if len(list) != 3 {
		t.Fatalf("ต้องได้โค้ช 3 คน แต่ได้ %d", len(list))
	}
	if list[0].ID != ids[2] {
		t.Fatalf("หัวหน้าโค้ชต้องมาเป็นคนแรก (%d) แต่ได้ %d", ids[2], list[0].ID)
	}
	if !list[0].IsHeadCoach {
		t.Fatalf("ข้อมูลที่ส่งให้หน้าแรกต้องบอกว่าเป็นหัวหน้าโค้ช ไม่งั้นป้ายไม่ขึ้น")
	}
	// คนที่เหลือต้องไม่ถูกป้ายว่าเป็นหัวหน้า
	for _, c := range list[1:] {
		if c.IsHeadCoach {
			t.Fatalf("โค้ช %d ไม่ใช่หัวหน้าแต่ถูกส่งค่าว่าเป็น", c.ID)
		}
	}
}

// ─── 4. ลบบัญชีแล้วต้องไม่ค้างเป็นหัวหน้าโค้ช ───────────────────────────────

// ถ้าค้าง ตำแหน่งจะว่างโดยไม่มีใครรู้ และตั้งคนใหม่ได้แต่คนเก่ายังถือธงอยู่ในฐาน
func TestDeletingHeadCoachClearsTheFlag(t *testing.T) {
	db := newErasureTestDB(t)
	actor := seedUser(t, db, models.AdminRole, "actor@gmail.com")
	userID, coachID := seedRichCoach(t, db, "head", models.FaceConsentGranted)

	if err := db.Model(&models.Coach{}).Where("id = ?", coachID).
		UpdateColumn("is_head_coach", true).Error; err != nil {
		t.Fatalf("ตั้งหัวหน้าโค้ชไม่สำเร็จ: %v", err)
	}

	if err := NewUserService(db).DeleteUser(userID, actor); err != nil {
		t.Fatalf("ลบโค้ชควรผ่าน แต่ได้: %v", err)
	}

	var n int64
	db.Unscoped().Model(&models.Coach{}).Where("is_head_coach = ?", true).Count(&n)
	if n != 0 {
		t.Fatalf("บัญชีที่ถูกลบต้องไม่ค้างเป็นหัวหน้าโค้ช แต่ยังมี %d แถว", n)
	}
}
