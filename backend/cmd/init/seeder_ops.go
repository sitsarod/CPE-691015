package main

import (
	"fmt"
	"log"
	"time"

	"CPE-691015/internal/models"
	"gorm.io/gorm"
)

// ─────────────────────────────────────────────────────────────────────────────
// Seed ข้อมูล "ดำเนินงาน" เพื่อให้ UI มีข้อมูลจริงให้ดู:
//   • การเงิน  — ลงทะเบียน + บิล + ใบแจ้งหนี้ (กระจายบิลที่จ่ายแล้วย้อนหลัง 6 เดือน
//                สำหรับกราฟรายได้ + มีบิลค้าง/เกินกำหนด/รอตรวจของเดือนนี้)
//   • คาบสอน   — WorkSchedule ของโค้ช (มีทั้งคาบที่ผ่านมาและที่กำลังจะถึง)
//   • รายจ่าย  — Expense หลายประเภทย้อนหลัง 6 เดือน
//
// ทั้งหมด idempotent: ถ้ามีข้อมูลอยู่แล้วจะข้าม ต้องรันหลัง seed คอร์ส/ลูกค้า/โค้ช
// ─────────────────────────────────────────────────────────────────────────────

// backdate ตั้ง created_at/updated_at ของแถวเป็นเวลาที่กำหนด (UpdateColumns ไม่ให้ auto-time เขียนทับ)
func backdate(db *gorm.DB, model interface{}, t time.Time) {
	db.Model(model).UpdateColumns(map[string]interface{}{
		"created_at": t,
		"updated_at": t,
	})
}

// monthsAgo คืนเวลาวันที่ 15 ของเดือนย้อนหลัง n เดือน (ใช้วัน 15 กันเดือนล้นตอน AddDate)
func monthsAgo(n int) time.Time {
	now := time.Now()
	return time.Date(now.Year(), now.Month(), 15, 10, 0, 0, 0, now.Location()).AddDate(0, -n, 0)
}

type studentRef struct {
	userID     uint // users.id — ใช้กับ billings.customer_id / invoices.customer_id
	customerID uint // customers.id — ใช้กับ enrollments.customer_id
}

func loadStudents(db *gorm.DB, emails []string) []studentRef {
	var out []studentRef
	for _, email := range emails {
		var u models.User
		if err := db.Where("email = ?", email).First(&u).Error; err != nil {
			continue
		}
		var c models.Customer
		if err := db.Where("user_id = ?", u.ID).First(&c).Error; err != nil {
			continue
		}
		out = append(out, studentRef{userID: u.ID, customerID: c.ID})
	}
	return out
}

// priceyPackage คืนแพ็กเกจราคาถูกสุดที่ราคา > 0 ของคอร์สนั้น (คอร์ส PRIVATE ราคา 0 จะถูกข้าม)
func priceyPackage(db *gorm.DB, courseName string) (models.Package, bool) {
	var course models.Course
	if err := db.Where("course_name = ?", courseName).First(&course).Error; err != nil {
		return models.Package{}, false
	}
	var pkg models.Package
	if err := db.Where("course_id = ? AND price > 0", course.ID).Order("price ASC").First(&pkg).Error; err != nil {
		return models.Package{}, false
	}
	return pkg, true
}

func seedOperationalData(db *gorm.DB) {
	var admin models.User
	if err := db.Where("role = ?", models.AdminRole).First(&admin).Error; err != nil {
		log.Printf("[seed-ops] ไม่พบแอดมิน ข้ามการ seed ข้อมูลดำเนินงาน: %v", err)
		return
	}

	var billingType models.BillingType
	if err := db.Where("billing_type_name = ?", "ค่าคอร์สเรียน").First(&billingType).Error; err != nil {
		if err := db.First(&billingType).Error; err != nil {
			log.Printf("[seed-ops] ไม่พบประเภทบิล ข้ามการ seed การเงิน: %v", err)
			return
		}
	}

	seedFinance(db, admin, billingType)
	seedWorkSchedules(db)
	seedExpenses(db)
}

