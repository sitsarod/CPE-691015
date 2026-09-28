package main

import (
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
	"CPE-691015/internal/services"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// ข้อมูลจำลองสำหรับนำเสนอหน้า "จัดตารางสอน" บนคอร์ส/แพ็กเกจ/สนามที่มีอยู่จริง
// สร้างเฉพาะนักเรียนจำลองกับโค้ชจำลอง แล้วมอบหมายผ่าน AssignWorkSchedule ตัวเดียวกับหน้าเว็บ
// ไม่สร้างคอร์สหรือแพ็กเกจใหม่ และไม่แตะนักเรียน/โค้ชจริง

const (
	demoPassword   = "password123"
	demoEmailLike  = "mock.demo.%@example.com"
	demoDescSuffix = " (เดโม)" // ท้ายคำอธิบายของตารางงานที่ seeder สร้าง ใช้หาตอน -clean
	demoPerCoach   = 6        // ตัวเลขในแผนด้านล่างออกแบบไว้ที่อัตราส่วนนี้
)

func studentEmail(i int) string { return fmt.Sprintf("mock.demo.s%02d@example.com", i) }

type cardColor string

const (
	red    cardColor = "แดง (ยังไม่ได้จัดโค้ช)"
	yellow cardColor = "เหลือง (มีโค้ชแต่ยังไม่พอ)"
	green  cardColor = "เขียว (จัดโค้ชครบแล้ว)"
)

// enrollPlan = นักเรียนจำลองกลุ่มหนึ่งลงแพ็กเกจจริง แล้วยืนยันมาเรียนบางวันของสัปดาห์
type enrollPlan struct {
	course   string
	sessions uint                 // ระบุแพ็กเกจด้วยจำนวนครั้ง (ไม่ซ้ำกันในคอร์สเดียวกัน)
	students []int                // เลขนักเรียนจำลอง 1..n
	going    map[time.Weekday]int // วัน → จำนวนคนที่ยืนยัน (นับจากคนแรกของกลุ่ม)
}

// assignPlan = มอบหมายโค้ชจริงให้คาบจริง
type assignPlan struct {
	course string
	day    time.Weekday
	start  string
	coach  string // ชื่อเล่นโค้ช
	court  string // ชื่อสนาม
}

// cardPlan = การ์ดที่ต้องเห็นบนหน้าจัดตารางสอน
type cardPlan struct {
	title  string
	course string
	day    time.Weekday
	start  string
	want   cardColor
}

func span(from, to int) []int {
	out := make([]int, 0, to-from+1)
	for i := from; i <= to; i++ {
		out = append(out, i)
	}
	return out
}

// ⚠️ แผนนี้อิงข้อมูลจริงในฐาน ณ 28 ก.ย. 2569 — คอร์ส/แพ็กเกจเปลี่ยนเมื่อไหร่ต้องแก้ตาม
// ใช้แค่คอร์สปกติกับคอร์ส VIP · ทุกคาบมีนักเรียนจริงอยู่แล้วซึ่งไม่แตะ จึงไม่มีการ์ดที่ยืนยันครบทุกคน
// ไม่ลงวันจันทร์เพราะเป็นวันที่รัน การ์ดจะกลายเป็นอดีตทันทีวันรุ่งขึ้น
var (
	regular = "คอร์สปกติ"
	vip     = "คอร์ส VIP นักกีฬา"

	// สามกลุ่มไม่ซ้อนกัน เพราะวันจันทร์สามแพ็กเกจนี้เวลาทับกัน (นักเรียนคนเดียวเรียนสองที่พร้อมกันไม่ได้)
	enrollPlans = []enrollPlan{
		{course: regular, sessions: 20, students: span(1, 12), // จ./อ./ศ. 18:00-20:00
			going: map[time.Weekday]int{time.Tuesday: 12, time.Friday: 10}},
		{course: vip, sessions: 20, students: span(13, 26), // จ./พ./ศ. 18:00-21:00
			going: map[time.Weekday]int{time.Wednesday: 13, time.Friday: 6}},
		{course: vip, sessions: 8, students: span(27, 33), // จ. 18:00 · พ. 21:04 · พฤ. 13:40
			going: map[time.Weekday]int{time.Thursday: 7}},
	}

	assignPlans = []assignPlan{
		{course: regular, day: time.Tuesday, start: "18:00", coach: "โค้ชเอ็ม", court: "สนาม 1"},
		{course: regular, day: time.Tuesday, start: "18:00", coach: "โค้ชเจน", court: "สนาม 1"},
		{course: vip, day: time.Wednesday, start: "18:00", coach: "โค้ชเอ็ม", court: "สนาม A"},
		{course: vip, day: time.Thursday, start: "13:40", coach: "โค้ชเจน", court: "สนาม 1"},
		{course: vip, day: time.Friday, start: "18:00", coach: "โค้ชบอส", court: "สนาม B"},
	}

	cardPlans = []cardPlan{
		{"จัดโค้ชครบ (นักเรียนจำลองยืนยันครบ นักเรียนจริงยังไม่ตอบ)", regular, time.Tuesday, "18:00", green},
		{"โค้ชไม่พอ — ควรเพิ่มอีก 2 โค้ช", vip, time.Wednesday, "18:00", yellow},
		{"ยังไม่มีใครยืนยัน + ยังไม่ได้จัดโค้ช", vip, time.Wednesday, "21:04", red},
		{"โค้ชไม่พอ — ควรเพิ่มอีก 1 โค้ช", vip, time.Thursday, "13:40", yellow},
		{"มีคนยืนยันแล้ว แต่ยังไม่ได้จัดโค้ช", regular, time.Friday, "18:00", red},
		{"ยืนยันบางส่วน + จัดโค้ชครบ", vip, time.Friday, "18:00", green},
	}

	// โค้ชจำลอง ว่างทุกวัน 12:00-23:59 ให้มอบหมายสดระหว่างนำเสนอได้ทุกคาบ
	mockCoaches = [][3]string{{"เอกชัย", "ศักดิ์ดี", "โค้ชเอ็ม"}, {"เจนจิรา", "พรหมศร", "โค้ชเจน"}, {"บดินทร์", "ใจกล้า", "โค้ชบอส"}}

	firstNames = []string{"ภูมิ", "ปัณณ์", "ธนา", "กันต์", "ณัฐ", "พีร", "ภัทร", "ชนก", "ปาริชาต", "อรณิชา",
		"ศิริ", "วรัญญา", "กิตติ", "ธีร", "นภัส", "พิมพ์", "สรวิศ", "ญาดา", "ภาคิน", "ธัญ", "ปวริศ", "ชญาดา",
		"กฤต", "ณิชา", "ธาม", "อชิระ", "ปุณณ์", "เขมิกา", "ชยพล", "ศุภ", "มินตรา"}
	lastNames = []string{"ใจดี", "สุขสม", "ทองคำ", "รุ่งเรือง", "ศรีสุข", "มั่นคง", "แสงทอง", "บุญมา"}
	nicknames = []string{"น้องภูมิ", "น้องปัณณ์", "น้องกล้า", "น้องกันต์", "น้องณัฐ", "น้องพีช", "น้องภัทร", "น้องแพรว",
		"น้องปาล์ม", "น้องออม", "น้องเตย", "น้องมิว", "น้องกิต", "น้องธีร์", "น้องนภ", "น้องพิม",
		"น้องวิน", "น้องญา", "น้องคิน", "น้องธัญ", "น้องปาย", "น้องชบา", "น้องกฤต", "น้องนิชา",
		"น้องธาม", "น้องเอ", "น้องปุณ", "น้องเขม", "น้องพล", "น้องศุภ", "น้องมิน"}
)

func studentCount() int {
	n := 0
	for _, p := range enrollPlans {
		for _, s := range p.students {
			n = max(n, s)
		}
	}
	return n
}

// Seed สร้างข้อมูลจำลองของสัปดาห์ที่เริ่มวันอาทิตย์ week · ปฏิเสธถ้ามีข้อมูลจำลองอยู่แล้ว
func Seed(db *gorm.DB, week time.Time) error {
	if week.Weekday() != time.Sunday {
		return fmt.Errorf("วันเริ่มสัปดาห์ต้องเป็นวันอาทิตย์ (ได้ %s)", week.Weekday())
	}
	if p := services.NewSettingsService(db).GetStudentsPerCoach(); p != demoPerCoach {
		return fmt.Errorf("แผนนี้ออกแบบไว้ที่นักเรียน %d คนต่อโค้ช 1 คน แต่ระบบตั้งไว้ %d — รันด้วย -ratio %d",
			demoPerCoach, p, demoPerCoach)
	}

	var n int64
	db.Unscoped().Model(&models.User{}).Where("email LIKE ?", demoEmailLike).Count(&n)
	if n > 0 {
		return errors.New("มีข้อมูลจำลองอยู่แล้ว — รัน -clean ก่อน หรือใช้ -reset")
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte(demoPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	// ทรานแซกชันเดียว — ขั้นไหนพลาด (เช่นโค้ชไม่ว่าง สนามชน) ต้องไม่เหลือข้อมูลครึ่ง ๆ
	return db.Transaction(func(tx *gorm.DB) error {
		students, err := seedStudents(tx, studentCount(), string(hashed))
		if err != nil {
			return err
		}
		for _, p := range enrollPlans {
			if err := seedEnrollments(tx, p, week, students); err != nil {
				return fmt.Errorf("%s %d ครั้ง: %w", p.course, p.sessions, err)
			}
		}
		if err := seedCoaches(tx, string(hashed)); err != nil {
			return err
		}
		for _, a := range assignPlans {
			if err := seedAssignment(tx, a, week); err != nil {
				return fmt.Errorf("มอบหมาย %s ให้ %s วัน%s %s: %w", a.coach, a.course, a.day, a.start, err)
			}
		}
		return nil
	})
}

func seedStudents(tx *gorm.DB, count int, hashed string) (map[int]models.Customer, error) {
	now := time.Now()
	out := make(map[int]models.Customer, count)
	for i := 1; i <= count; i++ {
		k := i - 1
		user := models.User{
			FirstName: firstNames[k%len(firstNames)], LastName: lastNames[k%len(lastNames)],
			Email: studentEmail(i), Password: hashed, Role: models.CustomerRole, EmailVerifiedAt: &now,
		}
		if err := tx.Create(&user).Error; err != nil {
			return nil, fmt.Errorf("สร้างนักเรียน %s ไม่สำเร็จ: %w", user.Email, err)
		}
		qr, err := services.GenerateUniqueQRCode(tx)
		if err != nil {
			return nil, err
		}
		code, err := services.GenerateMemberCode(tx, models.CustomerRole)
		if err != nil {
			return nil, err
		}
		gender := models.Gender(models.GenderMale)
		if k%2 == 1 {
			gender = models.Gender(models.GenderFemale)
		}
		cust := models.Customer{
			UserID: user.ID, Nickname: nicknames[k%len(nicknames)], Gender: gender,
			BirthDate:   time.Date(2010+k%8, time.Month(1+k%12), 1+k%27, 0, 0, 0, 0, time.UTC),
			PhoneNumber: fmt.Sprintf("08990%05d", i), PersonalQRCode: qr, MemberCode: code,
			Status: models.CustomerStatusActive,
		}
		if err := tx.Create(&cust).Error; err != nil {
			return nil, err
		}
		out[i] = cust
	}
	return out, nil
}

func coachEmail(i int) string { return fmt.Sprintf("mock.demo.coach%d@example.com", i) }

func seedCoaches(tx *gorm.DB, hashed string) error {
	now := time.Now()
	days := []models.DayOfWeek{models.Sunday, models.Monday, models.Tuesday, models.Wednesday,
		models.Thursday, models.Friday, models.Saturday}
	for i, n := range mockCoaches {
		user := models.User{FirstName: n[0], LastName: n[1], Email: coachEmail(i + 1),
			Password: hashed, Role: models.CoachRole, EmailVerifiedAt: &now}
		if err := tx.Create(&user).Error; err != nil {
			return fmt.Errorf("สร้างโค้ช %s ไม่สำเร็จ: %w", user.Email, err)
		}
		qr, err := services.GenerateUniqueQRCode(tx)
		if err != nil {
			return err
		}
		code, err := services.GenerateMemberCode(tx, models.CoachRole)
		if err != nil {
			return err
		}
		coach := models.Coach{
			UserID: user.ID, Nickname: n[2], Phone: fmt.Sprintf("08880%05d", i+1),
			Uid: fmt.Sprintf("MOCKDEMO%02d", i+1), Address: "ข้อมูลจำลองสำหรับนำเสนอ", BirthDate: "1995-01-01",
			Specialization: "B", CoachLicense: "License B", BankAccount: "-", PaymentInfo: "-",
			Status: "active", PaymentType: services.PaymentTypePerSession, PayRate: 300,
			PersonalQRCode: qr, MemberCode: code,
		}
		if err := tx.Create(&coach).Error; err != nil {
			return err
		}
		for _, d := range days {
			if err := tx.Create(&models.CoachAvailability{CoachID: coach.ID, DayOfWeek: d,
				StartTime: "12:00", EndTime: "23:59"}).Error; err != nil {
				return err
			}
		}
	}
	return nil
}

// findPackage หาแพ็กเกจจริงจากชื่อคอร์ส + จำนวนครั้ง
func findPackage(tx *gorm.DB, course string, sessions uint) (*models.Package, error) {
	var pkg models.Package
	err := tx.Preload("Schedules").
		Joins("JOIN courses ON courses.id = packages.course_id AND courses.deleted_at IS NULL").
		Where("courses.course_name = ? AND packages.sessions_count = ?", course, sessions).
		First(&pkg).Error
	if err != nil {
		return nil, fmt.Errorf("ไม่พบแพ็กเกจ %d ครั้งของ %q ในระบบ", sessions, course)
	}
	return &pkg, nil
}

func scheduleOn(pkg *models.Package, day time.Weekday) *models.PackageSchedule {
	for i := range pkg.Schedules {
		if string(pkg.Schedules[i].DayOfWeek) == day.String() {
			return &pkg.Schedules[i]
		}
	}
	return nil
}

func seedEnrollments(tx *gorm.DB, p enrollPlan, week time.Time, students map[int]models.Customer) error {
	pkg, err := findPackage(tx, p.course, p.sessions)
	if err != nil {
		return err
	}

	started := week.AddDate(0, 0, -14)
	expires := week.AddDate(0, 0, int(pkg.DurationDays))
	now := time.Now()

	enrollments := make([]models.Enrollment, 0, len(p.students))
	for _, idx := range p.students {
		e := models.Enrollment{
			EnrollmentDate: started, TotalSessions: pkg.SessionsCount, RemainingSessions: pkg.SessionsCount - 1,
			Status: models.EnrollmentStatusActive, AgreedPrice: pkg.Price,
			StartedAt: &started, ExpiresAt: &expires, PackageID: pkg.ID, CustomerID: students[idx].ID,
		}
		if err := tx.Create(&e).Error; err != nil {
			return err
		}
		enrollments = append(enrollments, e)
	}

	for day, going := range p.going {
		sch := scheduleOn(pkg, day)
		if sch == nil {
			return fmt.Errorf("แพ็กเกจไม่มีคาบวัน%s", day)
		}
		classDate := week.AddDate(0, 0, int(day))
		for i := 0; i < going && i < len(enrollments); i++ {
			if err := tx.Create(&models.ClassConfirmation{
				EnrollmentID: enrollments[i].ID, ClassDate: classDate, Status: models.ClassConfirmationGoing,
				ScheduleStartTime: sch.StartTime, ScheduleEndTime: sch.EndTime, RespondedAt: now,
			}).Error; err != nil {
				return err
			}
		}
	}
	return nil
}

// seedAssignment มอบหมายผ่าน AssignWorkSchedule ตัวเดียวกับหน้าเว็บ — ได้ด่านเวลาว่าง/เวลาชน/สนามชนครบ
func seedAssignment(tx *gorm.DB, a assignPlan, week time.Time) error {
	var course models.Course
	if err := tx.Where("course_name = ?", a.course).First(&course).Error; err != nil {
		return fmt.Errorf("ไม่พบคอร์ส %q", a.course)
	}
	var sch models.PackageSchedule
	if err := tx.Joins("JOIN packages ON packages.id = package_schedules.package_id AND packages.deleted_at IS NULL").
		Where("packages.course_id = ? AND package_schedules.day_of_week = ? AND package_schedules.start_time = ?",
			course.ID, a.day.String(), a.start).
		Order("packages.id ASC").First(&sch).Error; err != nil {
		return fmt.Errorf("ไม่พบคาบวัน%s %s ของคอร์สนี้", a.day, a.start)
	}
	var coach models.Coach
	if err := tx.Where("nickname = ?", a.coach).First(&coach).Error; err != nil {
		return fmt.Errorf("ไม่พบโค้ชชื่อเล่น %q", a.coach)
	}
	var court models.Court
	if err := tx.Where("name = ?", a.court).First(&court).Error; err != nil {
		return fmt.Errorf("ไม่พบสนาม %q", a.court)
	}

	pkgID, schID, courtID := sch.PackageID, sch.ID, court.ID
	_, err := services.NewWorkScheduleService(tx).AssignWorkSchedule(dto.CreateWorkScheduleRequest{
		CoachID: coach.ID, CourseID: course.ID,
		Date:      week.AddDate(0, 0, int(a.day)).Format("2006-01-02"),
		StartTime: sch.StartTime, EndTime: sch.EndTime,
		CourtID: &courtID, Description: course.CourseName + demoDescSuffix,
		PackageID: &pkgID, PackageScheduleID: &schID,
	})
	return err
}

// CheckedCard = การ์ดหนึ่งใบตามที่หน้าจัดตารางสอนจะแสดงจริง
type CheckedCard struct {
	Title     string
	Course    string
	Date      string
	Time      string
	Going     int
	Total     int
	Coaches   []string
	Suggested int
	Got, Want cardColor
}

// Verify อ่านผ่าน GetWeekSessions ตัวเดียวกับหน้าเว็บ แล้วคิดสีด้วยกติกาเดียวกับ coachschedule/page.tsx
func Verify(db *gorm.DB, week time.Time) ([]CheckedCard, error) {
	sessions, err := services.NewWorkScheduleService(db).GetWeekSessions(week.Format("2006-01-02"))
	if err != nil {
		return nil, err
	}
	p := services.NewSettingsService(db).GetStudentsPerCoach()

	byKey := map[string]dto.WeekSessionResponse{}
	for _, s := range sessions {
		byKey[s.Date+" "+s.StartTime+" "+s.CourseName] = s
	}

	out := make([]CheckedCard, 0, len(cardPlans))
	for _, c := range cardPlans {
		date := week.AddDate(0, 0, int(c.day)).Format("2006-01-02")
		card := CheckedCard{Title: c.title, Course: c.course, Date: date, Time: c.start, Want: c.want}
		s, ok := byKey[date+" "+c.start+" "+c.course]
		if !ok {
			card.Got = "ไม่พบการ์ด"
			out = append(out, card)
			continue
		}
		card.Time = s.StartTime + "-" + s.EndTime
		card.Going, card.Total = s.GoingCount, s.TotalCount
		for _, ac := range s.AssignedCoaches {
			card.Coaches = append(card.Coaches, ac.CoachName)
		}
		if s.GoingCount > 0 {
			card.Suggested = (s.GoingCount + p - 1) / p
		}
		switch {
		case len(card.Coaches) == 0:
			card.Got = red
		case card.Suggested > len(card.Coaches):
			card.Got = yellow
		default:
			card.Got = green
		}
		out = append(out, card)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Date+out[i].Time < out[j].Date+out[j].Time })
	return out, nil
}

// Clean ลบเฉพาะสิ่งที่ seeder สร้าง: นักเรียน/โค้ชจำลองกับทุกอย่างของเขา + ตารางงานที่คำอธิบายลงท้าย (เดโม)
// ⚠️ ไม่ลบคอร์ส แพ็กเกจ โค้ชจริง สนาม หรือรอบเช็คชื่อ — เป็นข้อมูลจริง
func Clean(db *gorm.DB) (map[string]int64, error) {
	counts := map[string]int64{}
	err := db.Transaction(func(tx *gorm.DB) error {
		// Session ทำให้ใช้ u ซ้ำได้ ไม่งั้นเงื่อนไข Where ของแต่ละขั้นจะสะสมต่อกัน
		u := tx.Unscoped().Session(&gorm.Session{})

		var userIDs, customerIDs, coachIDs, enrollIDs, wsIDs []uint
		u.Model(&models.User{}).Where("email LIKE ?", demoEmailLike).Pluck("id", &userIDs)
		u.Model(&models.Customer{}).Where("user_id IN ?", orZero(userIDs)).Pluck("id", &customerIDs)
		u.Model(&models.Coach{}).Where("user_id IN ?", orZero(userIDs)).Pluck("id", &coachIDs)
		u.Model(&models.Enrollment{}).Where("customer_id IN ?", orZero(customerIDs)).Pluck("id", &enrollIDs)
		// รวมคาบที่มอบหมายให้โค้ชจำลองสด ๆ ระหว่างนำเสนอด้วย
		u.Model(&models.WorkSchedule{}).Where("description LIKE ? OR coach_id IN ?", "%"+demoDescSuffix, orZero(coachIDs)).Pluck("id", &wsIDs)

		sigs := make([]string, 0, len(wsIDs))
		for _, id := range wsIDs {
			sigs = append(sigs, fmt.Sprintf("workschedule-%d", id))
		}
		if len(sigs) == 0 {
			sigs = []string{"-"}
		}

		steps := []struct {
			name  string
			model any
			where string
			args  []any
		}{
			{"เช็คชื่อนักเรียนจำลอง", &models.StudentAttendance{}, "enrollment_id IN ?", []any{orZero(enrollIDs)}},
			{"บิลของนักเรียนจำลอง", &models.Billing{}, "customer_id IN ?", []any{orZero(userIDs)}},
			{"ยืนยันมาเรียน", &models.ClassConfirmation{}, "enrollment_id IN ?", []any{orZero(enrollIDs)}},
			{"ใบลงทะเบียน", &models.Enrollment{}, "id IN ?", []any{orZero(enrollIDs)}},
			{"แจ้งเตือนมอบหมายงานเดโม", &models.Notification{}, "type = ? AND signature IN ?", []any{"work_assigned", sigs}},
			{"ตารางงานเดโม", &models.WorkSchedule{}, "id IN ?", []any{orZero(wsIDs)}},
			{"เช็คชื่อโค้ชจำลอง", &models.CoachAttendance{}, "coach_id IN ?", []any{orZero(coachIDs)}},
			{"เวลาว่างโค้ชจำลอง", &models.CoachAvailability{}, "coach_id IN ?", []any{orZero(coachIDs)}},
			{"แจ้งเตือนของบัญชีจำลอง", &models.Notification{}, "user_id IN ?", []any{orZero(userIDs)}},
			{"โค้ชจำลอง", &models.Coach{}, "id IN ?", []any{orZero(coachIDs)}},
			{"นักเรียนจำลอง", &models.Customer{}, "id IN ?", []any{orZero(customerIDs)}},
			{"บัญชีจำลอง", &models.User{}, "id IN ?", []any{orZero(userIDs)}},
		}
		for _, st := range steps {
			res := u.Where(st.where, st.args...).Delete(st.model)
			if res.Error != nil {
				return fmt.Errorf("ลบ%sไม่สำเร็จ: %w", st.name, res.Error)
			}
			counts[st.name] += res.RowsAffected
		}
		return nil
	})
	return counts, err
}

// orZero กัน IN () ว่าง — id 0 ไม่มีอยู่จริง
func orZero(ids []uint) []uint {
	if len(ids) == 0 {
		return []uint{0}
	}
	return ids
}

func joinNames(names []string) string {
	if len(names) == 0 {
		return "-"
	}
	return strings.Join(names, ", ")
}
