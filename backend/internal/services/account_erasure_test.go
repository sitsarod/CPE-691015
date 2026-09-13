package services

import (
	"path/filepath"
	"testing"
	"time"

	"CPE-691015/internal/models"

	"gorm.io/gorm"
)

// เทสชุดนี้คุมการล้างข้อมูลส่วนตัวตอนลบบัญชี (PDPA)
//
// การลบเป็น soft delete แถวยังอยู่ ถ้าไม่ล้างฟิลด์ เลขบัตรประชาชน ที่อยู่ เบอร์โทร
// และ hash รหัสผ่านจะค้างในฐานตลอดไปทั้งที่ไม่มีใครใช้ต่อ

func newErasureTestDB(t *testing.T) *gorm.DB {
	return newTestDB(t,
		&models.User{}, &models.Coach{}, &models.Customer{},
		&models.Photo{}, &models.FaceImage{},
		&models.CoachAvailability{}, &models.WorkSchedule{},
		&models.CoachAttendance{}, &models.BiometricConsent{},
	)
}

// seedRichCoach สร้างโค้ชที่กรอกข้อมูลส่วนตัวไว้ครบทุกช่อง
func seedRichCoach(t *testing.T, db *gorm.DB, suffix string, consent models.FaceConsentStatus) (userID, coachID uint) {
	t.Helper()

	userID = seedUser(t, db, models.CoachRole, "rich-"+suffix+"@gmail.com")
	coach := models.Coach{
		UserID:            userID,
		Uid:               "1234567890" + suffix,
		Address:           "123/4 ถ.มิตรภาพ",
		Phone:             "0812345678",
		BirthDate:         "1995-03-12",
		LineID:            "line-" + suffix,
		Facebook:          "fb-" + suffix,
		ProfilePicture:    "/uploads/coaches/" + suffix + ".jpg",
		HomeImage:         "/uploads/home/" + suffix + ".jpg",
		Bio:               "อดีตนักกีฬาทีมชาติ",
		Specialization:    "แบดมินตัน",
		CoachLicense:      "L-" + suffix,
		PaymentInfo:       "โอนทุกสิ้นเดือน",
		PromptPay:         "0812345678",
		FeatureOnHome:     true,
		PersonalQRCode:    "QR_" + suffix,
		Nickname:          "โค้ชเทส",
		BankAccount:       "1112223334",
		MemberCode:        "KYC" + suffix,
		PaymentType:       PaymentTypePerSession,
		PayRate:           300,
		FaceConsentStatus: consent,
	}
	mustCreate(t, db, &coach)
	return userID, coach.ID
}

// deletedCoach อ่านแถวโค้ชที่ถูก soft delete ไปแล้ว
func deletedCoach(t *testing.T, db *gorm.DB, coachID uint) models.Coach {
	t.Helper()
	var c models.Coach
	if err := db.Unscoped().First(&c, coachID).Error; err != nil {
		t.Fatalf("อ่านแถวโค้ชที่ลบแล้วไม่สำเร็จ: %v", err)
	}
	return c
}

// ─── 1. ข้อมูลส่วนตัวต้องถูกล้าง ────────────────────────────────────────────

