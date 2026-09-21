package services

import (
	"errors"
	"strings"
	"testing"
	"time"

	"CPE-691015/internal/models"

	"gorm.io/gorm"
)

// เทสชุดนี้คุมกติกาเดียว: การลบโค้ชต้องมี "นโยบายเดียว" ในระบบ
//
// ─── เกิดจากบั๊กจริง ───
//
// เดิมระบบมีทางลบโค้ชสองทางที่ทำสวนกันคนละทาง:
//
//	DELETE /api/users/:id    → soft delete · เก็บ work_schedules อดีตกับ coach_attendances
//	DELETE /api/coaches/:id  → hard delete (Unscoped) · ลบทั้งสองตารางทิ้งหมด
//
// และทางที่แอดมินกดจริงในหน้าจัดการโค้ชคือทางที่ทำลายข้อมูล กดครั้งเดียว
// ประวัติเช็คชื่อและตารางงานย้อนหลังหายถาวร (hard delete จึง rollback ไม่ได้)
// แถว expenses ชี้ไปหาโค้ชที่ไม่มีตัวตน และ biometric_consents กลายเป็นแถวกำพร้า
//
// ตอนนี้ CoachService.Delete ส่งต่อให้ DeleteUserAccount ตัวเดียวกัน
// เทสข้างล่างจึงมีไว้กันคนเผลอเขียนลำดับลบขึ้นมาใหม่ในนั้นอีก

func newCoachDeleteTestDB(t *testing.T) *gorm.DB {
	return newTestDB(t,
		&models.User{}, &models.Coach{},
		&models.FaceImage{},
		&models.CoachAvailability{}, &models.WorkSchedule{},
		&models.CoachAttendance{}, &models.BiometricConsent{},
	)
}

// coachFixture คือโค้ชหนึ่งคนที่มีข้อมูลพ่วงครบทุกชนิดที่การลบไปแตะ
type coachFixture struct {
	userID  uint
	coachID uint
	pastDay string
}

// seedFullCoach สร้างโค้ชพร้อมข้อมูลพ่วงครบชุด ทั้งฝั่งที่ต้องหายและฝั่งที่ต้องอยู่
//
// suffix ใช้กันค่าซ้ำในคอลัมน์ที่เป็น unique (uid, personal_qr_code, email)
func seedFullCoach(t *testing.T, db *gorm.DB, suffix string) coachFixture {
	t.Helper()

	userID := seedUser(t, db, models.CoachRole, "coach-"+suffix+"@gmail.com")

	coach := models.Coach{
		UserID:         userID,
		Uid:            "uid-" + suffix,
		PersonalQRCode: "QR_" + suffix,
		BankAccount:    "1112223334",
	}
	if err := db.Create(&coach).Error; err != nil {
		t.Fatalf("สร้างโค้ชไม่สำเร็จ: %v", err)
	}

	past := time.Now().AddDate(0, 0, -7).Format("2006-01-02")
	future := time.Now().AddDate(0, 0, 7).Format("2006-01-02")

	// ── ฝั่งที่ต้องหายไป ──
	mustCreate(t, db, &models.FaceImage{
		CoachID: &coach.ID, StorageKey: "faces/" + suffix,
		Pose: models.PoseFront, Status: models.FaceImageReady,
	})
	mustCreate(t, db, &models.CoachAvailability{
		CoachID: coach.ID, DayOfWeek: "monday", StartTime: "09:00", EndTime: "12:00",
	})
	mustCreate(t, db, &models.WorkSchedule{
		CoachID: coach.ID, CourseID: 1, Date: future, StartTime: "09:00", EndTime: "10:00",
	})

	// ── ฝั่งที่ต้องอยู่ต่อ (ใช้คิดค่าจ้างย้อนหลัง / เป็นหลักฐานตามกฎหมาย) ──
	mustCreate(t, db, &models.WorkSchedule{
		CoachID: coach.ID, CourseID: 1, Date: past, StartTime: "09:00", EndTime: "10:00",
	})
	mustCreate(t, db, &models.CoachAttendance{
		CoachID: coach.ID, AttendanceSessionID: coach.ID, // ค่าอะไรก็ได้ ขอแค่ไม่ชน unique คู่
		WorkDate: time.Now().AddDate(0, 0, -7), CheckInTime: time.Now().AddDate(0, 0, -7),
		Status: models.AttendanceStatusPresent,
	})
	mustCreate(t, db, &models.BiometricConsent{
		CoachID: &coach.ID, Action: models.ConsentGranted,
		PolicyVersion: models.FaceConsentPolicyVersion,
		ActedAt:       time.Now(), GrantedByUserID: userID,
	})

	return coachFixture{userID: userID, coachID: coach.ID, pastDay: past}
}

