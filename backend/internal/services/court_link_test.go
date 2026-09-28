package services

import (
	"errors"
	"strings"
	"testing"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"

	"gorm.io/gorm"
)

// เทสชุดนี้คุมการผูกคาบสอนกับตาราง courts
//
// ⚠️ เดิมสนามเก็บเป็นข้อความล้วน ด่านตรวจสนามซ้อนจึงเทียบสตริงตรง ๆ
// "1" กับ "01" ถูกมองเป็นคนละสนาม แล้วจองซ้อนกันได้ทั้งที่เป็นสนามเดียว

func newCourtLinkDB(t *testing.T) *gorm.DB {
	return newTestDB(t,
		&models.User{}, &models.Coach{}, &models.Court{},
		&models.CoachAvailability{}, &models.WorkSchedule{},
		&models.Course{}, &models.Package{}, &models.PackageSchedule{},
	)
}

func seedCourt(t *testing.T, db *gorm.DB, name string) uint {
	t.Helper()
	c := models.Court{Name: name, IsActive: true}
	mustCreate(t, db, &c)
	return c.ID
}

// ─── 1. ชื่อสนามที่เขียนต่างกันต้องถือเป็นสนามเดียวกัน ─────────────────────

func TestNormalizeCourtNameTreatsSameCourtAsSame(t *testing.T) {
	same := [][2]string{
		{"1", "01"},
		{"1", " 1 "},
		{"สนาม 1", "สนาม  1"},
		{"สนาม 1", " สนาม 1 "},
		{"007", "7"},
	}
	for _, p := range same {
		if normalizeCourtName(p[0]) != normalizeCourtName(p[1]) {
			t.Errorf("%q กับ %q ต้องเป็นสนามเดียวกัน แต่ normalize ได้ %q กับ %q",
				p[0], p[1], normalizeCourtName(p[0]), normalizeCourtName(p[1]))
		}
	}

	// คนละสนามต้องไม่ถูกยุบรวมกัน
	diff := [][2]string{{"1", "2"}, {"สนาม 1", "สนาม 2"}, {"A", "B"}}
	for _, p := range diff {
		if normalizeCourtName(p[0]) == normalizeCourtName(p[1]) {
			t.Errorf("%q กับ %q เป็นคนละสนาม แต่ normalize ได้ค่าเดียวกัน", p[0], p[1])
		}
	}

	if normalizeCourtName("   ") != "" {
		t.Errorf("ช่องว่างล้วนต้องถือว่าไม่ได้ระบุสนาม")
	}
}

// ─── 2. หาสนามจาก id หรือจากชื่อ ────────────────────────────────────────────

func TestResolveCourtFindsByIDAndName(t *testing.T) {
	db := newCourtLinkDB(t)
	id := seedCourt(t, db, "สนาม 1")

	// ทาง id
	gotID, gotName, err := resolveCourt(db, &id, "")
	if err != nil {
		t.Fatalf("หาสนามจาก id ไม่สำเร็จ: %v", err)
	}
	if gotID == nil || *gotID != id || gotName != "สนาม 1" {
		t.Fatalf("ต้องได้ id %d ชื่อ %q แต่ได้ %v %q", id, "สนาม 1", gotID, gotName)
	}

	// ทางชื่อ — เขียนต่างกันเล็กน้อยก็ต้องเจอ
	gotID, gotName, err = resolveCourt(db, nil, " สนาม  1 ")
	if err != nil {
		t.Fatalf("หาสนามจากชื่อไม่สำเร็จ: %v", err)
	}
	if gotID == nil || *gotID != id {
		t.Fatalf("ชื่อที่เว้นวรรคต่างกันต้องเจอสนามเดิม (id %d) แต่ได้ %v", id, gotID)
	}
	if gotName != "สนาม 1" {
		t.Fatalf("ต้องคืนชื่อตามที่เก็บในตาราง courts ไม่ใช่ตามที่ผู้ใช้พิมพ์ (ได้ %q)", gotName)
	}
}