// ── การเงิน ──

type financePlan struct {
	stu        studentRef
	pkg        models.Package
	courseName string
	monthsAgo  int
	status     string // paid | unfunded | overdue | waitcheck
}

func seedFinance(db *gorm.DB, admin models.User, billingType models.BillingType) {
	var count int64
	db.Model(&models.Billing{}).Count(&count)
	if count > 0 {
		fmt.Println("ข้ามการ Seed การเงิน เนื่องจากมีบิลอยู่แล้ว")
		return
	}

	students := loadStudents(db, []string{"student1@gmail.com", "student2@gmail.com", "student3@gmail.com"})
	if len(students) < 3 {
		log.Println("[seed-ops] ต้องมีนักเรียนอย่างน้อย 3 คนก่อน ข้ามการ seed การเงิน")
		return
	}

	normalPkg, okA := priceyPackage(db, "คอร์สปกติ")
	vipPkg, okB := priceyPackage(db, "คอร์ส VIP นักกีฬา")
	if !okA || !okB {
		log.Println("[seed-ops] ไม่พบแพ็กเกจคอร์ส ข้ามการ seed การเงิน")
		return
	}

	const normal, vip = "คอร์สปกติ", "คอร์ส VIP นักกีฬา"
	plans := []financePlan{
		// จ่ายแล้ว — กระจาย 2 รายการต่อเดือน ย้อนหลัง 6 เดือน (สำหรับกราฟรายได้)
		{students[0], normalPkg, normal, 5, "paid"},
		{students[1], vipPkg, vip, 5, "paid"},
		{students[1], vipPkg, vip, 4, "paid"},
		{students[2], normalPkg, normal, 4, "paid"},
		{students[2], normalPkg, normal, 3, "paid"},
		{students[0], vipPkg, vip, 3, "paid"},
		{students[0], vipPkg, vip, 2, "paid"},
		{students[1], normalPkg, normal, 2, "paid"},
		{students[1], normalPkg, normal, 1, "paid"},
		{students[2], vipPkg, vip, 1, "paid"},
		{students[2], vipPkg, vip, 0, "paid"},
		{students[0], normalPkg, normal, 0, "paid"},
		// เดือนนี้ — ยังไม่จ่าย (ให้เห็นในหน้าชำระเงินลูกค้า + การ์ดแจ้งเตือนแอดมิน)
		{students[0], normalPkg, normal, 0, "unfunded"},  // ค้างชำระ (ยังไม่ถึงกำหนด)
		{students[1], vipPkg, vip, 0, "overdue"},         // เกินกำหนด (แดง)
		{students[2], normalPkg, normal, 0, "waitcheck"}, // รอแอดมินตรวจสลิป
	}

	for _, p := range plans {
		createEnrollmentWithBilling(db, admin, billingType, p)
	}
	fmt.Printf("Seed การเงิน (บิล/ใบแจ้งหนี้/ลงทะเบียน) %d รายการสำเร็จเรียบร้อย!\n", len(plans))
}

