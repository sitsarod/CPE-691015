package services

import (
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type EnrollmentService struct {
	db *gorm.DB
}

func NewEnrollmentService(db *gorm.DB) *EnrollmentService {
	return &EnrollmentService{db: db}
}

var (
	ErrEnrollmentNotFound      = errors.New("ไม่พบข้อมูลการลงทะเบียน")
	ErrEnrollmentNotPending    = errors.New("การลงทะเบียนนี้ไม่ได้อยู่ในสถานะรออนุมัติ")
	ErrPackageSeatsFull        = errors.New("ไม่สามารถอนุมัติได้ เนื่องจากแพ็กเกจนี้ที่นั่งเต็มแล้ว กรุณาขยายจำนวนที่นั่งสูงสุดก่อน")
	ErrEnrollmentBillingLocked = errors.New("ไม่สามารถยกเลิกได้ เนื่องจากบิลที่เกี่ยวข้องถูกชำระหรือกำลังตรวจสอบอยู่ กรุณาจัดการการชำระเงินก่อน")

	ErrPackageNotFound = errors.New("ไม่พบข้อมูลแพ็กเกจที่เลือก")
	ErrCourseNotOpen   = errors.New("คอร์สนี้ยังไม่เปิดรับสมัคร")

	ErrEnrollmentDuplicateActive = errors.New("ลูกค้ารายนี้มีใบลงทะเบียนของแพ็กเกจนี้ที่ยังใช้งานอยู่แล้ว")

	ErrAlreadyEnrolled = errors.New("คุณได้สมัครแพ็กเกจนี้ไว้แล้ว กรุณารอการอนุมัติหรือตรวจสอบคอร์สของคุณ")

	ErrEnrollmentRejectReason   = errors.New("กรุณาระบุเหตุผลในการปฏิเสธ (อย่างน้อย 3 ตัวอักษร)")
	ErrEnrollmentForbidden      = errors.New("ไม่มีสิทธิ์ยกเลิกการลงทะเบียนของผู้อื่น")
	ErrEnrollmentNotCancellable = errors.New("ยกเลิกเองได้เฉพาะใบที่ยังรออนุมัติ หากแอดมินอนุมัติไปแล้วกรุณาติดต่อแอดมิน")
)

const defaultEnrollmentDurationDays = 30

const billingTypeCourseFee = "ค่าคอร์สเรียน"

func resolveDurationDays(pkg *models.Package, enrollmentID uint) uint {
	if pkg == nil {
		log.Printf("[enrollment] #%d: ไม่มีข้อมูลแพ็กเกจตอนเปิดใช้งาน ใช้ค่าเริ่มต้น %d วัน",
			enrollmentID, defaultEnrollmentDurationDays)
		return defaultEnrollmentDurationDays
	}
	if pkg.DurationDays == 0 {
		log.Printf("[enrollment] #%d: แพ็กเกจ #%d ไม่ได้ตั้ง duration_days ใช้ค่าเริ่มต้น %d วัน",
			enrollmentID, pkg.ID, defaultEnrollmentDurationDays)
		return defaultEnrollmentDurationDays
	}
	return pkg.DurationDays
}
func activateEnrollment(tx *gorm.DB, e *models.Enrollment, pkg *models.Package) error {
	now := nowLocal()
	expiresAt := endOfLocalDay(now.AddDate(0, 0, int(resolveDurationDays(pkg, e.ID))))
	if err := tx.Model(&models.Enrollment{}).
		Where("id = ?", e.ID).
		Updates(map[string]interface{}{
			"status":     models.EnrollmentStatusActive,
			"started_at": now,
			"expires_at": expiresAt,
		}).Error; err != nil {
		return errors.New("ไม่สามารถเปิดใช้งานสิทธิ์เรียนได้")
	}

	e.Status = models.EnrollmentStatusActive
	e.StartedAt = &now
	e.ExpiresAt = &expiresAt

	carried, err := consumeCarryOver(tx, e, pkg)
	if err != nil {
		return err
	}
	if carried > 0 {
		if err := tx.Model(&models.Enrollment{}).
			Where("id = ?", e.ID).
			Updates(map[string]interface{}{
				"total_sessions":     gorm.Expr("total_sessions + ?", carried),
				"remaining_sessions": gorm.Expr("remaining_sessions + ?", carried),
			}).Error; err != nil {
			return errors.New("ไม่สามารถทบครั้งที่ค้างไว้เข้าคอร์สนี้ได้")
		}
		e.TotalSessions += carried
		e.RemainingSessions += carried
	}

	return nil
}

func createEnrollmentBilling(tx *gorm.DB, e *models.Enrollment, adminID *uint) error {
	var billingType models.BillingType
	if err := tx.Where("billing_type_name = ?", billingTypeCourseFee).First(&billingType).Error; err != nil {
		return errors.New("ไม่พบประเภทบิล 'ค่าคอร์สเรียน' ในระบบ")
	}

	billingUserID, err := ResolveUserID(tx, e.CustomerID)
	if err != nil {
		return err
	}

	courseName := "คอร์สเรียน"
	var sessions uint
	price := e.AgreedPrice
	if e.Package != nil {
		sessions = e.Package.SessionsCount
		// 0 = ใบเก่าที่ยังไม่มีสแนปช็อต — แพ็กเกจราคา 0 สร้างไม่ได้อยู่แล้ว
		if price == 0 {
			price = e.Package.Price
		}
		if e.Package.Course != nil {
			courseName = e.Package.Course.CourseName
		}
	}

	billing := models.Billing{
		Description:   fmt.Sprintf("ค่าลงทะเบียน: %s (เรียน %d ครั้ง)", courseName, sessions),
		Amount:        price,
		DueDate:       time.Now().AddDate(0, 0, 3), // ให้เวลาจ่าย 3 วัน
		Status:        models.StatusUnfunded,
		CustomerID:    billingUserID,
		BillingTypeID: billingType.ID,
		AdminID:       adminID,
	}

	if err := tx.Create(&billing).Error; err != nil {
		return errors.New("ไม่สามารถสร้างใบแจ้งหนี้ได้")
	}

	if err := tx.Model(&models.Enrollment{}).
		Where("id = ?", e.ID).
		Update("billing_id", billing.ID).Error; err != nil {
		return errors.New("ไม่สามารถผูกใบแจ้งหนี้กับการลงทะเบียนได้")
	}
	e.BillingID = &billing.ID
	return nil
}

func hasStudiedAnything(tx *gorm.DB, customerID uint, excludeEnrollmentID uint) (bool, error) {
	var count int64
	if err := tx.Model(&models.Enrollment{}).
		Where("customer_id = ? AND id <> ? AND started_at IS NOT NULL",
			customerID, excludeEnrollmentID).
		Count(&count).Error; err != nil {
		return false, errors.New("ไม่สามารถตรวจสอบประวัติการเรียนได้")
	}
	return count > 0, nil
}

func hasStudiedCourse(tx *gorm.DB, customerID uint, courseID uint) (bool, error) {
	var count int64
	if err := tx.Model(&models.Enrollment{}).
		Joins("JOIN packages ON packages.id = enrollments.package_id").
		Where("enrollments.customer_id = ? AND packages.course_id = ? AND enrollments.started_at IS NOT NULL",
			customerID, courseID).
		Count(&count).Error; err != nil {
		return false, errors.New("ไม่สามารถตรวจสอบประวัติการเรียนคอร์สนี้ได้")
	}
	return count > 0, nil
}

// seatsTaken นับที่นั่งที่ถูกยึดแล้ว (อนุมัติแล้ว) ของแพ็กเกจหนึ่ง
func seatsTaken(tx *gorm.DB, packageID uint) (uint, error) {
	var taken int64
	if err := tx.Model(&models.Enrollment{}).
		Where("package_id = ? AND status IN ?", packageID, enrollmentApprovedStatuses).
		Count(&taken).Error; err != nil {
		return 0, errors.New("ไม่สามารถตรวจสอบจำนวนที่นั่งคงเหลือได้")
	}
	return uint(taken), nil
}

// lockPackageSeats จองสิทธิ์ตัดสินที่นั่งของแพ็กเกจนี้ไว้กับทรานแซกชันเดียว
func lockPackageSeats(tx *gorm.DB, packageID uint) (*models.Package, error) {
	var pkg models.Package
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		First(&pkg, packageID).Error; err != nil {
		return nil, ErrPackageNotFound
	}
	return &pkg, nil
}

func seatsFull(tx *gorm.DB, packageID uint, maxSeats uint) (bool, error) {
	taken, err := seatsTaken(tx, packageID)
	if err != nil {
		return false, err
	}
	return taken >= maxSeats, nil
}

func expireStaleEnrollments(db *gorm.DB) {
	var due []models.Enrollment
	if err := db.
		Where("status = ? AND expires_at IS NOT NULL AND expires_at < ?",
			models.EnrollmentStatusActive, startOfLocalDay(nowLocal())).
		Find(&due).Error; err != nil {
		log.Printf("[enrollment] หาใบที่หมดอายุไม่สำเร็จ: %v", err)
		return
	}

	for i := range due {
		e := &due[i]

		// ปิดทีละใบเพื่อให้รู้ว่าใครเป็นคนพลิกสถานะ — ฟังก์ชันนี้ถูกเรียกจากทุกจุดที่อ่านข้อมูล
		// ถ้าปิดรวดเดียวแล้วค่อยทบ สองคำขอที่เข้ามาพร้อมกันจะทบให้ใบเดียวกันคนละรอบ
		// พลิกสถานะกับทบอยู่ใน transaction เดียวกัน ทบล้มก็ถอยสถานะกลับให้รอบหน้าลองใหม่
		err := db.Transaction(func(tx *gorm.DB) error {
			res := tx.Model(&models.Enrollment{}).
				Where("id = ? AND status = ?", e.ID, models.EnrollmentStatusActive).
				Update("status", models.EnrollmentStatusExpired)
			if res.Error != nil || res.RowsAffected == 0 {
				return res.Error
			}
			e.Status = models.EnrollmentStatusExpired

			return autoCarryOver(tx, e)
		})
		if err != nil {
			log.Printf("[enrollment] #%d: ปิดใบที่หมดอายุไม่สำเร็จ จะลองใหม่รอบหน้า: %v", e.ID, err)
		}
	}
}

// BackfillCompletedEnrollments ปิดใบที่ใช้ครั้งครบแล้วแต่ยังค้างเป็น active
func BackfillCompletedEnrollments(db *gorm.DB) error {
	res := db.Model(&models.Enrollment{}).
		Where("status = ? AND remaining_sessions = 0", models.EnrollmentStatusActive).
		Update("status", models.EnrollmentStatusCompleted)
	if res.Error != nil {
		return fmt.Errorf("ปิดใบที่เรียนครบย้อนหลังไม่สำเร็จ: %w", res.Error)
	}
	if res.RowsAffected > 0 {
		log.Printf("[enrollment] ปิดใบที่เรียนครบแล้วย้อนหลัง %d ใบ", res.RowsAffected)
	}
	return nil
}

// BackfillEnrollmentAgreedPrice เติมราคาที่ตกลงกันให้ใบเก่าจากราคาแพ็กเกจที่ใบนั้นผูกอยู่
func BackfillEnrollmentAgreedPrice(db *gorm.DB) error {
	// ไม่กรอง deleted_at ของ packages โดยตั้งใจ — ใบเก่าของแพ็กเกจที่ถูกลบก็ยังต้องมีราคา
	res := db.Exec(`
		UPDATE enrollments AS e
		SET agreed_price = p.price
		FROM packages AS p
		WHERE p.id = e.package_id
		  AND COALESCE(e.agreed_price, 0) = 0
		  AND p.price > 0
	`)
	if res.Error != nil {
		return fmt.Errorf("เติมราคาที่ตกลงกันให้ใบลงทะเบียนเก่าไม่สำเร็จ: %w", res.Error)
	}
	if res.RowsAffected > 0 {
		log.Printf("[enrollment] เติมราคาที่ตกลงกันย้อนหลัง %d ใบ", res.RowsAffected)
	}
	return nil
}

func releaseLinkedBilling(tx *gorm.DB, billingID *uint) error {
	if billingID == nil {
		return nil
	}
	var billing models.Billing
	if err := tx.First(&billing, *billingID).Error; err != nil {
		return nil
	}
	if billing.Status == models.StatusPaid || billing.Status == models.StatusWaitCheck {
		return ErrEnrollmentBillingLocked
	}
	if err := tx.Delete(&models.Billing{}, *billingID).Error; err != nil {
		return errors.New("ไม่สามารถยกเลิกบิลที่ผูกกับการลงทะเบียนได้")
	}
	return nil
}

// toCustomerID แปลง users.id → customers.id
//
// ตรรกะจริงย้ายไปอยู่ที่ ResolveCustomerID ใน customer_resolver.go แล้ว เพื่อให้ service
// ตัวอื่น (เช่น ConsentService) ใช้ตัวเดียวกันได้ ไม่ต้องเขียนตรรกะแปลง id ซ้ำหลายที่
// ซึ่งเป็นจุดที่เคยเกิดบั๊กผูกข้อมูลผิดคนมาแล้ว
func (s *EnrollmentService) toCustomerID(userID uint) (uint, error) {
	return ResolveCustomerID(s.db, userID)
}

// toUserID แปลง customers.id → users.id
func (s *EnrollmentService) toUserID(customerID uint) (uint, error) {
	return ResolveUserID(s.db, customerID)
}

// [GET] ดึงข้อมูลคอร์สที่เปิดสอน
func (s *EnrollmentService) GetAvailableCourses() ([]dto.CourseDTO, error) {
	var courses []models.Course
	expireStaleEnrollments(s.db)

	err := s.db.Preload("User").
		Preload("Packages").
		Preload("Packages.Schedules").
		Preload("Packages.Enrollments", "status IN ?", enrollmentSeatStatuses).
		Where("status = ?", models.CourseStatusActive).
		Order("id ASC").
		Find(&courses).Error

	if err != nil {
		return nil, err
	}

	// ใช้ mapper ตัวเดียวกับ CourseService (ดู course_mapper.go)
	// เดิมที่นี่คัดลอกตรรกะแปลง DTO มาไว้เอง ทำให้เวลาเพิ่มฟิลด์ต้องแก้หลายที่
	return ToCourseDTOs(courses), nil
}

// EnrollResult คือผลของการสมัคร · Waitlisted = เข้าคิวสำรองเพราะที่นั่งเต็ม
type EnrollResult struct {
	Enrollment *models.Enrollment
	Waitlisted bool
}

// [POST] ลงทะเบียนคอร์สเรียน
func (s *EnrollmentService) EnrollCourse(userID uint, packageID uint, acceptedTermsVersion string) (*EnrollResult, error) {
	if acceptedTermsVersion != CurrentEnrollmentTermsVersion(s.db) {
		return nil, ErrEnrollmentTermsNotAccepted
	}

	var pkg models.Package

	if err := s.db.Preload("Course").First(&pkg, packageID).Error; err != nil {
		return nil, ErrPackageNotFound
	}

	// ⚠️ ด่านนี้อยู่ที่การกระทำ ไม่ใช่แค่ที่การแสดงผล — GetAvailableCourses กรอง
	// เฉพาะคอร์ส active ก็จริง แต่ package_id เป็นเลขเรียงที่เดาแล้วยิงตรงมาได้
	if pkg.Course == nil || pkg.Course.Status != models.CourseStatusActive {
		return nil, ErrCourseNotOpen
	}

	customerID, err := s.toCustomerID(userID)
	if err != nil {
		return nil, err
	}

	acceptedAt := time.Now()
	newEnrollment := models.Enrollment{
		CustomerID:        customerID,
		PackageID:         packageID,
		EnrollmentDate:    acceptedAt,
		TotalSessions:     pkg.SessionsCount,
		RemainingSessions: pkg.SessionsCount,
		TermsVersion:      acceptedTermsVersion,
		TermsAcceptedAt:   &acceptedAt,
	}

	waitlisted := false

	err = s.db.Transaction(func(tx *gorm.DB) error {
		lockedPkg, err := lockPackageSeats(tx, packageID)
		if err != nil {
			return err
		}

		// ล็อกราคาไว้กับใบตั้งแต่ตอนสมัคร บิลที่ออกทีหลังตอนอนุมัติจะได้ไม่เพี้ยนตามราคาใหม่
		newEnrollment.AgreedPrice = lockedPkg.Price

		expireStaleEnrollments(tx)

		var existingCount int64
		if err := tx.Model(&models.Enrollment{}).
			Where("customer_id = ? AND package_id = ? AND status IN ?",
				customerID, packageID, enrollmentSeatStatuses).
			Count(&existingCount).Error; err != nil {
			return errors.New("ไม่สามารถตรวจสอบการลงทะเบียนเดิมได้")
		}
		if existingCount > 0 {
			return ErrAlreadyEnrolled
		}

		// ⚠️ เกณฑ์ "รายคอร์ส" ตั้งใจให้ต่างจาก hasStudiedAnything ใน ApproveEnrollment
		// ที่นี่ถามว่า "ต้องให้แอดมินตรวจอีกไหม" — แอดมินเคยตรวจคนนี้กับคอร์สนี้ไปแล้ว
		// จึงข้ามได้ ส่วนคอร์สที่ยังไม่เคยเรียนต้องผ่านการตรวจเสมอแม้เป็นลูกค้าเก่า
		studiedCourse, err := hasStudiedCourse(tx, customerID, pkg.CourseID)
		if err != nil {
			return err
		}

		if !studiedCourse {

			newEnrollment.Status = models.EnrollmentStatusPending
			if err := tx.Create(&newEnrollment).Error; err != nil {
				if isUniqueViolation(err) {
					return ErrAlreadyEnrolled
				}
				return errors.New("ไม่สามารถบันทึกการลงทะเบียนได้")
			}

			taken, err := seatsTaken(tx, packageID)
			if err != nil {
				return err
			}
			waitlisted = taken >= lockedPkg.MaxSeats
			return nil
		}

		full, err := seatsFull(tx, packageID, lockedPkg.MaxSeats)
		if err != nil {
			return err
		}
		if full {
			return ErrPackageSeatsFull
		}

		if err := tx.Create(&newEnrollment).Error; err != nil {
			if isUniqueViolation(err) {
				return ErrAlreadyEnrolled
			}
			return errors.New("ไม่สามารถบันทึกการลงทะเบียนได้")
		}
		newEnrollment.Package = &pkg

		if err := activateEnrollment(tx, &newEnrollment, &pkg); err != nil {
			return err
		}
		return createEnrollmentBilling(tx, &newEnrollment, nil)
	})

	if err != nil {
		return nil, err
	}

	// แจ้งเตือนตามผลลัพธ์ของการสมัคร
	if newEnrollment.Status == models.EnrollmentStatusPending {
		// นักเรียนใหม่: รออนุมัติ → แจ้งแอดมินทุกคน
		NotifyAdmins(s.db,
			"enrollment_request",
			fmt.Sprintf("enrollment-%d", newEnrollment.ID),
			"มีคำขอสมัครเรียนใหม่",
			"มีนักเรียนส่งคำขอสมัครเรียน รอการอนุมัติ",
			"/admin/enrollments",
			"info",
		)
	} else if newEnrollment.BillingID != nil {
		// เคยเรียนคอร์สนี้แล้ว: เปิดสิทธิ์ทันทีพร้อมบิลรอชำระ → แจ้งลูกค้า (userID = users.id)
		CreateNotification(s.db, userID,
			"bill_issued",
			fmt.Sprintf("bill-%d", *newEnrollment.BillingID),
			"มีบิลรอชำระ",
			"ลงทะเบียนเรียบร้อย มีบิลค่าคอร์สรอการชำระเงิน",
			"/customer/payment?tab=billings",
			"warning",
		)
	}

	return &EnrollResult{Enrollment: &newEnrollment, Waitlisted: waitlisted}, nil
}

// [POST] อนุมัติการลงทะเบียนและสร้างบิล · allowOverbook = รับเกินที่นั่งแล้วขยาย max_seats ให้
func (s *EnrollmentService) ApproveEnrollment(enrollmentID uint, adminID uint, allowOverbook bool) (*models.Enrollment, error) {
	var enrollment models.Enrollment

	if err := s.db.Preload("Package").Preload("Package.Course").First(&enrollment, enrollmentID).Error; err != nil {
		return nil, ErrEnrollmentNotFound
	}

	// ด่านนี้แค่ตอบเร็วโดยไม่ต้องเปิดทรานแซกชัน ตัวที่กันอนุมัติซ้ำจริงคือการจองข้างล่าง
	if enrollment.Status != models.EnrollmentStatusPending {
		return nil, ErrEnrollmentNotPending
	}

	if enrollment.Package == nil {
		return nil, errors.New("ไม่พบข้อมูลแพ็กเกจของการลงทะเบียนนี้ (แพ็กเกจอาจถูกลบไปแล้ว)")
	}

	err := s.db.Transaction(func(tx *gorm.DB) error {
		lockedPkg, err := lockPackageSeats(tx, enrollment.PackageID)
		if err != nil {
			return err
		}

		expireStaleEnrollments(tx)

		// ⚠️ ต้องเช็คที่นั่งก่อนจองสถานะ — awaiting_payment อยู่ใน enrollmentApprovedStatuses
		// ถ้าจองก่อน จะนับใบนี้เป็นที่นั่งที่ยึดแล้ว แล้วตอบว่าเต็มทั้งที่ยังว่าง
		taken, err := seatsTaken(tx, enrollment.PackageID)
		if err != nil {
			return err
		}
		if taken >= lockedPkg.MaxSeats {
			if !allowOverbook {
				return ErrPackageSeatsFull
			}

			expanded := taken + 1
			if err := tx.Model(&models.Package{}).
				Where("id = ?", enrollment.PackageID).
				Update("max_seats", expanded).Error; err != nil {
				return errors.New("ไม่สามารถขยายจำนวนที่นั่งของแพ็กเกจได้")
			}
			enrollment.Package.MaxSeats = expanded

			log.Printf("[enrollment] #%d: แอดมิน #%d อนุมัติเกินที่นั่ง แพ็กเกจ #%d ขยาย %d → %d",
				enrollment.ID, adminID, enrollment.PackageID, taken, expanded)
		}

		// จองใบนี้ก่อนแตะอะไรที่เกี่ยวกับเงิน — ⚠️ ห้ามย้ายไปหลัง createEnrollmentBilling
		//
		// คำขอสองอันที่เข้ามาพร้อมกันอ่านเจอ pending ได้ทั้งคู่ แล้วสร้างบิลคนละใบ
		// ให้ใบสมัครเดียวกัน billing_id เก็บได้ใบเดียว อีกใบกลายเป็นบิลลอยที่ลูกค้าอาจจ่ายซ้ำ
		// UPDATE ... WHERE status = 'pending' รับประกันว่ามีผู้ชนะรายเดียว ผู้แพ้ได้ 0 แถว
		claim := tx.Model(&models.Enrollment{}).
			Where("id = ? AND status = ?", enrollment.ID, models.EnrollmentStatusPending).
			Update("status", models.EnrollmentStatusAwaitingPayment)
		if claim.Error != nil {
			return errors.New("ไม่สามารถอัปเดตสถานะการลงทะเบียนได้")
		}
		if claim.RowsAffected == 0 {
			return ErrEnrollmentNotPending
		}
		enrollment.Status = models.EnrollmentStatusAwaitingPayment

		if err := createEnrollmentBilling(tx, &enrollment, &adminID); err != nil {
			return err
		}

		// ⚠️ เกณฑ์ "รายคน" ตั้งใจให้ต่างจาก hasStudiedCourse ใน EnrollCourse
		// ที่นี่ถามว่า "ต้องเก็บเงินก่อนให้เรียนไหม" ซึ่งเป็นเรื่องความน่าเชื่อถือของตัวคน
		// ไม่ใช่ของคอร์ส — เคยเรียนคอร์สไหนมาก่อนก็ถือว่ารู้จักกันแล้ว
		studiedBefore, err := hasStudiedAnything(tx, enrollment.CustomerID, enrollment.ID)
		if err != nil {
			return err
		}

		// เคยเรียนมาก่อน = ไม่ต้องรอชำระเงิน เขียนทับสถานะที่จองไว้เป็น active
		if studiedBefore {
			return activateEnrollment(tx, &enrollment, enrollment.Package)
		}

		// นักเรียนใหม่ = ค้างที่ awaiting_payment ตามที่จองไว้แล้ว
		return nil
	})

	if err != nil {
		return nil, err
	}

	// แจ้งลูกค้าว่าคำขอได้รับการอนุมัติ (enrollment.CustomerID = customers.id → แปลงเป็น users.id)
	if targetUserID, rerr := ResolveUserID(s.db, enrollment.CustomerID); rerr == nil {
		body := "คำขอสมัครเรียนของคุณได้รับการอนุมัติแล้ว เริ่มเรียนได้เลย"
		href := "/customer/enrollment"
		if enrollment.Status == models.EnrollmentStatusAwaitingPayment {
			body = "คำขอได้รับการอนุมัติ กรุณาชำระเงินเพื่อเริ่มเรียน"
			href = "/customer/payment?tab=billings"
		}
		CreateNotification(s.db, targetUserID,
			"enrollment_approved",
			fmt.Sprintf("enrollment-%d-approved", enrollment.ID),
			"คำขอสมัครได้รับการอนุมัติ",
			body,
			href,
			"success",
		)
	}

	return &enrollment, nil
}

// [READ] ดึงประวัติการลงทะเบียนของนักเรียน
//
// userID ที่รับเข้ามาคือ users.id — ต้องแปลงเป็น customers.id ก่อน query
// (ก่อนหน้านี้เอา users.id ไป query ตรง ๆ กับคอลัมน์ enrollments.customer_id
// ทำให้ได้ข้อมูลของลูกค้าคนอื่นหรือได้ผลลัพธ์ว่างโดยไม่มี error)
func (s *EnrollmentService) GetCustomerEnrollments(userID uint) ([]dto.CustomerEnrollmentDTO, error) {
	customerID, err := s.toCustomerID(userID)
	if err != nil {
		return nil, err
	}
	expireStaleEnrollments(s.db)

	var enrollments []models.Enrollment
	err = s.db.Preload("Package", withDeleted).
		Preload("Package.Course", withDeleted).
		Preload("Package.Schedules").
		Preload("Billing").
		Where("customer_id = ?", customerID).
		Order("enrollment_date DESC").
		Find(&enrollments).Error
	if err != nil {
		return nil, err
	}

	ids := make([]uint, 0, len(enrollments))
	for i := range enrollments {
		ids = append(ids, enrollments[i].ID)
	}
	carried, err := carriedOverSessions(s.db, ids)
	if err != nil {
		return nil, err
	}

	return toCustomerEnrollmentDTOs(enrollments, carried), nil
}

// toCustomerEnrollmentDTOs แปลงเป็น DTO แทนการส่ง models.Enrollment ดิบ
//
// เหตุผลที่ไม่ส่ง model ดิบ: relation ที่ Preload มาจะติดไปทั้งก้อน และถ้าวันไหน
// มีคนเพิ่ม Preload("...User") เข้ามา bcrypt hash จะรั่วทันที
// (models.User.Password ยังใช้ tag json:"password" ไม่ใช่ json:"-")
func toCustomerEnrollmentDTOs(enrollments []models.Enrollment, carried map[uint]uint) []dto.CustomerEnrollmentDTO {
	items := make([]dto.CustomerEnrollmentDTO, 0, len(enrollments))

	for i := range enrollments {
		e := &enrollments[i]

		item := dto.CustomerEnrollmentDTO{
			ID:                  e.ID,
			Status:              string(e.Status),
			EnrollmentDate:      e.EnrollmentDate,
			TotalSessions:       e.TotalSessions,
			RemainingSessions:   e.RemainingSessions,
			AgreedPrice:         e.AgreedPrice,
			BillingID:           e.BillingID,
			StartedAt:           e.StartedAt,
			ExpiresAt:           e.ExpiresAt,
			DaysLeft:            dto.DaysLeft(e.ExpiresAt),
			IsOverdue:           dto.IsBillingOverdue(e.Billing),
			CarriedOverSessions: carried[e.ID],
			RejectedReason:      e.RejectedReason,
			RejectedAt:          e.RejectedAt,
		}

		// กัน underflow ของ uint กรณีแอดมินตั้ง remaining มากกว่า total
		if e.TotalSessions >= e.RemainingSessions {
			item.AttendedSessions = e.TotalSessions - e.RemainingSessions
		}

		if e.Package != nil {
			pkg := e.Package

			schedules := make([]dto.PackageScheduleInfoDTO, 0, len(pkg.Schedules))
			for _, sch := range pkg.Schedules {
				schedules = append(schedules, dto.PackageScheduleInfoDTO{
					DayOfWeek: string(sch.DayOfWeek),
					StartTime: sch.StartTime,
					EndTime:   sch.EndTime,
				})
			}

			pkgDTO := &dto.CustomerEnrollmentPackageDTO{
				ID:            pkg.ID,
				SessionsCount: pkg.SessionsCount,
				HoursCount:    pkg.HoursCount,
				Price:         pkg.Price,
				Schedules:     schedules,
			}

			if pkg.Course != nil {
				pkgDTO.Course = &dto.CustomerEnrollmentCourseDTO{
					ID:         pkg.Course.ID,
					CourseName: pkg.Course.CourseName,
					ImageURL:   pkg.Course.ImageURL,
				}
			}

			item.Package = pkgDTO
		}

		items = append(items, item)
	}

	return items
}

// [READ] ดึงข้อมูลการลงทะเบียนทั้งหมด (สำหรับแอดมิน)

func (s *EnrollmentService) GetAllEnrollments() ([]dto.AdminEnrollmentDTO, error) {
	var enrollments []models.Enrollment
	expireStaleEnrollments(s.db)

	if err := s.db.Preload("Customer", withDeleted).
		Preload("Customer.User", withDeleted).
		Preload("Package", withDeleted).
		Preload("Package.Course", withDeleted).
		Preload("Package.Schedules").
		Preload("Billing").
		Order("created_at desc").
		Find(&enrollments).Error; err != nil {
		return nil, err
	}

	ids := make([]uint, 0, len(enrollments))
	for i := range enrollments {
		ids = append(ids, enrollments[i].ID)
	}
	carried, err := carriedOverSessions(s.db, ids)
	if err != nil {
		return nil, err
	}

	return dto.ToAdminEnrollmentDTOs(enrollments, carried), nil
}

// [UPDATE] แก้ไขข้อมูลการลงทะเบียน
func (s *EnrollmentService) UpdateEnrollment(id uint, req dto.UpdateEnrollmentReq) (*models.Enrollment, error) {
	var enrollment models.Enrollment
	if err := s.db.First(&enrollment, id).Error; err != nil {
		return nil, ErrEnrollmentNotFound
	}

	// กำลังจะตั้งเป็นสถานะที่กินที่นั่ง ต้องไม่ชนกับใบอื่นของลูกค้าคนเดียวกัน
	// (uniq_enrollment_customer_package กันไว้ที่ฐานอยู่แล้ว ตรงนี้มีไว้บอกสาเหตุให้ชัด
	// แทนที่จะปล่อยให้ error ดิบจากฐานโผล่ออกไปเป็น 500)
	if req.Status != nil && seatHoldingStatus(models.EnrollmentStatus(*req.Status)) {
		var n int64
		if err := s.db.Model(&models.Enrollment{}).
			Where("customer_id = ? AND package_id = ? AND id <> ? AND status IN ?",
				enrollment.CustomerID, enrollment.PackageID, enrollment.ID, enrollmentSeatStatuses).
			Count(&n).Error; err != nil {
			return nil, errors.New("ไม่สามารถตรวจสอบใบลงทะเบียนที่ซ้ำได้")
		}
		if n > 0 {
			return nil, ErrEnrollmentDuplicateActive
		}
	}

	if req.Status != nil && models.EnrollmentStatus(*req.Status) == models.EnrollmentStatusCancelled {
		err := s.db.Transaction(func(tx *gorm.DB) error {
			if err := releaseLinkedBilling(tx, enrollment.BillingID); err != nil {
				return err
			}
			enrollment.Status = models.EnrollmentStatusCancelled
			if req.RemainingSessions != nil {
				enrollment.RemainingSessions = uint(*req.RemainingSessions)
			}
			return tx.Save(&enrollment).Error
		})
		if err != nil {
			return nil, err
		}
		return &enrollment, nil
	}

	if req.Status != nil && models.EnrollmentStatus(*req.Status) == models.EnrollmentStatusActive && enrollment.StartedAt == nil {
		err := s.db.Transaction(func(tx *gorm.DB) error {
			var pkg models.Package
			if err := tx.First(&pkg, enrollment.PackageID).Error; err != nil {
				// ไม่ล้ม — activateEnrollment รับ nil ได้และจะ fallback เป็นระยะเวลาเริ่มต้น
				if err := activateEnrollment(tx, &enrollment, nil); err != nil {
					return err
				}
			} else if err := activateEnrollment(tx, &enrollment, &pkg); err != nil {
				return err
			}

			if req.RemainingSessions != nil {
				enrollment.RemainingSessions = uint(*req.RemainingSessions)
				return tx.Model(&models.Enrollment{}).
					Where("id = ?", enrollment.ID).
					Update("remaining_sessions", enrollment.RemainingSessions).Error
			}
			return nil
		})
		if err != nil {
			return nil, err
		}
		return &enrollment, nil
	}

	if req.Status != nil {
		enrollment.Status = models.EnrollmentStatus(*req.Status)
	}
	if req.RemainingSessions != nil {
		enrollment.RemainingSessions = uint(*req.RemainingSessions)

		if req.Status == nil {
			switch {
			case enrollment.RemainingSessions == 0 && enrollment.Status == models.EnrollmentStatusActive:
				enrollment.Status = models.EnrollmentStatusCompleted
			case enrollment.RemainingSessions > 0 && enrollment.Status == models.EnrollmentStatusCompleted:
				enrollment.Status = models.EnrollmentStatusActive
			}
		}
	}

	if err := s.db.Save(&enrollment).Error; err != nil {
		return nil, errors.New("ไม่สามารถอัปเดตข้อมูลได้")
	}
	return &enrollment, nil
}

// RejectEnrollment แอดมินปฏิเสธคำขอสมัครเรียนพร้อมเหตุผล
//
// เฉพาะใบ pending — อนุมัติไปแล้วมีบิลออกและอาจเริ่มเรียน ต้องใช้การยกเลิกที่จัดการเรื่องเงินแทน
// ไม่ soft delete (ต่างจาก CancelEnrollment) และที่นั่งคืนเองเพราะ rejected
// ไม่อยู่ใน enrollmentSeatStatuses
func (s *EnrollmentService) RejectEnrollment(enrollmentID uint, adminUserID uint, reason string) error {
	reason = strings.TrimSpace(reason)
	if len([]rune(reason)) < 3 {
		return ErrEnrollmentRejectReason
	}

	var customerID uint

	err := s.db.Transaction(func(tx *gorm.DB) error {
		var enrollment models.Enrollment
		if err := tx.First(&enrollment, enrollmentID).Error; err != nil {
			return ErrEnrollmentNotFound
		}

		if enrollment.Status != models.EnrollmentStatusPending {
			return ErrEnrollmentNotPending
		}

		// ใบ pending ยังไม่มีบิล — เรียกไว้เป็นตาข่ายเผื่อ flow เปลี่ยน
		if err := releaseLinkedBilling(tx, enrollment.BillingID); err != nil {
			return err
		}

		now := time.Now()
		if err := tx.Model(&models.Enrollment{}).
			Where("id = ?", enrollment.ID).
			Updates(map[string]interface{}{
				"status":              models.EnrollmentStatusRejected,
				"rejected_reason":     reason,
				"rejected_by_user_id": adminUserID,
				"rejected_at":         now,
				"billing_id":          nil,
			}).Error; err != nil {
			return errors.New("ไม่สามารถบันทึกการปฏิเสธคำขอได้")
		}

		customerID = enrollment.CustomerID
		return nil
	})

	if err != nil {
		return err
	}

	if targetUserID, rerr := ResolveUserID(s.db, customerID); rerr == nil {
		CreateNotification(s.db, targetUserID,
			"enrollment_rejected",
			fmt.Sprintf("enrollment-%d-rejected", enrollmentID),
			"คำขอสมัครเรียนไม่ผ่านการพิจารณา",
			fmt.Sprintf("เหตุผล: %s", reason),
			// พาไปหน้าประวัติโดยตรง — ใบที่ถูกปฏิเสธไม่โชว์ในกริดหลักแล้ว
			"/customer/enrollment?history=1",
			"warning",
		)
	}

	return nil
}

// CancelMyEnrollment ให้นักเรียนยกเลิกใบสมัครของตัวเอง เฉพาะใบ pending
//
// ⚠️ ต้องเทียบเจ้าของก่อนเสมอ — :id เป็นเลขเรียงที่เดาต่อได้
// ถ้าไม่เทียบ ใครก็ยกเลิกใบของคนอื่นได้ด้วยการเปลี่ยนเลขใน URL
func (s *EnrollmentService) CancelMyEnrollment(userID uint, enrollmentID uint) error {
	customerID, err := s.toCustomerID(userID)
	if err != nil {
		return err
	}

	return s.db.Transaction(func(tx *gorm.DB) error {
		var enrollment models.Enrollment
		if err := tx.First(&enrollment, enrollmentID).Error; err != nil {
			return ErrEnrollmentNotFound
		}

		if enrollment.CustomerID != customerID {
			return ErrEnrollmentForbidden
		}

		if enrollment.Status != models.EnrollmentStatusPending {
			return ErrEnrollmentNotCancellable
		}

		// ใบ pending ยังไม่มีบิล — เรียกไว้เป็นตาข่ายเผื่อ flow เปลี่ยน
		if err := releaseLinkedBilling(tx, enrollment.BillingID); err != nil {
			return err
		}

		enrollment.Status = models.EnrollmentStatusCancelled
		if err := tx.Save(&enrollment).Error; err != nil {
			return errors.New("ไม่สามารถอัปเดตสถานะการลงทะเบียนได้")
		}
		// soft delete ตรงกับของแอดมิน — ใบที่ยกเลิกต้องหลุดจากทั้งรายการและการนับที่นั่ง
		if err := tx.Delete(&enrollment).Error; err != nil {
			return errors.New("ไม่สามารถยกเลิกการลงทะเบียนได้")
		}
		return nil
	})
}

// [DELETE] ยกเลิกการลงทะเบียน (แอดมิน)

func (s *EnrollmentService) CancelEnrollment(id uint) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		var enrollment models.Enrollment
		if err := tx.First(&enrollment, id).Error; err != nil {
			return ErrEnrollmentNotFound
		}

		if err := releaseLinkedBilling(tx, enrollment.BillingID); err != nil {
			return err
		}

		enrollment.Status = models.EnrollmentStatusCancelled
		if err := tx.Save(&enrollment).Error; err != nil {
			return errors.New("ไม่สามารถอัปเดตสถานะการลงทะเบียนได้")
		}
		if err := tx.Delete(&enrollment).Error; err != nil {
			return errors.New("ไม่สามารถยกเลิกการลงทะเบียนได้")
		}
		return nil
	})
}