// ไม่ระบุสนามถือว่าถูกต้อง เพราะสนามเป็น optional
func TestResolveCourtAllowsEmpty(t *testing.T) {
	db := newCourtLinkDB(t)
	id, name, err := resolveCourt(db, nil, "   ")
	if err != nil {
		t.Fatalf("ไม่ระบุสนามไม่ควรเป็น error แต่ได้: %v", err)
	}
	if id != nil || name != "" {
		t.Fatalf("ไม่ระบุสนามต้องได้ (nil, \"\") แต่ได้ (%v, %q)", id, name)
	}
}

// ⚠️ ส่ง id ที่ไม่มีจริงมาต้องตอบ error ไม่ใช่เงียบแล้วบันทึกไปเฉย ๆ
func TestResolveCourtRejectsUnknownID(t *testing.T) {
	db := newCourtLinkDB(t)
	missing := uint(9999)
	if _, _, err := resolveCourt(db, &missing, ""); err == nil {
		t.Fatalf("ส่ง court_id ที่ไม่มีในระบบ ต้องได้ error")
	}
}

// ชื่อที่ไม่ตรงกับสนามไหนเลย — เก็บข้อความไว้แต่ไม่ผูก id (ข้อมูลเก่าที่พิมพ์เอง)
func TestResolveCourtKeepsUnknownNameWithoutLinking(t *testing.T) {
	db := newCourtLinkDB(t)
	seedCourt(t, db, "สนาม 1")

	id, name, err := resolveCourt(db, nil, "สนามข้างนอก")
	if err != nil {
		t.Fatalf("ชื่อที่ไม่รู้จักไม่ควรเป็น error แต่ได้: %v", err)
	}
	if id != nil {
		t.Fatalf("ชื่อที่ไม่ตรงกับสนามไหนต้องไม่ผูก id แต่ได้ %v", *id)
	}
	if name != "สนามข้างนอก" {
		t.Fatalf("ต้องเก็บข้อความเดิมไว้ แต่ได้ %q", name)
	}
}

// ─── 3. เติม court_id ให้ข้อมูลเก่า ─────────────────────────────────────────

func TestBackfillLinksOldRowsByName(t *testing.T) {
	db := newCourtLinkDB(t)
	id1 := seedCourt(t, db, "1")
	seedCourt(t, db, "2")

	// แถวเก่าเขียนชื่อสนามคนละแบบ แต่หมายถึงสนามเดียวกัน
	for _, raw := range []string{"1", "01", " 1 "} {
		mustCreate(t, db, &models.WorkSchedule{
			CoachID: 1, CourseID: 1, Date: "2026-05-01",
			StartTime: "09:00", EndTime: "10:00", Courtnumber: raw,
		})
	}
	// แถวที่ชื่อไม่ตรงกับสนามไหนเลย
	mustCreate(t, db, &models.WorkSchedule{
		CoachID: 1, CourseID: 1, Date: "2026-05-01",
		StartTime: "11:00", EndTime: "12:00", Courtnumber: "สนามข้างนอก",
	})
	// แถวที่ไม่ระบุสนาม — ต้องไม่ถูกนับว่าแมปไม่ได้
	mustCreate(t, db, &models.WorkSchedule{
		CoachID: 1, CourseID: 1, Date: "2026-05-01",
		StartTime: "13:00", EndTime: "14:00", Courtnumber: "",
	})

	linked, unmatched, err := BackfillWorkScheduleCourtIDs(db)
	if err != nil {
		t.Fatalf("เติม court_id ไม่สำเร็จ: %v", err)
	}
	if linked != 3 {
		t.Fatalf("ต้องผูกได้ 3 แถว (1 / 01 / ' 1 ' คือสนามเดียวกัน) แต่ได้ %d", linked)
	}
	if unmatched != 1 {
		t.Fatalf("ต้องเหลือแมปไม่ได้ 1 แถว แต่ได้ %d", unmatched)
	}

	var n int64
	db.Model(&models.WorkSchedule{}).Where("court_id = ?", id1).Count(&n)
	if n != 3 {
		t.Fatalf("สามแถวนั้นต้องชี้ไปสนามเดียวกัน แต่ได้ %d", n)
	}

	// ⚠️ ต้องรันซ้ำได้ รอบสองไม่ควรแตะแถวที่ผูกแล้ว
	linked2, unmatched2, err := BackfillWorkScheduleCourtIDs(db)
	if err != nil {
		t.Fatalf("รันซ้ำไม่สำเร็จ: %v", err)
	}
	if linked2 != 0 {
		t.Fatalf("รันซ้ำต้องไม่ผูกเพิ่ม แต่ผูกอีก %d แถว", linked2)
	}
	if unmatched2 != 1 {
		t.Fatalf("แถวที่แมปไม่ได้ต้องยังรายงานเหมือนเดิม แต่ได้ %d", unmatched2)
	}
}

