package main

import (
	"testing"
	"time"

	"CPE-691015/internal/models"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// fixture จำลองโครงข้อมูลจริงในฐาน ณ 28 ก.ย. 2569 (คอร์ส แพ็กเกจ เวลาเรียน โค้ช เวลาว่าง สนาม นักเรียนจริง)
func newDemoDB(t *testing.T) (*gorm.DB, time.Time) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
		Logger:                                   logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, _ := db.DB()
	sqlDB.SetMaxOpenConns(1)
	if err := db.AutoMigrate(
		&models.User{}, &models.Customer{}, &models.Coach{}, &models.CoachAvailability{},
		&models.Course{}, &models.Package{}, &models.PackageSchedule{}, &models.Enrollment{},
		&models.ClassConfirmation{}, &models.WorkSchedule{}, &models.Court{}, &models.AppSetting{},
		&models.AttendanceSession{}, &models.StudentAttendance{}, &models.CoachAttendance{},
		&models.Billing{}, &models.Notification{},
	); err != nil {
		t.Fatal(err)
	}
	mk := func(v any) {
		t.Helper()
		if err := db.Create(v).Error; err != nil {
			t.Fatal(err)
		}
	}

	// สัปดาห์หน้าเสมอ — AssignWorkSchedule ไม่รับวันที่ผ่านไปแล้ว
	now := time.Now().UTC()
	week := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC).
		AddDate(0, 0, 7-int(now.Weekday()))

	mk(&models.AppSetting{Key: "students_per_coach", Value: "6"})
	for _, n := range []string{"สนาม 1", "สนาม A", "สนาม B"} {
		mk(&models.Court{Name: n, IsActive: true})
	}

	type sch struct{ day, start, end string }
	threeDays := func(d1, d2, d3, start, end string) []sch {
		return []sch{{d1, start, end}, {d2, start, end}, {d3, start, end}}
	}
	type pkgDef struct {
		sessions  uint
		seats     uint
		schedules []sch
		real      int // นักเรียนจริงที่ลงอยู่แล้ว
	}
	courseDefs := []struct {
		name string
		pkgs []pkgDef
	}{
		{"คอร์สปกติ", []pkgDef{
			{8, 40, []sch{{"Monday", "13:00", "23:45"}, {"Tuesday", "18:00", "20:00"}, {"Friday", "18:00", "20:00"}}, 4},
			{16, 40, threeDays("Monday", "Tuesday", "Friday", "18:00", "20:00"), 1},
			{20, 40, threeDays("Monday", "Tuesday", "Friday", "18:00", "20:00"), 0},
		}},
		{"คอร์ส VIP นักกีฬา", []pkgDef{
			{8, 40, []sch{{"Monday", "18:00", "21:00"}, {"Wednesday", "21:04", "23:00"}, {"Thursday", "13:40", "14:40"}}, 3},
			{16, 40, threeDays("Monday", "Wednesday", "Friday", "18:00", "21:00"), 2},
			{20, 40, threeDays("Monday", "Wednesday", "Friday", "18:00", "21:00"), 0},
		}},
		{"คอร์ส PRIVATE (2 ชม.)", []pkgDef{
			{16, 10, threeDays("Monday", "Wednesday", "Friday", "16:00", "18:00"), 0},
		}},
		{"คอร์ส PRIVATE (1 ชม.)", []pkgDef{
			{12, 10, threeDays("Monday", "Wednesday", "Friday", "13:00", "14:00"), 0},
		}},
	}

	admin := models.User{FirstName: "แอด", LastName: "มิน", Email: "admin@real.test", Role: models.AdminRole, Password: "x"}
	mk(&admin)
	started, expires := week.AddDate(0, -1, 0), week.AddDate(0, 2, 0)
	realN := 0
	for _, cd := range courseDefs {
		c := models.Course{CourseName: cd.name, Description: "จริง", Status: models.CourseStatusActive, UserID: admin.ID}
		mk(&c)
		for _, pd := range cd.pkgs {
			p := models.Package{SessionsCount: pd.sessions, MaxSeats: pd.seats, DurationDays: 60, CourseID: c.ID, Price: 1000}
			mk(&p)
			for _, s := range pd.schedules {
				mk(&models.PackageSchedule{PackageID: p.ID, DayOfWeek: models.DayOfWeek(s.day), StartTime: s.start, EndTime: s.end})
			}
			for i := 0; i < pd.real; i++ {
				realN++
				u := models.User{FirstName: "จริง", LastName: "จริง", Email: "real" + string(rune('a'+realN)) + "@real.test", Role: models.CustomerRole, Password: "x"}
				mk(&u)
				cu := models.Customer{UserID: u.ID, Nickname: "จริง", Gender: "male", PhoneNumber: "0800000000",
					PersonalQRCode: "real-qr-" + string(rune('a'+realN))}
				mk(&cu)
				mk(&models.Enrollment{PackageID: p.ID, CustomerID: cu.ID, Status: models.EnrollmentStatusActive,
					TotalSessions: pd.sessions, RemainingSessions: pd.sessions, StartedAt: &started, ExpiresAt: &expires})
			}
		}
	}

	coachDefs := []struct {
		nick  string
		avail []sch
	}{
		{"punpun", []sch{{"Monday", "16:00", "23:59"}, {"Tuesday", "16:00", "23:59"}, {"Wednesday", "16:00", "23:59"},
			{"Thursday", "16:00", "23:59"}, {"Friday", "16:00", "23:59"}}},
		{"พี", []sch{{"Monday", "10:00", "11:00"}, {"Wednesday", "11:00", "13:00"}, {"Friday", "13:00", "14:00"}}},
	}
	for i, cd := range coachDefs {
		u := models.User{FirstName: cd.nick, LastName: "โค้ช", Email: "coach" + string(rune('a'+i)) + "@real.test", Role: models.CoachRole, Password: "x"}
		mk(&u)
		co := models.Coach{UserID: u.ID, Nickname: cd.nick, Status: "active", PaymentType: "per_session", PayRate: 300,
			Uid: "real-uid-" + cd.nick, PersonalQRCode: "real-coach-qr-" + cd.nick}
		mk(&co)
		for _, a := range cd.avail {
			mk(&models.CoachAvailability{CoachID: co.ID, DayOfWeek: models.DayOfWeek(a.day), StartTime: a.start, EndTime: a.end})
		}
	}
	return db, week
}