func TestDeleteCoachScrubsPersonalData(t *testing.T) {
	db := newErasureTestDB(t)
	actor := seedUser(t, db, models.AdminRole, "actor@gmail.com")
	userID, coachID := seedRichCoach(t, db, "a", models.FaceConsentGranted)

	if err := NewUserService(db).DeleteUser(userID, actor); err != nil {
		t.Fatalf("ลบโค้ชควรผ่าน แต่ได้: %v", err)
	}

	c := deletedCoach(t, db, coachID)

	// ⚠️ uid คือเลขบัตรประชาชน ตัวที่อ่อนไหวที่สุดในตารางนี้
	cleared := map[string]string{
		"uid (เลขบัตรประชาชน)": c.Uid,
		"address":          c.Address,
		"phone":            c.Phone,
		"birth_date":       c.BirthDate,
		"line_id":          c.LineID,
		"facebook":         c.Facebook,
		"profile_picture":  c.ProfilePicture,
		"home_image":       c.HomeImage,
		"bio":              c.Bio,
		"specialization":   c.Specialization,
		"coach_license":    c.CoachLicense,
		"payment_info":     c.PaymentInfo,
		"prompt_pay":       c.PromptPay,
		"personal_qr_code": c.PersonalQRCode,
	}
	for field, got := range cleared {
		if got != "" {
			t.Errorf("%s ต้องถูกล้างหลังลบบัญชี แต่ยังเป็น %q", field, got)
		}
	}
	if c.FeatureOnHome {
		t.Errorf("คนที่ลบไปแล้วต้องไม่ถูกตั้งให้โชว์หน้าแรก")
	}

	// ฝั่งที่ต้องเก็บไว้ — รายงานการเงินย้อนหลังใช้อยู่
	if c.Nickname == "" {
		t.Errorf("ชื่อเล่นต้องเก็บไว้ ไม่งั้นรายงานการเงินย้อนหลังเหลือแต่ยอดลอย ๆ")
	}
	if c.BankAccount == "" {
		t.Errorf("เลขบัญชีต้องเก็บไว้ เพราะ expenses ไม่ได้เก็บเองและใช้พิสูจน์ปลายทางเงิน")
	}
	if c.MemberCode == "" {
		t.Errorf("member_code ต้องเก็บไว้ ล้างแล้วรหัสจะถูกเอาไปออกให้คนใหม่")
	}
	if c.PayRate == 0 {
		t.Errorf("อัตราค่าจ้างต้องเก็บไว้ ใช้คิดเงินย้อนหลัง")
	}

	var u models.User
	if err := db.Unscoped().First(&u, userID).Error; err != nil {
		t.Fatalf("อ่านแถว user ที่ลบแล้วไม่สำเร็จ: %v", err)
	}
	if u.Email != "" || u.Password != "" {
		t.Errorf("อีเมลกับ hash รหัสผ่านต้องถูกล้าง แต่ได้ email=%q password=%q", u.Email, u.Password)
	}
	if u.TokenVersion == 0 {
		t.Errorf("token_version ต้องถูกบวก เพื่อให้ token ที่ยังถืออยู่ใช้ไม่ได้ทันที")
	}
	if u.FirstName == "" {
		t.Errorf("ชื่อต้องเก็บไว้ เป็นตัวที่รายงานย้อนหลังใช้อ้างถึงคน")
	}
}

func TestDeleteCustomerScrubsPersonalData(t *testing.T) {
	db := newErasureTestDB(t)
	actor := seedUser(t, db, models.AdminRole, "actor@gmail.com")
	userID := seedUser(t, db, models.CustomerRole, "kid@gmail.com")

	cust := models.Customer{
		UserID: userID, Nickname: "น้องเทส", Gender: models.GenderMale,
		BirthDate:   time.Now().AddDate(-12, 0, 0),
		PhoneNumber: "0891234567", LineID: "kid-line", Facebook: "kid-fb",
		ProfilePicture:    "/uploads/customers/kid.jpg",
		ParentEmail:       "parent@gmail.com",
		ParentPhoneNumber: "0897654321",
		PersonalQRCode:    "QR_KID", MemberCode: "KYS0001",
	}
	mustCreate(t, db, &cust)

	if err := NewUserService(db).DeleteUser(userID, actor); err != nil {
		t.Fatalf("ลบผู้เรียนควรผ่าน แต่ได้: %v", err)
	}

	var c models.Customer
	if err := db.Unscoped().First(&c, cust.ID).Error; err != nil {
		t.Fatalf("อ่านแถวผู้เรียนที่ลบแล้วไม่สำเร็จ: %v", err)
	}

	// ⚠️ อีเมล/เบอร์ผู้ปกครองเป็นข้อมูลของคนที่สาม ยิ่งไม่มีเหตุให้เก็บต่อ
	cleared := map[string]string{
		"phone_number":        c.PhoneNumber,
		"line_id":             c.LineID,
		"facebook":            c.Facebook,
		"profile_picture":     c.ProfilePicture,
		"parent_email":        c.ParentEmail,
		"parent_phone_number": c.ParentPhoneNumber,
		"personal_qr_code":    c.PersonalQRCode,
	}
	for field, got := range cleared {
		if got != "" {
			t.Errorf("%s ต้องถูกล้างหลังลบบัญชี แต่ยังเป็น %q", field, got)
		}
	}
	if !c.BirthDate.IsZero() {
		t.Errorf("วันเกิดต้องถูกล้าง แต่ยังเป็น %v", c.BirthDate)
	}
	if c.Nickname == "" || c.MemberCode == "" {
		t.Errorf("ชื่อเล่นกับ member_code ต้องเก็บไว้")
	}
}

