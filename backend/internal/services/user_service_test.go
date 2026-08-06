package services

import (
	"testing"
	"time"

	"CPE-691015/internal/models"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// newSyncTestDB สร้าง in-memory sqlite (pure-Go, ไม่ต้องใช้ CGO) สำหรับเทส SyncCustomerStatuses
// ปิด FK constraint ตอน migrate เพื่อไม่ให้ไปพันกับตารางอื่นที่ไม่ได้ใช้ในเทสนี้
// และบังคับ MaxOpenConns=1 ให้ทุก query ใช้ connection เดียวกัน (in-memory DB ผูกกับ connection)
func newSyncTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
		Logger:                                   logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatalf("เปิด sqlite ไม่สำเร็จ: %v", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		t.Fatalf("ดึง *sql.DB ไม่สำเร็จ: %v", err)
	}
	sqlDB.SetMaxOpenConns(1)

	if err := db.AutoMigrate(&models.Customer{}, &models.Enrollment{}); err != nil {
		t.Fatalf("AutoMigrate ไม่สำเร็จ: %v", err)
	}
	return db
}

// seedCustomer สร้างลูกค้า 1 รายพร้อมกำหนด status และ created_at เอง
func seedCustomer(
	t *testing.T,
	db *gorm.DB,
	userID uint,
	status models.CustomerStatus,
	createdAt time.Time,
) models.Customer {
	t.Helper()

	c := models.Customer{
		UserID:         userID,
		Nickname:       "u",
		Gender:         models.GenderMale,
		PhoneNumber:    "0800000000",
		BirthDate:      time.Now(),
		PersonalQRCode: "QR_" + time.Now().Format("150405.000000000") + "_" + itoa(userID),
		Status:         status,
	}
	if err := db.Create(&c).Error; err != nil {
		t.Fatalf("สร้าง customer (user_id=%d) ไม่สำเร็จ: %v", userID, err)
	}
	// patch created_at (Create จะเซ็ตเป็น now ให้อัตโนมัติ)
	if err := db.Model(&c).UpdateColumn("created_at", createdAt).Error; err != nil {
		t.Fatalf("อัปเดต created_at ไม่สำเร็จ: %v", err)
	}
	return c
}

// seedEnrollment สร้าง enrollment 1 รายการพร้อมกำหนด updated_at เอง (จำลองเวลาที่เปลี่ยนสถานะครั้งล่าสุด)
func seedEnrollment(
	t *testing.T,
	db *gorm.DB,
	customerID uint,
	status models.EnrollmentStatus,
	remaining uint,
	updatedAt time.Time,
) {
	t.Helper()

	e := models.Enrollment{
		EnrollmentDate:    time.Now(),
		TotalSessions:     10,
		RemainingSessions: remaining,
		Status:            status,
		PackageID:         1,
		CustomerID:        customerID,
	}
	if err := db.Create(&e).Error; err != nil {
		t.Fatalf("สร้าง enrollment (customer_id=%d) ไม่สำเร็จ: %v", customerID, err)
	}
	// UpdateColumns ด้วย map จะไม่ไปแตะ updated_at อัตโนมัติ จึงกำหนดเวลาเองได้ตรงตามที่ต้องการ
	if err := db.Model(&e).UpdateColumns(map[string]interface{}{"updated_at": updatedAt}).Error; err != nil {
		t.Fatalf("อัปเดต updated_at ไม่สำเร็จ: %v", err)
	}
}

func statusOf(t *testing.T, db *gorm.DB, id uint) models.CustomerStatus {
	t.Helper()
	var c models.Customer
	if err := db.First(&c, id).Error; err != nil {
		t.Fatalf("อ่าน customer id=%d ไม่สำเร็จ: %v", id, err)
	}
	return c.Status
}

func itoa(u uint) string {
	if u == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	for u > 0 {
		i--
		buf[i] = byte('0' + u%10)
		u /= 10
	}
	return string(buf[i:])
}