func mustCreate(t *testing.T, db *gorm.DB, row any) {
	t.Helper()
	if err := db.Create(row).Error; err != nil {
		t.Fatalf("สร้างข้อมูลทดสอบไม่สำเร็จ (%T): %v", row, err)
	}
}

// footprint นับแถวที่ "ยังมองเห็นได้" ของโค้ชคนหนึ่งในทุกตารางที่การลบไปแตะ
//
// ใช้ query แบบปกติ (ไม่ Unscoped) โดยตั้งใจ — อยากรู้ว่าหลังลบแล้ว
// ระบบยังใช้ข้อมูลนี้ได้อยู่ไหม ไม่ใช่ว่าแถวยังอยู่ในดิสก์หรือเปล่า
func footprint(t *testing.T, db *gorm.DB, f coachFixture) map[string]int64 {
	t.Helper()

	count := func(model any, query string, args ...any) int64 {
		var n int64
		if err := db.Model(model).Where(query, args...).Count(&n).Error; err != nil {
			t.Fatalf("นับแถวไม่สำเร็จ (%T): %v", model, err)
		}
		return n
	}

	return map[string]int64{
		"users":              count(&models.User{}, "id = ?", f.userID),
		"coaches":            count(&models.Coach{}, "id = ?", f.coachID),
		"face_images":        count(&models.FaceImage{}, "coach_id = ?", f.coachID),
		"availability":       count(&models.CoachAvailability{}, "coach_id = ?", f.coachID),
		"work_schedules":     count(&models.WorkSchedule{}, "coach_id = ?", f.coachID),
		"coach_attendances":  count(&models.CoachAttendance{}, "coach_id = ?", f.coachID),
		"biometric_consents": count(&models.BiometricConsent{}, "coach_id = ?", f.coachID),
	}
}

// เส้นทางลบสองเส้นต้องให้ผลเหมือนกันทุกตาราง
//
// นี่คือเทสหลักของบั๊กนี้ ถ้าวันหนึ่งมีคนกลับไปเขียนลำดับลบใน CoachService.Delete
// ขึ้นมาเองอีก ตัวเลขสองฝั่งจะไม่ตรงกันแล้วเทสนี้จะพังทันที โดยไม่ต้องรอให้
// ใครไปกดปุ่มลบในระบบจริงแล้วเพิ่งรู้ว่าประวัติค่าจ้างหายไปแล้ว
func TestCoachDeletePathsAgree(t *testing.T) {
	db := newCoachDeleteTestDB(t)
	actor := seedUser(t, db, models.AdminRole, "actor@gmail.com")

	viaUser := seedFullCoach(t, db, "via-user")
	viaCoach := seedFullCoach(t, db, "via-coach")

	if err := NewUserService(db).DeleteUser(viaUser.userID, actor); err != nil {
		t.Fatalf("ลบผ่าน DELETE /users/:id ควรผ่าน แต่ได้: %v", err)
	}
	if err := NewCoachService(db).Delete(viaCoach.coachID, actor); err != nil {
		t.Fatalf("ลบผ่าน DELETE /coaches/:id ควรผ่าน แต่ได้: %v", err)
	}

	fromUserPath := footprint(t, db, viaUser)
	fromCoachPath := footprint(t, db, viaCoach)

	for table, want := range fromUserPath {
		if got := fromCoachPath[table]; got != want {
			t.Errorf("ตาราง %s: สองเส้นทางให้ผลไม่ตรงกัน — ลบผ่าน users เหลือ %d แถว แต่ลบผ่าน coaches เหลือ %d แถว",
				table, want, got)
		}
	}
}