// ─── 2. ต้องบันทึกว่าความยินยอมสิ้นสุดแล้ว ──────────────────────────────────

// ⚠️ เดิมเส้นทางลบลบรูปใบหน้าแต่ไม่เขียนอะไรลง biometric_consents
// ประวัติจึงค้างที่ granted = เอกสารบอกว่ายังยินยอมอยู่ทั้งที่ข้อมูลถูกลบไปแล้ว
func TestDeleteCoachRecordsConsentEnded(t *testing.T) {
	db := newErasureTestDB(t)
	actor := seedUser(t, db, models.AdminRole, "actor@gmail.com")
	userID, coachID := seedRichCoach(t, db, "b", models.FaceConsentGranted)

	mustCreate(t, db, &models.BiometricConsent{
		CoachID: &coachID, Action: models.ConsentGranted,
		PolicyVersion: models.FaceConsentPolicyVersion,
		ActedAt:       time.Now(), GrantedByUserID: userID,
	})

	if err := NewUserService(db).DeleteUser(userID, actor); err != nil {
		t.Fatalf("ลบโค้ชควรผ่าน แต่ได้: %v", err)
	}

	var rows []models.BiometricConsent
	if err := db.Where("coach_id = ?", coachID).Order("id ASC").Find(&rows).Error; err != nil {
		t.Fatalf("อ่านประวัติความยินยอมไม่สำเร็จ: %v", err)
	}
	if len(rows) != 2 {
		t.Fatalf("ต้องมีแถว withdrawn เพิ่มจากการลบบัญชี รวมเป็น 2 แถว แต่ได้ %d", len(rows))
	}

	last := rows[len(rows)-1]
	if last.Action != models.ConsentWithdrawn {
		t.Errorf("แถวล่าสุดต้องเป็น %q แต่ได้ %q", models.ConsentWithdrawn, last.Action)
	}
	// ต้องตอบได้ว่าใครเป็นคนสั่งทำลายข้อมูล
	if last.GrantedByUserID != actor {
		t.Errorf("ต้องบันทึกว่าแอดมินคนไหนเป็นคนลบ (คาด %d ได้ %d)", actor, last.GrantedByUserID)
	}

	// ⚠️ ประวัติเป็น append-only แถวเดิมห้ามถูกแก้
	if rows[0].Action != models.ConsentGranted {
		t.Errorf("แถวเดิมต้องไม่ถูกแก้ทับ แต่กลายเป็น %q", rows[0].Action)
	}

	if c := deletedCoach(t, db, coachID); c.FaceConsentStatus != models.FaceConsentWithdrawn {
		t.Errorf("สถานะต้องเป็น %q ให้ตรงกับแถวล่าสุด แต่ได้ %q",
			models.FaceConsentWithdrawn, c.FaceConsentStatus)
	}
}

// คนที่ไม่เคยให้ความยินยอม ต้องไม่มีแถว withdrawn โผล่มา
//
// ไม่งั้นประวัติจะบอกว่าเขา "ถอน" สิ่งที่ไม่เคยให้ ซึ่งใช้อ้างอิงย้อนหลังไม่ได้
func TestDeleteCoachWithoutConsentRecordsNothing(t *testing.T) {
	db := newErasureTestDB(t)
	actor := seedUser(t, db, models.AdminRole, "actor@gmail.com")
	userID, coachID := seedRichCoach(t, db, "c", models.FaceConsentDeclined)

	if err := NewUserService(db).DeleteUser(userID, actor); err != nil {
		t.Fatalf("ลบโค้ชควรผ่าน แต่ได้: %v", err)
	}

	var n int64
	db.Model(&models.BiometricConsent{}).Where("coach_id = ?", coachID).Count(&n)
	if n != 0 {
		t.Fatalf("คนที่ไม่เคยยินยอมต้องไม่มีแถว consent เพิ่ม แต่ได้ %d แถว", n)
	}
}

// ─── 3. ลบหลายคนติดกันต้องไม่ชน unique ของ QR ประจำตัว ─────────────────────