func createEnrollmentWithBilling(db *gorm.DB, admin models.User, bType models.BillingType, p financePlan) {
	when := monthsAgo(p.monthsAgo)

	// วันครบกำหนด: จ่ายแล้ว/ค้าง = จากวันออกบิล, เกินกำหนด = อดีต, ค้าง(ยังไม่ถึง) = อนาคต
	dueDate := when.AddDate(0, 0, 7)
	switch p.status {
	case "overdue":
		dueDate = time.Now().AddDate(0, 0, -5)
	case "unfunded":
		dueDate = time.Now().AddDate(0, 0, 10)
	}

	billStatus := models.StatusUnfunded
	switch p.status {
	case "paid":
		billStatus = models.StatusPaid
	case "waitcheck":
		billStatus = models.StatusWaitCheck
	case "overdue":
		billStatus = models.StatusOverdue
	}

	adminID := admin.ID
	billing := models.Billing{
		Description:   fmt.Sprintf("ค่าลงทะเบียน: %s (เรียน %d ครั้ง)", p.courseName, p.pkg.SessionsCount),
		Amount:        p.pkg.Price,
		DueDate:       dueDate,
		Status:        billStatus,
		BillingTypeID: bType.ID,
		CustomerID:    p.stu.userID,
		AdminID:       &adminID,
	}
	if err := db.Create(&billing).Error; err != nil {
		log.Printf("[seed-ops] สร้างบิลไม่สำเร็จ: %v", err)
		return
	}
	backdate(db, &billing, when)

	// enrollment: จ่ายแล้ว = active (ใช้ไปครึ่งหนึ่งให้ session usage มีค่า), ยังไม่จ่าย = awaiting_payment
	enrStatus := models.EnrollmentStatusActive
	remaining := p.pkg.SessionsCount
	if p.status == "paid" {
		remaining = p.pkg.SessionsCount / 2
	} else {
		enrStatus = models.EnrollmentStatusAwaitingPayment
	}
	startedAt := when
	expiresAt := when.AddDate(0, 0, int(p.pkg.DurationDays))
	billingID := billing.ID
	enr := models.Enrollment{
		EnrollmentDate:    when,
		TotalSessions:     p.pkg.SessionsCount,
		RemainingSessions: remaining,
		Status:            enrStatus,
		StartedAt:         &startedAt,
		ExpiresAt:         &expiresAt,
		PackageID:         p.pkg.ID,
		CustomerID:        p.stu.customerID,
		BillingID:         &billingID,
	}
	if err := db.Create(&enr).Error; err != nil {
		log.Printf("[seed-ops] สร้างการลงทะเบียนไม่สำเร็จ: %v", err)
		return
	}
	backdate(db, &enr, when)

	// จ่ายแล้ว/รอตรวจ ต้องมีใบแจ้งหนี้ (DTO ของบิล derive สถานะจาก invoice):
	//   invoice success            → บิลแสดง "paid" + paid_at = invoice.updated_at
	//   invoice pending + มีสลิป    → บิลแสดง "waitcheck"
	if p.status == "paid" || p.status == "waitcheck" {
		invStatus := models.InvoiceSuccess
		if p.status == "waitcheck" {
			invStatus = models.InvoicePending
		}
		inv := models.Invoice{
			TotalAmount:  p.pkg.Price,
			Status:       invStatus,
			SlipImageUrl: "https://example.com/slips/slip-demo.png",
			Method:       models.MethodBankTransfer,
			CustomerID:   p.stu.userID,
			PaymentItem:  []models.PaymentItem{{BillingID: billing.ID}},
		}
		if err := db.Create(&inv).Error; err != nil {
			log.Printf("[seed-ops] สร้างใบแจ้งหนี้ไม่สำเร็จ: %v", err)
			return
		}
		// paid_at ของบิล = invoice.updated_at → กำหนดเดือนที่รายได้ตกลงในกราฟ
		backdate(db, &inv, when)
	}
}

// ── คาบสอน ──