// ─── 4. ด่านตรวจสนามซ้อนต้องจับ "1" กับ "01" ได้ ──────────────────────────

// ⚠️ นี่คือบั๊กที่การผูก court_id เข้ามาแก้
// เดิมเทียบสตริง แอดมินพิมพ์ "01" ตอนจองทับสนาม "1" แล้วระบบปล่อยผ่าน
func TestCourtConflictCatchesDifferentSpelling(t *testing.T) {
	db := newCourtLinkDB(t)
	courtID := seedCourt(t, db, "1")

	mustCreate(t, db, &models.Coach{
		Model: gorm.Model{ID: 1}, Nickname: "โค้ชเอ", Status: coachStatusActive,
		Uid: "court-uid-1", PersonalQRCode: "court-qr-1",
	})
	mustCreate(t, db, &models.Coach{
		Model: gorm.Model{ID: 2}, Nickname: "โค้ชบี", Status: coachStatusActive,
		Uid: "court-uid-2", PersonalQRCode: "court-qr-2",
	})
	for _, id := range []uint{1, 2} {
		mustCreate(t, db, &models.CoachAvailability{
			CoachID: id, DayOfWeek: "Friday", StartTime: "08:00", EndTime: "20:00",
		})
	}

	// คาบแรกจองสนาม "1" ของคอร์ส 1
	cid := courtID
	mustCreate(t, db, &models.WorkSchedule{
		CoachID: 1, CourseID: 1, Date: "2026-05-01",
		StartTime: "09:00", EndTime: "11:00",
		Courtnumber: "1", CourtID: &cid,
	})

	svc := &workScheduleService{db: db}

	// คอร์สอื่นจองทับเวลาเดียวกัน แต่พิมพ์สนามเป็น "01"
	err := svc.validateScheduleSlot(db, dtoCourtReq(2, 2, "2026-05-01", "10:00", "12:00", "01"), 0)
	if err == nil {
		t.Fatalf("จองทับสนามเดียวกันที่พิมพ์เป็น %q ต้องถูกปฏิเสธ", "01")
	}

	// คอร์สเดียวกัน เวลาเดียวกัน = คลาสเดียวกัน ใช้สนามร่วมกันได้
	if err := svc.validateScheduleSlot(db,
		dtoCourtReq(2, 1, "2026-05-01", "09:00", "11:00", "01"), 0); err != nil {
		t.Fatalf("โค้ชอีกคนสอนคลาสเดียวกันบนสนามเดียวกันต้องผ่าน แต่ได้: %v", err)
	}

	// คนละสนาม ไม่ควรชน
	seedCourt(t, db, "2")
	if err := svc.validateScheduleSlot(db,
		dtoCourtReq(2, 2, "2026-05-01", "10:00", "12:00", "2"), 0); err != nil {
		t.Fatalf("คนละสนามไม่ควรชนกัน แต่ได้: %v", err)
	}
}