// ⚠️ personal_qr_code เป็น unique ธรรมดา ไม่ใช่ partial index แบบ uid/email
// ถ้าล้างเป็น "" แทน NULL คนที่สองจะลบไม่ได้เลย
func TestDeleteTwoCoachesDoesNotCollideOnQR(t *testing.T) {
	db := newErasureTestDB(t)
	actor := seedUser(t, db, models.AdminRole, "actor@gmail.com")
	firstUser, _ := seedRichCoach(t, db, "d1", models.FaceConsentGranted)
	secondUser, _ := seedRichCoach(t, db, "d2", models.FaceConsentGranted)

	svc := NewUserService(db)
	if err := svc.DeleteUser(firstUser, actor); err != nil {
		t.Fatalf("ลบโค้ชคนแรกควรผ่าน แต่ได้: %v", err)
	}
	if err := svc.DeleteUser(secondUser, actor); err != nil {
		t.Fatalf("ลบโค้ชคนที่สองควรผ่านด้วย แต่ได้: %v", err)
	}
}

// ─── 4. ประวัติค่าจ้างต้องไม่หายไปเพราะการล้าง ──────────────────────────────

func TestScrubKeepsPayrollHistory(t *testing.T) {
	db := newErasureTestDB(t)
	actor := seedUser(t, db, models.AdminRole, "actor@gmail.com")
	userID, coachID := seedRichCoach(t, db, "e", models.FaceConsentGranted)

	past := time.Now().AddDate(0, 0, -7).Format("2006-01-02")
	mustCreate(t, db, &models.WorkSchedule{
		CoachID: coachID, CourseID: 1, Date: past,
		StartTime: "09:00", EndTime: "10:00", PayRateSnapshot: 300,
	})
	mustCreate(t, db, &models.CoachAttendance{
		CoachID: coachID, AttendanceSessionID: 1,
		WorkDate: time.Now().AddDate(0, 0, -7), CheckInTime: time.Now().AddDate(0, 0, -7),
		Status: models.AttendanceStatusPresent,
	})

	if err := NewUserService(db).DeleteUser(userID, actor); err != nil {
		t.Fatalf("ลบโค้ชควรผ่าน แต่ได้: %v", err)
	}

	var schedules, attendances int64
	db.Model(&models.WorkSchedule{}).Where("coach_id = ?", coachID).Count(&schedules)
	db.Model(&models.CoachAttendance{}).Where("coach_id = ?", coachID).Count(&attendances)

	if schedules != 1 {
		t.Errorf("คาบสอนที่ผ่านมาแล้วต้องอยู่ครบ ใช้คิดค่าจ้างย้อนหลัง แต่เหลือ %d", schedules)
	}
	if attendances != 1 {
		t.Errorf("ประวัติเช็คชื่อต้องอยู่ครบ แต่เหลือ %d", attendances)
	}
}

// filepathSlash ทำให้เทียบพาธได้เหมือนกันทั้งบน windows และ linux
func filepathSlash(p string) string { return filepath.ToSlash(p) }

// ─── 5. การลบไฟล์ต้องไม่ไต่ออกนอกโฟลเดอร์ uploads ───────────────────────────

// ค่าใน profile_picture มาจากที่แอดมินกรอก ถ้าเอาไปต่อพาธตรง ๆ
// คนที่แก้ค่าในฐานได้จะสั่งลบไฟล์อะไรก็ได้บนเครื่อง
func TestUploadFilePathStaysInsideUploads(t *testing.T) {
	cases := []struct {
		url  string
		want string
	}{
		{"/uploads/coaches/a.jpg", "uploads/coaches/a.jpg"},
		{"http://localhost:8000/uploads/home/b.png", "uploads/home/b.png"},
		{"/uploads/../../.env", "uploads/.env"},
		{"/uploads/../../../etc/passwd", "uploads/etc/passwd"},
		{"https://res.cloudinary.com/x/y.jpg", ""}, // ไม่ใช่ไฟล์ในเครื่อง
		{"", ""},
		{"/uploads/", ""},
	}

	for _, c := range cases {
		got := uploadFilePath(c.url)
		if filepathSlash(got) != c.want {
			t.Errorf("uploadFilePath(%q) = %q แต่ต้องได้ %q", c.url, filepathSlash(got), c.want)
		}
	}
}
