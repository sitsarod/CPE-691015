package main

import (
	"fmt"
	"log"
	"os"

	"CPE-691015/internal/models"
	"CPE-691015/internal/services"

	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// migrate: อัปเดตสคีมาแบบ "ไม่ลบข้อมูล" ด้วย GORM AutoMigrate
// (เพิ่มคอลัมน์/ตารางที่ขาดเท่านั้น ไม่ DROP อะไรทั้งสิ้น)
// ใช้เมื่อเพิ่มฟิลด์ใหม่ในโมเดลแล้วอยากให้คอลัมน์ขึ้นในฐานเดิมโดยไม่ต้องรีเซ็ต
//
// วิธีรัน:  cd backend/cmd/migrate  แล้ว  go run .
func main() {
	if err := godotenv.Load("../../../.env"); err != nil {
		log.Println("คำเตือน: ไม่พบไฟล์ .env จะใช้ Environment Variable ของเครื่องแทน")
	}

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("กรุณาตั้งค่า DATABASE_URL ในไฟล์ .env ด้วยซะล่ะ!")
	}

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatalf("เชื่อมต่อฐานข้อมูลไม่สำเร็จ: %v", err)
	}
	fmt.Println("เชื่อมต่อสำเร็จแล้ว! กำลังอัปเดตสคีมา (ไม่ลบข้อมูล)...")

	// ต้องมาก่อน AutoMigrate เสมอ ไม่งั้นสร้างคอลัมน์ vector(512) ของ face_images ไม่ได้
	if err := services.EnableVectorExtension(db); err != nil {
		log.Fatalf("เปิด extension pgvector ไม่สำเร็จ: %v", err)
	}

	// ต้องเช็คก่อน AutoMigrate สร้างคอลัมน์ — ใช้แยกรอบเก่าที่ปิดไปก่อนมีระบบค่าสนาม
	hadCourtFeeColumn := db.Migrator().HasColumn(&models.AttendanceSession{}, "court_billed_at")

	// AutoMigrate ทุกโมเดล (รายการเดียวกับ cmd/init แต่ไม่ DROP SCHEMA)
	// เพิ่มคอลัมน์/ตารางที่ขาดให้อัตโนมัติทุกครั้งที่เพิ่มฟิลด์ใหม่ในโมเดล
	if err := db.AutoMigrate(
		&models.User{},
		&models.Coach{},
		&models.Product{},
		&models.Customer{},
		&models.FaceImage{},
		&models.Evaluation{},
		&models.Review{},
		&models.DetectedVideo{},
		&models.RawVideo{},
		&models.DetectedPhoto{},
		&models.RawPhoto{},
		&models.Course{},
		&models.Package{},
		&models.PackageSchedule{},
		&models.Enrollment{},
		&models.EnrollmentExtension{},
		&models.SessionCarryOver{},
		&models.AttendanceSession{},
		&models.StudentAttendance{},
		&models.CoachAttendance{},
		&models.Billing{},
		&models.BillingType{},
		&models.Invoice{},
		&models.PaymentItem{},
		&models.Announcement{},
		&models.Category{},
		&models.AnnouncementBookmark{},
		&models.HomeContent{},
		&models.HeroSlide{},
		&models.BankAccount{},
		&models.Expense{},
		&models.ChatSession{},
		&models.AutoQA{},
		&models.WorkSchedule{},
		&models.CoachAvailability{},
		&models.BiometricConsent{},
		&models.PasswordResetOTP{},
		&models.EmailVerificationOTP{},
		&models.Court{},
		&models.Notification{},
		&models.ClassConfirmation{},
		&models.AppSetting{},
		&models.LegalDocumentRevision{},
		
	); err != nil {
		log.Fatalf("AutoMigrate ไม่สำเร็จ: %v", err)
	}

	// ต้องรันก่อนอื่นหลัง AutoMigrate — ไม่งั้นบัญชีเดิมทุกบัญชีจะ login ไม่ได้ทันที
	// เพราะ email_verified_at เพิ่งเพิ่มเป็น NULL หมด (ดูเหตุผลที่ฟังก์ชันนี้)
	if err := services.BackfillEmailVerifiedForExistingUsers(db); err != nil {
		log.Fatalf("%v", err)
	}

	if !hadCourtFeeColumn {
		if err := services.MarkLegacyCourtFeeSessions(db); err != nil {
			log.Fatalf("%v", err)
		}
	}

	if err := services.BackfillCourtFeeSource(db); err != nil {
		log.Fatalf("%v", err)
	}

	// ไม่มีแถวพวกนี้ = อนุมัติคำขอสมัครเรียนและออกบิลค่าสนามไม่ได้เลย
	if err := services.EnsureBillingTypes(db); err != nil {
		log.Fatalf("เติมประเภทบิลมาตรฐานไม่สำเร็จ: %v", err)
	}

	// index แบบมีเงื่อนไขที่ GORM ประกาศผ่านแท็กไม่ได้ (ดู services.EnsureMemberCodeIndexes)
	if err := services.EnsureMemberCodeIndexes(db); err != nil {
		log.Fatalf("สร้าง index ของรหัสประจำตัวไม่สำเร็จ: %v", err)
	}

	if err := services.EnsureFaceImageIndexes(db); err != nil {
		log.Fatalf("สร้าง index ของ embedding ใบหน้าไม่สำเร็จ: %v", err)
	}

	// อีเมลกับเลขบัตรประชาชนห้ามซ้ำ "เฉพาะคนที่ยังไม่ถูกลบ"
	// ขั้นนี้รื้อ unique constraint เก่าที่ AutoMigrate เคยสร้างไว้ด้วย
	// ถ้าล้มต้องหยุด เพราะแปลว่าตอนนี้ไม่มีอะไรกันอีเมลซ้ำเลย
	if err := services.EnsureSoftDeleteUniqueIndexes(db); err != nil {
		log.Fatalf("สร้าง index ของอีเมล/เลขบัตรประชาชนไม่สำเร็จ: %v", err)
	}

	if err := services.EnsureAttendanceUniqueIndexes(db); err != nil {
		log.Fatalf("สร้าง index กันเช็คชื่อซ้ำต่อคนไม่สำเร็จ: %v", err)
	}

	if err := services.DropLegacyAttendanceSessionIndex(db); err != nil {
		log.Fatalf("รื้อ index รอบเช็คชื่อรุ่นเก่าไม่สำเร็จ: %v", err)
	}

	services.WarnInvalidPackageSchedules(db)

	// ถ้าล้มต้องหยุด — แปลว่าตอนนี้ไม่มีอะไรกันสมัครแพ็กเกจเดิมซ้ำซ้อนเลย
	if err := services.EnsureEnrollmentUniqueIndexes(db); err != nil {
		log.Fatalf("สร้าง index กันสมัครซ้ำไม่สำเร็จ: %v", err)
	}

	if err := services.EnsureCarryOverCourseScope(db); err != nil {
		log.Fatalf("ผูกคอร์สให้ครั้งที่ทบไว้ไม่สำเร็จ: %v", err)
	}

	if err := services.BackfillExpiredCarryOver(db); err != nil {
		log.Fatalf("ทบครั้งคงเหลือย้อนหลังไม่สำเร็จ: %v", err)
	}

	if err := services.BackfillCarryOverIntoRenewals(db); err != nil {
		log.Fatalf("ย้ายยอดทบเก่าเข้าใบที่สมัครต่อไม่สำเร็จ: %v", err)
	}

	if err := services.BackfillCompletedEnrollments(db); err != nil {
		log.Fatalf("ปิดใบที่เรียนครบย้อนหลังไม่สำเร็จ: %v", err)
	}

	if err := services.BackfillEnrollmentAgreedPrice(db); err != nil {
		log.Fatalf("เติมราคาที่ตกลงกันให้ใบลงทะเบียนเก่าไม่สำเร็จ: %v", err)
	}

	if err := services.EnsureClassConfirmationIndexes(db); err != nil {
		log.Fatalf("รื้อ index การยืนยันตัวเก่าไม่สำเร็จ: %v", err)
	}

	// รูปแบบเวลาต้องเป็นแบบเดียวก่อนขั้นอื่น เพราะขั้นที่เหลือจับคู่คลาสด้วยเวลา
	// ถ้าล้มต้องหยุด — ปล่อยให้ปนกันจะทำให้การจับคู่พลาดเป็นบางแถวแบบเดาไม่ได้
	if err := services.NormalizeClockTimeColumns(db); err != nil {
		log.Fatalf("แปลงรูปแบบเวลาให้เป็นมาตรฐานเดียวไม่สำเร็จ: %v", err)
	}

	if err := services.NormalizeFutureWorkSchedulePackages(db); err != nil {
		log.Fatalf("ปรับแพ็กเกจของตารางงานโค้ชไม่สำเร็จ: %v", err)
	}

	// ตรึงอัตราค่าจ้างของคาบเก่าไว้กับตัวแถว ไม่ให้ยอดย้อนหลังเปลี่ยนตามเรตปัจจุบัน
	// ถ้าล้มต้องหยุด เพราะแปลว่าการคิดค่าจ้างจะอ่านค่า 0 แล้วยอดค้างจ่ายหายไปทั้งก้อน
	if err := services.BackfillWorkSchedulePayRates(db); err != nil {
		log.Fatalf("เติมอัตราค่าจ้างย้อนหลังให้ตารางงานไม่สำเร็จ: %v", err)
	}

// ค่าสนามเปลี่ยนจากราคาต่อชั่วโมงเป็นยอดรวมของคาบ
	if db.Migrator().HasColumn(&models.AttendanceSession{}, "court_hourly_rate") {
		if err := db.Migrator().DropColumn(&models.AttendanceSession{}, "court_hourly_rate"); err != nil {
			log.Fatalf("ลบคอลัมน์ค่าสนามต่อชั่วโมงไม่สำเร็จ: %v", err)
		}
	}

	fmt.Println("อัปเดตสคีมาเรียบร้อย — เพิ่มคอลัมน์/ตารางที่ขาดของทุกโมเดลแล้ว (ข้อมูลเดิมอยู่ครบ)")
}