func seedWorkSchedules(db *gorm.DB) {
	var count int64
	db.Model(&models.WorkSchedule{}).Count(&count)
	if count > 0 {
		fmt.Println("ข้ามการ Seed คาบสอน เนื่องจากมีข้อมูลอยู่แล้ว")
		return
	}

	var coaches []models.Coach
	db.Order("id ASC").Limit(2).Find(&coaches)
	if len(coaches) == 0 {
		log.Println("[seed-ops] ไม่พบโค้ช ข้ามการ seed คาบสอน")
		return
	}
	var courses []models.Course
	db.Order("id ASC").Find(&courses)
	if len(courses) == 0 {
		log.Println("[seed-ops] ไม่พบคอร์ส ข้ามการ seed คาบสอน")
		return
	}

	now := time.Now()
	// ออฟเซ็ตวัน: ลบ = ผ่านมาแล้ว, 0/บวก = กำลังจะถึง (dashboard โค้ชโชว์ที่ date >= วันนี้)
	dayOffsets := []int{-7, -3, -1, 0, 1, 2, 4, 6, 9}
	slots := []struct{ start, end string }{
		{"18:00", "20:00"},
		{"17:00", "19:00"},
		{"19:00", "21:00"},
	}

	created := 0
	for ci, coach := range coaches {
		for i, off := range dayOffsets {
			course := courses[(i+ci)%len(courses)]
			slot := slots[i%len(slots)]
			ws := models.WorkSchedule{
				Date:        now.AddDate(0, 0, off).Format("2006-01-02"),
				StartTime:   slot.start,
				EndTime:     slot.end,
				Description: "สอน" + course.CourseName,
				Courtnumber: fmt.Sprintf("%d", (i%4)+1),
				CoachID:     coach.ID,
				CourseID:    course.ID,
			}
			if err := db.Create(&ws).Error; err != nil {
				log.Printf("[seed-ops] สร้างคาบสอนไม่สำเร็จ: %v", err)
				continue
			}
			created++
		}
	}
	fmt.Printf("Seed คาบสอน %d รายการสำเร็จเรียบร้อย!\n", created)
}

// ── รายจ่าย ──

func seedExpenses(db *gorm.DB) {
	var count int64
	db.Model(&models.Expense{}).Count(&count)
	if count > 0 {
		fmt.Println("ข้ามการ Seed รายจ่าย เนื่องจากมีข้อมูลอยู่แล้ว")
		return
	}

	var coach models.Coach
	hasCoach := db.Order("id ASC").First(&coach).Error == nil

	type exp struct {
		monthsAgo int
		amount    float64
		etype     models.ExpenseType
		desc      string
		withCoach bool
	}
	// ต่อเดือนราว 2,400–2,600 บาท ให้ต่ำกว่ารายได้ (กำไรเป็นบวก)
	exps := []exp{
		{5, 1600, models.ExpenseTypeCoach, "ค่าจ้างโค้ชประจำเดือน", true},
		{5, 800, models.ExpenseTypeCourt, "ค่าเช่าสนามซ้อม", false},
		{4, 1600, models.ExpenseTypeCoach, "ค่าจ้างโค้ชประจำเดือน", true},
		{4, 900, models.ExpenseTypeEquipment, "ลูกขนไก่และอุปกรณ์", false},
		{3, 1700, models.ExpenseTypeCoach, "ค่าจ้างโค้ชประจำเดือน", true},
		{3, 800, models.ExpenseTypeCourt, "ค่าเช่าสนามซ้อม", false},
		{2, 1600, models.ExpenseTypeCoach, "ค่าจ้างโค้ชประจำเดือน", true},
		{2, 900, models.ExpenseTypeAdvertising, "โฆษณา Facebook", false},
		{1, 1700, models.ExpenseTypeCoach, "ค่าจ้างโค้ชประจำเดือน", true},
		{1, 800, models.ExpenseTypeCourt, "ค่าเช่าสนามซ้อม", false},
		{0, 1600, models.ExpenseTypeCoach, "ค่าจ้างโค้ชประจำเดือน", true},
		{0, 700, models.ExpenseTypeOther, "ค่าน้ำค่าไฟ", false},
	}

	created := 0
	for _, e := range exps {
		when := monthsAgo(e.monthsAgo)
		ex := models.Expense{
			Amount:      e.amount,
			Type:        e.etype,
			Description: e.desc,
			Date:        when,
		}
		if e.withCoach && hasCoach {
			cid := coach.ID
			ex.CoachID = &cid
		}
		if err := db.Create(&ex).Error; err != nil {
			log.Printf("[seed-ops] สร้างรายจ่ายไม่สำเร็จ: %v", err)
			continue
		}
		backdate(db, &ex, when)
		created++
	}
	fmt.Printf("Seed รายจ่าย %d รายการสำเร็จเรียบร้อย!\n", created)
}