// TestSyncCustomerStatuses ครอบคลุมกติกาการปรับสถานะ active/inactive อัตโนมัติ
func TestSyncCustomerStatuses(t *testing.T) {
	db := newSyncTestDB(t)
	svc := NewUserService(db)

	now := time.Now()
	old := now.AddDate(0, -4, 0)    // 4 เดือนก่อน — เกินเกณฑ์ 3 เดือน
	recent := now.AddDate(0, -1, 0) // 1 เดือนก่อน — ยังไม่เกินเกณฑ์

	// c1: มี enrollment active เหลืออยู่ (แม้จะเก่า) → ต้องคง active
	c1 := seedCustomer(t, db, 101, models.CustomerStatusActive, old)
	seedEnrollment(t, db, c1.ID, models.EnrollmentStatusActive, 5, old)

	// c2: enrollment จบไปแล้ว (remaining 0) นานเกิน 3 เดือน → ต้องกลายเป็น inactive
	c2 := seedCustomer(t, db, 102, models.CustomerStatusActive, old)
	seedEnrollment(t, db, c2.ID, models.EnrollmentStatusCompleted, 0, old)

	// c3: enrollment จบไปแล้วแต่เพิ่งจบเมื่อ 1 เดือนก่อน → ยังไม่ถึงเกณฑ์ ต้องคง active
	c3 := seedCustomer(t, db, 103, models.CustomerStatusActive, old)
	seedEnrollment(t, db, c3.ID, models.EnrollmentStatusCompleted, 0, recent)

	// c4: ไม่เคยลงเรียนเลย และสมัครมานานเกิน 3 เดือน → ใช้ created_at เป็นเกณฑ์ ต้องเป็น inactive
	c4 := seedCustomer(t, db, 104, models.CustomerStatusActive, old)

	// c5: ไม่เคยลงเรียนเลย แต่เพิ่งสมัครเมื่อ 1 เดือนก่อน → ต้องคง active
	c5 := seedCustomer(t, db, 105, models.CustomerStatusActive, recent)

	// c6: ตอนนี้เป็น inactive แต่กลับมามี enrollment active → ต้องถูกเปิดใช้งานคืนเป็น active
	c6 := seedCustomer(t, db, 106, models.CustomerStatusInactive, old)
	seedEnrollment(t, db, c6.ID, models.EnrollmentStatusActive, 8, recent)

	// c7: enrollment เป็น active แต่ sessions หมด (remaining 0) และเก่าเกิน 3 เดือน
	//     ต้องไม่ถูกนับว่ายัง active → กลายเป็น inactive
	c7 := seedCustomer(t, db, 107, models.CustomerStatusActive, old)
	seedEnrollment(t, db, c7.ID, models.EnrollmentStatusActive, 0, old)

	if err := svc.SyncCustomerStatuses(); err != nil {
		t.Fatalf("SyncCustomerStatuses ล้มเหลว: %v", err)
	}

	cases := []struct {
		name string
		id   uint
		want models.CustomerStatus
	}{
		{"มี enrollment active เหลือ → คง active", c1.ID, models.CustomerStatusActive},
		{"ไม่มี active เกิน 3 เดือน → inactive", c2.ID, models.CustomerStatusInactive},
		{"เพิ่งจบ < 3 เดือน → คง active", c3.ID, models.CustomerStatusActive},
		{"ไม่เคยเรียน + สมัครนาน → inactive", c4.ID, models.CustomerStatusInactive},
		{"ไม่เคยเรียน + สมัครใหม่ → คง active", c5.ID, models.CustomerStatusActive},
		{"inactive แต่กลับมามี active → reactivate", c6.ID, models.CustomerStatusActive},
		{"active แต่ sessions หมด + เก่า → inactive", c7.ID, models.CustomerStatusInactive},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := statusOf(t, db, tc.id)
			if got != tc.want {
				t.Errorf("customer id=%d: ได้ status = %q, ต้องการ %q", tc.id, got, tc.want)
			}
		})
	}
}

// TestSyncCustomerStatuses_Idempotent เรียกซ้ำแล้วผลต้องไม่เปลี่ยน (ไม่มี side-effect สะสม)
func TestSyncCustomerStatuses_Idempotent(t *testing.T) {
	db := newSyncTestDB(t)
	svc := NewUserService(db)

	old := time.Now().AddDate(0, -4, 0)

	c := seedCustomer(t, db, 201, models.CustomerStatusActive, old)
	seedEnrollment(t, db, c.ID, models.EnrollmentStatusCompleted, 0, old)

	for i := 0; i < 3; i++ {
		if err := svc.SyncCustomerStatuses(); err != nil {
			t.Fatalf("รอบที่ %d ล้มเหลว: %v", i, err)
		}
	}

	if got := statusOf(t, db, c.ID); got != models.CustomerStatusInactive {
		t.Errorf("เรียกซ้ำแล้ว status = %q, ต้องการ %q", got, models.CustomerStatusInactive)
	}
}