func dtoCourtReq(coachID, courseID uint, date, start, end, court string) dto.CreateWorkScheduleRequest {
	return dto.CreateWorkScheduleRequest{
		CoachID: coachID, CourseID: courseID, Date: date,
		StartTime: start, EndTime: end, CourtNumber: court,
	}
}

// ─── 5. ด่านที่เพิ่มหลังตรวจรอบสอง ──────────────────────────────────────────

// ชื่อซ้ำหลัง normalize ต้องสร้าง/เปลี่ยนชื่อไม่ได้ — สนามซ้ำถูกมองเป็นคนละ id แล้วจองทับกันได้
func TestCourtNameMustBeUnique(t *testing.T) {
	db := newCourtLinkDB(t)
	svc := NewCourtService(db)

	one, err := svc.Create("1")
	if err != nil {
		t.Fatalf("สร้างสนามแรกไม่สำเร็จ: %v", err)
	}
	if _, err := svc.Create(" 01 "); !errors.Is(err, ErrCourtNameDuplicate) {
		t.Fatalf("สร้าง \"01\" ซ้ำกับ \"1\" ต้องได้ ErrCourtNameDuplicate แต่ได้ %v", err)
	}

	two, _ := svc.Create("2")
	name := "001"
	if _, err := svc.Update(two.ID, &name, nil); !errors.Is(err, ErrCourtNameDuplicate) {
		t.Fatalf("เปลี่ยนชื่อให้ซ้ำสนามอื่นต้องไม่ได้ แต่ได้ %v", err)
	}

	// เปลี่ยนชื่อตัวเองเป็นชื่อเดิม (เขียนต่างกัน) ต้องได้
	same := "01"
	if _, err := svc.Update(one.ID, &same, nil); err != nil {
		t.Fatalf("แก้ชื่อตัวเองต้องไม่ถูกนับว่าซ้ำ แต่ได้ %v", err)
	}
}

func TestCourtNameLengthLimit(t *testing.T) {
	db := newCourtLinkDB(t)
	long := strings.Repeat("ส", maxCourtNameLen+1)
	if _, err := NewCourtService(db).Create(long); !errors.Is(err, ErrCourtNameTooLong) {
		t.Fatalf("ชื่อยาว %d ตัวต้องถูกปฏิเสธ แต่ได้ %v", maxCourtNameLen+1, err)
	}
	if _, err := NewCourtService(db).Create(strings.Repeat("ส", maxCourtNameLen)); err != nil {
		t.Fatalf("ชื่อยาวพอดี %d ตัวต้องผ่าน แต่ได้ %v", maxCourtNameLen, err)
	}
}

// ลบสนามที่ยังมีคาบในอนาคตไม่ได้ · มีแต่คาบในอดีตลบได้
func TestDeleteCourtBlockedByFutureSchedules(t *testing.T) {
	db := newCourtLinkDB(t)
	svc := NewCourtService(db)
	id := seedCourt(t, db, "3")
	mustCreate(t, db, &models.Coach{Model: gorm.Model{ID: 1}, Uid: "del-uid", PersonalQRCode: "del-qr"})

	ws := models.WorkSchedule{CoachID: 1, CourseID: 1, Date: "2099-01-01",
		StartTime: "09:00", EndTime: "11:00", Courtnumber: "3", CourtID: &id}
	mustCreate(t, db, &ws)

	if err := svc.Delete(id); !errors.Is(err, ErrCourtInUse) {
		t.Fatalf("ลบสนามที่มีคาบในอนาคตต้องได้ ErrCourtInUse แต่ได้ %v", err)
	}

	db.Model(&models.WorkSchedule{}).Where("id = ?", ws.ID).Update("date", "2020-01-01")
	if err := svc.Delete(id); err != nil {
		t.Fatalf("สนามที่มีแต่คาบในอดีตต้องลบได้ แต่ได้ %v", err)
	}
}

