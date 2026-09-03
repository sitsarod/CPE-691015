package services

import (
	"errors"
	"testing"
	"time"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"

	"gorm.io/gorm"
)

// เทสชุดนี้คุมกติกาใหม่ของการประเมิน: โค้ชประเมิน/ดูข้อมูลได้เฉพาะนักเรียนที่ลงทะเบียนเรียน
// คอร์สที่ตัวเองสอนจริง (ผ่าน Enrollment -> Package -> Course -> WorkSchedule.CoachID)
// กันโค้ชคนหนึ่งยุ่งกับนักเรียนของโค้ชคนอื่น
//
// ⚠️ Course.UserID คือแอดมินผู้สร้างคอร์ส ไม่ใช่โค้ชที่สอน (ดูคอมเมนต์ในเซอร์วิส) ความเชื่อมโยง
// คอร์ส -> โค้ชตัวจริงต้องผ่านตาราง work_schedules เท่านั้น — ใช้ seedCoachFor จาก
// coach_ownership_test.go ร่วมแพ็กเกจกัน

func evalTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	return newTestDB(t,
		&models.Coach{}, &models.Customer{}, &models.Course{},
		&models.Package{}, &models.Enrollment{}, &models.Evaluation{}, &models.WorkSchedule{},
	)
}

// seedCourseTaughtBy สร้างคอร์ส 1 คอร์ส + แพ็กเกจ 1 ใบ + ตารางสอนที่ผูกโค้ช (coachID) เข้ากับคอร์สนั้น
// ผ่าน work_schedules (เส้นทางเดียวกับที่ reviewService.GetCourseCoaches ใช้) คืน packages.id
func seedCourseTaughtBy(t *testing.T, db *gorm.DB, coachID uint) uint {
	t.Helper()

	// UserID ของคอร์ส = แอดมินผู้สร้าง ใส่ค่าคงที่ไปเฉยๆ เพราะไม่เกี่ยวกับการทดสอบนี้
	course := models.Course{CourseName: "c", Description: "d", UserID: 1}
	if err := db.Create(&course).Error; err != nil {
		t.Fatalf("สร้างคอร์สไม่สำเร็จ: %v", err)
	}

	ws := models.WorkSchedule{
		Date: "2026-01-05", StartTime: "18:00", EndTime: "20:00",
		Description: "test", Courtnumber: "1",
		CoachID: coachID, CourseID: course.ID,
	}
	if err := db.Create(&ws).Error; err != nil {
		t.Fatalf("สร้างตารางสอนไม่สำเร็จ: %v", err)
	}

	pkg := models.Package{SessionsCount: 10, HoursCount: 10, Price: 1000, CourseID: course.ID}
	if err := db.Create(&pkg).Error; err != nil {
		t.Fatalf("สร้างแพ็กเกจไม่สำเร็จ: %v", err)
	}

	return pkg.ID
}

// seedEnrolledCustomer สร้างนักเรียน 1 คน แล้วลงทะเบียนเรียนแพ็กเกจ (packageID) ด้วยสถานะที่กำหนด
// คืน customers.id
func seedEnrolledCustomer(t *testing.T, db *gorm.DB, packageID uint, status models.EnrollmentStatus, qr string) uint {
	t.Helper()

	customer := models.Customer{Gender: models.GenderMale, PersonalQRCode: qr}
	if err := db.Create(&customer).Error; err != nil {
		t.Fatalf("สร้างนักเรียนไม่สำเร็จ: %v", err)
	}

	enrollment := models.Enrollment{
		EnrollmentDate:    time.Now(),
		TotalSessions:     10,
		RemainingSessions: 10,
		Status:            status,
		PackageID:         packageID,
		CustomerID:        customer.ID,
	}
	if err := db.Create(&enrollment).Error; err != nil {
		t.Fatalf("สร้างใบลงทะเบียนไม่สำเร็จ: %v", err)
	}

	return customer.ID
}

func TestVerifyCustomerEnrolledWithCoach(t *testing.T) {
	db := evalTestDB(t)
	svc := NewEvaluationService(db)

	coachA := seedCoachFor(t, db, 100, "uid-eval-a")
	seedCoachFor(t, db, 200, "uid-eval-b") // โค้ชอีกคน ไม่ได้สอนคอร์สนี้

	pkgID := seedCourseTaughtBy(t, db, coachA)
	customerID := seedEnrolledCustomer(t, db, pkgID, models.EnrollmentStatusActive, "qr-1")

	t.Run("โค้ชที่สอนคอร์สนี้เข้าถึงได้", func(t *testing.T) {
		if err := svc.VerifyCoachCanAccessStudent(100, customerID); err != nil {
			t.Fatalf("ควรผ่าน แต่ได้: %v", err)
		}
	})

	t.Run("โค้ชคนอื่นที่ไม่ได้สอนคอร์สนี้เข้าถึงไม่ได้", func(t *testing.T) {
		err := svc.VerifyCoachCanAccessStudent(200, customerID)
		if !errors.Is(err, ErrCustomerNotEnrolledWithCoach) {
			t.Fatalf("ควรได้ ErrCustomerNotEnrolledWithCoach แต่ได้: %v", err)
		}
	})
}