func TestSeedProducesPlannedCards(t *testing.T) {
	db, week := newDemoDB(t)
	if err := Seed(db, week); err != nil {
		t.Fatalf("seed ไม่สำเร็จ: %v", err)
	}
	cards, err := Verify(db, week)
	if err != nil {
		t.Fatal(err)
	}
	seen := map[cardColor]bool{}
	for _, c := range cards {
		if c.Got != c.Want {
			t.Errorf("%s (%s %s): ได้ %s ควรเป็น %s (ยืนยัน %d/%d โค้ช %v)",
				c.Title, c.Course, c.Date, c.Got, c.Want, c.Going, c.Total, c.Coaches)
		}
		seen[c.Got] = true
	}
	if !seen[red] || !seen[yellow] || !seen[green] {
		t.Errorf("ต้องมีครบทุกสี แต่ได้ %+v", cards)
	}

	// ไม่สร้างคอร์ส/แพ็กเกจใหม่ · โค้ชเพิ่มเฉพาะโค้ชจำลอง
	var courses, pkgs, coaches int64
	db.Model(&models.Course{}).Count(&courses)
	db.Model(&models.Package{}).Count(&pkgs)
	db.Model(&models.Coach{}).Count(&coaches)
	if courses != 4 || pkgs != 8 || coaches != int64(2+len(mockCoaches)) {
		t.Fatalf("ต้องใช้คอร์ส/แพ็กเกจจริงเท่านั้น แต่มี courses=%d packages=%d coaches=%d", courses, pkgs, coaches)
	}

	// ไม่แตะโค้ชจริง นักเรียนจริง และคอร์ส PRIVATE
	var realCoachJobs, privateEnroll, realConfirmed int64
	db.Model(&models.WorkSchedule{}).Joins("JOIN coaches ON coaches.id = work_schedules.coach_id").
		Where("coaches.nickname IN ?", []string{"punpun", "พี"}).Count(&realCoachJobs)
	db.Model(&models.Enrollment{}).Joins("JOIN packages ON packages.id = enrollments.package_id").
		Joins("JOIN courses ON courses.id = packages.course_id").
		Where("courses.course_name LIKE ?", "%PRIVATE%").Count(&privateEnroll)
	db.Model(&models.ClassConfirmation{}).Joins("JOIN enrollments ON enrollments.id = class_confirmations.enrollment_id").
		Joins("JOIN customers ON customers.id = enrollments.customer_id").
		Joins("JOIN users ON users.id = customers.user_id").
		Where("users.email NOT LIKE ?", demoEmailLike).Count(&realConfirmed)
	if realCoachJobs != 0 || privateEnroll != 0 || realConfirmed != 0 {
		t.Fatalf("แตะข้อมูลจริง: คาบโค้ชจริง=%d ลงคอร์ส PRIVATE=%d ยืนยันแทนนักเรียนจริง=%d",
			realCoachJobs, privateEnroll, realConfirmed)
	}
}