// สนามที่ปิดใช้งานเลือกใหม่ไม่ได้ · แต่คาบเดิมที่ผูกอยู่แล้วยังแก้ได้
func TestInactiveCourtCannotBeChosen(t *testing.T) {
	db := newCourtLinkDB(t)
	id := seedCourt(t, db, "9")
	db.Model(&models.Court{}).Where("id = ?", id).Update("is_active", false)

	if err := ensureCourtUsable(db, &id, nil); !errors.Is(err, ErrCourtInactive) {
		t.Fatalf("เลือกสนามที่ปิดใช้งานต้องได้ ErrCourtInactive แต่ได้ %v", err)
	}
	if err := ensureCourtUsable(db, &id, &id); err != nil {
		t.Fatalf("คาบที่ผูกสนามนี้อยู่แล้วต้องแก้ต่อได้ แต่ได้ %v", err)
	}
}

// แก้คาบโดยไม่เปลี่ยนสนาม ต้องไม่เขียนชื่อสนามปัจจุบันทับชื่อ ณ วันมอบหมาย
func TestSameCourtKeepsHistoricalName(t *testing.T) {
	a, b := uint(1), uint(2)
	cases := []struct {
		oldID   *uint
		oldName string
		newID   *uint
		newName string
		want    bool
	}{
		{&a, "สนามเก่า", &a, "สนามใหม่", true}, // เปลี่ยนชื่อสนาม แต่เป็นสนามเดิม
		{&a, "1", &b, "1", false},
		{nil, "", &a, "1", false},
		{&a, "1", nil, "", false},
		{nil, "01", nil, "1", true},
		{nil, "", nil, "", true},
	}
	for i, c := range cases {
		if got := sameCourt(c.oldID, c.oldName, c.newID, c.newName); got != c.want {
			t.Errorf("เคส %d: sameCourt = %v ต้องเป็น %v", i, got, c.want)
		}
	}
}

func TestDuplicateCourtNamesReportsExistingDuplicates(t *testing.T) {
	db := newCourtLinkDB(t)
	seedCourt(t, db, "1")
	seedCourt(t, db, "01")
	seedCourt(t, db, "2")

	dups, err := DuplicateCourtNames(db)
	if err != nil {
		t.Fatal(err)
	}
	if len(dups) != 1 || len(dups[0]) != 2 {
		t.Fatalf("ต้องเจอสนามซ้ำ 1 กลุ่ม 2 สนาม แต่ได้ %+v", dups)
	}
}

// แก้คำอธิบายคาบเก่าหลังสนามถูกเปลี่ยนชื่อและปิดใช้งาน: ต้องแก้ได้ และชื่อสนาม ณ วันนั้นต้องไม่เปลี่ยน
func TestUpdateKeepsCourtSnapshotAfterRenameAndDeactivate(t *testing.T) {
	db := newScheduleGuardDB(t)
	if err := db.AutoMigrate(&models.Court{}); err != nil {
		t.Fatal(err)
	}
	ws := seedPastSchedule(t, db)
	courtID := seedCourt(t, db, "1")
	db.Model(&models.WorkSchedule{}).Where("id = ?", ws.ID).Update("court_id", courtID)
	db.Model(&models.Court{}).Where("id = ?", courtID).
		Updates(map[string]any{"name": "สนามใหม่", "is_active": false})

	updated, err := NewWorkScheduleService(db).Update(ws.ID, dto.CreateWorkScheduleRequest{
		Date: "2026-01-05", StartTime: "18:00", EndTime: "20:00",
		CoachID: wageCoachID, CourseID: 1, CourtID: &courtID, Description: "แก้คำอธิบาย",
	})
	if err != nil {
		t.Fatalf("แก้คำอธิบายคาบที่ผูกสนามเดิมต้องได้ แต่ได้ %v", err)
	}
	if updated.Courtnumber != "1" {
		t.Fatalf("ชื่อสนาม ณ วันมอบหมายต้องยังเป็น \"1\" แต่ถูกเขียนทับเป็น %q", updated.Courtnumber)
	}
}