// อะไรต้องหาย อะไรต้องอยู่ — เขียนค่าที่คาดหวังไว้ตรง ๆ
//
// TestCoachDeletePathsAgree ข้างบนเทียบสองฝั่งให้ตรงกันเฉย ๆ ถ้าทั้งคู่พังเหมือนกัน
// มันจะยังผ่าน เทสนี้จึงตรึงค่าที่ถูกต้องไว้อีกชั้นหนึ่ง
func TestCoachServiceDeleteKeepsPayrollHistory(t *testing.T) {
	db := newCoachDeleteTestDB(t)
	actor := seedUser(t, db, models.AdminRole, "actor@gmail.com")
	f := seedFullCoach(t, db, "solo")

	if err := NewCoachService(db).Delete(f.coachID, actor); err != nil {
		t.Fatalf("ลบโค้ชควรผ่าน แต่ได้: %v", err)
	}

	got := footprint(t, db, f)

	want := map[string]int64{
		// หายไป
		"users":        0, // บัญชีต้องล็อกอินไม่ได้อีก
		"coaches":      0, // โปรไฟล์ต้องไม่โผล่ในรายชื่อ
		"face_images":  0, // ข้อมูลชีวภาพ ต้องลบตาม PDPA
		"availability": 0, // โค้ชที่ออกไปแล้วต้องไม่โผล่เป็นตัวเลือกในหน้าจัดตาราง

		// อยู่ต่อ
		"work_schedules":     1, // เหลือเฉพาะคาบที่สอนไปแล้ว (คาบอนาคตถูกถอดออกจากปฏิทิน)
		"coach_attendances":  1, // ประวัติเช็คชื่อ ใช้ตรวจย้อนหลังว่ามาสอนจริง
		"biometric_consents": 1, // ⚠️ append-only ใช้พิสูจน์ว่าการเก็บใบหน้าในอดีตชอบด้วยกฎหมาย
	}

	for table, expected := range want {
		if got[table] != expected {
			t.Errorf("ตาราง %s: ควรเหลือ %d แถว แต่เหลือ %d", table, expected, got[table])
		}
	}

	// คาบที่เหลือต้องเป็นของอดีตจริง ไม่ใช่บังเอิญเหลือคาบอนาคตแทน
	//
	// เทียบแค่หัวสตริง เพราะ WorkSchedule.Date เป็น string ที่ประกาศ type:date
	// แล้วแต่ละไดรเวอร์คืนคนละรูปแบบ (sqlite ได้ "...T00:00:00Z" ต่อท้าย)
	var remaining models.WorkSchedule
	if err := db.Where("coach_id = ?", f.coachID).First(&remaining).Error; err != nil {
		t.Fatalf("ดึงคาบที่เหลือไม่สำเร็จ: %v", err)
	}
	if !strings.HasPrefix(remaining.Date, f.pastDay) {
		t.Errorf("คาบที่เหลือควรเป็นของวันที่ผ่านมาแล้ว (%s) แต่ได้ %s", f.pastDay, remaining.Date)
	}
}