// สถานะ awaiting_payment = อนุมัติแล้วแต่ยังไม่จ่ายเงิน นักเรียนยังไม่เริ่มเรียนจริง
// จึงไม่ควรนับว่า "ลงทะเบียนแล้ว" สำหรับการประเมิน
func TestVerifyCustomerEnrolledWithCoachExcludesAwaitingPayment(t *testing.T) {
	db := evalTestDB(t)
	svc := NewEvaluationService(db)

	coachID := seedCoachFor(t, db, 100, "uid-eval-c")
	pkgID := seedCourseTaughtBy(t, db, coachID)
	customerID := seedEnrolledCustomer(t, db, pkgID, models.EnrollmentStatusAwaitingPayment, "qr-2")

	err := svc.VerifyCoachCanAccessStudent(100, customerID)
	if !errors.Is(err, ErrCustomerNotEnrolledWithCoach) {
		t.Fatalf("ควรได้ ErrCustomerNotEnrolledWithCoach แต่ได้: %v", err)
	}
}

func TestCreateEvaluationRejectsUnenrolledStudent(t *testing.T) {
	db := evalTestDB(t)
	svc := NewEvaluationService(db)

	// โค้ช 200 ไม่มีคอร์สหรือลูกศิษย์เลย
	seedCoachFor(t, db, 200, "uid-eval-d")

	coachA := seedCoachFor(t, db, 100, "uid-eval-e")
	pkgID := seedCourseTaughtBy(t, db, coachA)
	customerID := seedEnrolledCustomer(t, db, pkgID, models.EnrollmentStatusActive, "qr-3")

	_, err := svc.CreateEvaluation(200, dto.CreateEvaluationRequest{
		CustomerID: customerID,
		Assessment: "ok",
		Score:      80,
	})
	if !errors.Is(err, ErrCustomerNotEnrolledWithCoach) {
		t.Fatalf("ควรได้ ErrCustomerNotEnrolledWithCoach แต่ได้: %v", err)
	}
}

func TestGetMyStudents(t *testing.T) {
	db := evalTestDB(t)
	svc := NewEvaluationService(db)

	coachA := seedCoachFor(t, db, 100, "uid-eval-f")

	pkgID := seedCourseTaughtBy(t, db, coachA)
	activeID := seedEnrolledCustomer(t, db, pkgID, models.EnrollmentStatusActive, "qr-active")
	seedEnrolledCustomer(t, db, pkgID, models.EnrollmentStatusAwaitingPayment, "qr-awaiting")

	otherPkgID := seedCourseTaughtBy(t, db, 999) // สอนโดยโค้ชคนละคน
	seedEnrolledCustomer(t, db, otherPkgID, models.EnrollmentStatusActive, "qr-other-coach")

	students, err := svc.GetMyStudents(100)
	if err != nil {
		t.Fatalf("ควรผ่าน แต่ได้: %v", err)
	}
	if len(students) != 1 || students[0].ID != activeID {
		t.Fatalf("ควรได้นักเรียนที่ active เท่านั้น 1 คน (id=%d) แต่ได้ %+v", activeID, students)
	}
}

func TestCreateEvaluationAllowsEnrolledStudent(t *testing.T) {
	db := evalTestDB(t)
	svc := NewEvaluationService(db)

	coachA := seedCoachFor(t, db, 100, "uid-eval-g")
	pkgID := seedCourseTaughtBy(t, db, coachA)
	customerID := seedEnrolledCustomer(t, db, pkgID, models.EnrollmentStatusActive, "qr-4")

	ev, err := svc.CreateEvaluation(100, dto.CreateEvaluationRequest{
		CustomerID: customerID,
		Assessment: "ok",
		Score:      80,
	})
	if err != nil {
		t.Fatalf("ควรผ่าน แต่ได้: %v", err)
	}
	if ev.CustomerID != customerID {
		t.Fatalf("customerID ไม่ตรง: got %d want %d", ev.CustomerID, customerID)
	}
}