func TestSeedRefusesWrongRatio(t *testing.T) {
	db, week := newDemoDB(t)
	db.Model(&models.AppSetting{}).Where("key = ?", "students_per_coach").Update("value", "1")
	if err := Seed(db, week); err == nil {
		t.Fatal("อัตราส่วนไม่ตรงแผนต้องถูกปฏิเสธ")
	}
}

func TestCleanRemovesOnlyDemo(t *testing.T) {
	db, week := newDemoDB(t)
	count := func(m any) int64 {
		var n int64
		db.Unscoped().Model(m).Count(&n)
		return n
	}
	beforeUsers, beforeEnroll := count(&models.User{}), count(&models.Enrollment{})
	beforeCoaches, beforeAvail := count(&models.Coach{}), count(&models.CoachAvailability{})

	if err := Seed(db, week); err != nil {
		t.Fatal(err)
	}
	if err := Seed(db, week); err == nil {
		t.Fatal("รันซ้ำต้องถูกปฏิเสธ ไม่งั้นข้อมูลซ้อนสองชุด")
	}

	// ตารางงานของโค้ชจริงที่แอดมินมอบหมายเอง ต้องไม่ถูกลบ
	var realCoach models.Coach
	db.Where("nickname = ?", "punpun").First(&realCoach)
	var tmpl models.WorkSchedule
	db.Where("description LIKE ?", "%"+demoDescSuffix).First(&tmpl)
	realWS := tmpl
	realWS.ID, realWS.Description, realWS.CoachID = 0, "คาบจริง", realCoach.ID
	db.Create(&realWS)

	// คาบที่มอบหมายให้โค้ชจำลองสดระหว่างนำเสนอ (คำอธิบายปกติ) ต้องถูกลบด้วย
	live := tmpl
	live.ID, live.Description = 0, "มอบหมายสดตอนนำเสนอ"
	db.Create(&live)

	if _, err := Clean(db); err != nil {
		t.Fatalf("clean ไม่สำเร็จ: %v", err)
	}
	if n := count(&models.User{}); n != beforeUsers {
		t.Errorf("บัญชีผู้ใช้ต้องกลับเป็น %d แต่เหลือ %d", beforeUsers, n)
	}
	if n, a := count(&models.Coach{}), count(&models.CoachAvailability{}); n != beforeCoaches || a != beforeAvail {
		t.Errorf("โค้ช/เวลาว่างต้องกลับเป็น %d/%d (ของจริง) แต่เหลือ %d/%d", beforeCoaches, beforeAvail, n, a)
	}
	if n := count(&models.Enrollment{}); n != beforeEnroll {
		t.Errorf("ใบลงทะเบียนต้องกลับเป็น %d (ของจริง) แต่เหลือ %d", beforeEnroll, n)
	}
	for name, m := range map[string]any{"class_confirmations": &models.ClassConfirmation{}, "notifications": &models.Notification{}} {
		if n := count(m); n != 0 {
			t.Errorf("%s ยังเหลือ %d แถว", name, n)
		}
	}
	if n := count(&models.WorkSchedule{}); n != 1 {
		t.Errorf("ต้องเหลือเฉพาะตารางงานจริง 1 แถว แต่เหลือ %d", n)
	}
	if err := Seed(db, week); err != nil {
		t.Fatalf("สร้างใหม่หลัง clean ไม่สำเร็จ: %v", err)
	}
}

func TestParseWeekRejectsNonSunday(t *testing.T) {
	if _, err := parseWeek("2026-10-05"); err == nil {
		t.Fatal("วันจันทร์ต้องถูกปฏิเสธ")
	}
	w, err := parseWeek("")
	if err != nil || w.Weekday() != time.Sunday {
		t.Fatalf("ค่าเริ่มต้นต้องเป็นวันอาทิตย์ ได้ %v %v", w, err)
	}
}