// ต้องเป็น soft delete — แถวยังอยู่ในฐาน ดึงกลับมาด้วย Unscoped ได้
//
// สำคัญเพราะ expenses.coach_id ยังชี้มาที่โค้ชคนนี้อยู่ ถ้าลบแถวจริง
// รายงานการเงินย้อนหลังจะ join ไม่เจอชื่อ กลายเป็นยอดเงินที่ไม่รู้ว่าจ่ายให้ใคร
func TestCoachServiceDeleteIsSoftDelete(t *testing.T) {
	db := newCoachDeleteTestDB(t)
	actor := seedUser(t, db, models.AdminRole, "actor@gmail.com")
	f := seedFullCoach(t, db, "soft")

	if err := NewCoachService(db).Delete(f.coachID, actor); err != nil {
		t.Fatalf("ลบโค้ชควรผ่าน แต่ได้: %v", err)
	}

	var coach models.Coach
	if err := db.Unscoped().First(&coach, f.coachID).Error; err != nil {
		t.Fatalf("แถว coaches ต้องยังอยู่ให้ Unscoped ดึงได้ (ไว้ join หาชื่อย้อนหลัง) แต่ได้: %v", err)
	}
	if !coach.DeletedAt.Valid {
		t.Error("แถว coaches ต้องถูกตั้ง deleted_at ไว้")
	}

	var user models.User
	if err := db.Unscoped().First(&user, f.userID).Error; err != nil {
		t.Fatalf("แถว users ต้องยังอยู่ให้ Unscoped ดึงได้ แต่ได้: %v", err)
	}
	if !user.DeletedAt.Valid {
		t.Error("แถว users ต้องถูกตั้ง deleted_at ไว้ ไม่งั้นบัญชียังล็อกอินได้")
	}
}

// ลบโค้ชที่ไม่มีอยู่ต้องได้ ErrRecordNotFound → controller แมปเป็น 404
// ไม่ใช่ 500 ที่แปลว่าระบบพัง
func TestCoachServiceDeleteNotFound(t *testing.T) {
	db := newCoachDeleteTestDB(t)

	err := NewCoachService(db).Delete(9999, 1)
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("ควรได้ ErrRecordNotFound แต่ได้: %v", err)
	}
}

// ด่านกันลบบัญชีตัวเองต้องมีผลกับเส้นทางนี้ด้วย
//
// เดิมเส้น /coaches/:id ข้ามด่านทั้งหมดของ DeleteUser ไปเลย เทสนี้ยืนยันว่า
// พอส่งต่อให้แกนกลางแล้ว ด่านชุดเดียวกันก็มีผลกับเส้นนี้โดยอัตโนมัติ
func TestCoachServiceDeleteBlocksSelfDelete(t *testing.T) {
	db := newCoachDeleteTestDB(t)
	f := seedFullCoach(t, db, "self")

	err := NewCoachService(db).Delete(f.coachID, f.userID)
	if !errors.Is(err, ErrDeleteSelf) {
		t.Fatalf("ควรได้ ErrDeleteSelf แต่ได้: %v", err)
	}

	var n int64
	db.Model(&models.Coach{}).Where("id = ?", f.coachID).Count(&n)
	if n != 1 {
		t.Error("โดนบล็อกแล้วต้องไม่มีอะไรถูกลบ")
	}
}

// โปรไฟล์โค้ชที่ไม่มีบัญชีผูกอยู่ = ข้อมูลเสีย ต้องตอบกลับไปตรง ๆ
// ไม่ใช่ลบครึ่ง ๆ กลาง ๆ แล้วเหลือสภาพที่แปลกกว่าเดิม
func TestCoachServiceDeleteRejectsCoachWithoutAccount(t *testing.T) {
	db := newCoachDeleteTestDB(t)

	coach := models.Coach{Uid: "orphan", PersonalQRCode: "QR_orphan"}
	mustCreate(t, db, &coach)

	err := NewCoachService(db).Delete(coach.ID, 1)
	if !errors.Is(err, ErrCoachNoAccount) {
		t.Fatalf("ควรได้ ErrCoachNoAccount แต่ได้: %v", err)
	}

	var n int64
	db.Model(&models.Coach{}).Where("id = ?", coach.ID).Count(&n)
	if n != 1 {
		t.Error("ข้อมูลเสียต้องไม่ถูกลบไปเงียบ ๆ ต้องเหลือไว้ให้คนไปตรวจ")
	}
}
