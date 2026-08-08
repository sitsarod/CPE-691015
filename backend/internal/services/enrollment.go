package services

import (
	"errors"
	"fmt"
	"log"
	"time"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
	"gorm.io/gorm"
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
	now := time.Now()
	expiresAt := now.AddDate(0, 0, int(resolveDurationDays(pkg, e.ID)))
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
	var price float64
	if e.Package != nil {
		sessions = e.Package.SessionsCount
		price = e.Package.Price
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

func seatsFull(tx *gorm.DB, packageID uint, maxSeats uint) (bool, error) {
	var taken int64
	if err := tx.Model(&models.Enrollment{}).
		Where("package_id = ? AND status IN ?", packageID, enrollmentApprovedStatuses).
		Count(&taken).Error; err != nil {
		return false, errors.New("ไม่สามารถตรวจสอบจำนวนที่นั่งคงเหลือได้")
	}
	return uint(taken) >= maxSeats, nil
}

func expireStaleEnrollments(db *gorm.DB) {
	if err := db.Model(&models.Enrollment{}).
		Where("status = ? AND expires_at IS NOT NULL AND expires_at < ?",
			models.EnrollmentStatusActive, time.Now()).
		Update("status", models.EnrollmentStatusExpired).Error; err != nil {
		log.Printf("[enrollment] อัปเดตสถานะใบที่หมดอายุไม่สำเร็จ: %v", err)
	}
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

// [POST] ลงทะเบียนคอร์สเรียน
func (s *EnrollmentService) EnrollCourse(userID uint, packageID uint) (*models.Enrollment, error) {
	var pkg models.Package

	if err := s.db.Preload("Course").First(&pkg, packageID).Error; err != nil {
		return nil, errors.New("ไม่พบข้อมูลแพ็กเกจที่เลือก")
	}

	customerID, err := s.toCustomerID(userID)
	if err != nil {
		return nil, err
	}

	newEnrollment := models.Enrollment{
		CustomerID:        customerID,
		PackageID:         packageID,
		EnrollmentDate:    time.Now(),
		TotalSessions:     pkg.SessionsCount,
		RemainingSessions: pkg.SessionsCount,
	}

	err = s.db.Transaction(func(tx *gorm.DB) error {

		expireStaleEnrollments(tx)

		var existingCount int64
		if err := tx.Model(&models.Enrollment{}).
			Where("customer_id = ? AND package_id = ? AND status IN ?",
				customerID, packageID, enrollmentSeatStatuses).
			Count(&existingCount).Error; err != nil {
			return errors.New("ไม่สามารถตรวจสอบการลงทะเบียนเดิมได้")
		}
		if existingCount > 0 {
			return errors.New("คุณได้สมัครแพ็กเกจนี้ไว้แล้ว กรุณารอการอนุมัติหรือตรวจสอบคอร์สของคุณ")
		}

		studiedCourse, err := hasStudiedCourse(tx, customerID, pkg.CourseID)
		if err != nil {
			return err
		}

		if !studiedCourse {

			newEnrollment.Status = models.EnrollmentStatusPending
			if err := tx.Create(&newEnrollment).Error; err != nil {
				return errors.New("ไม่สามารถบันทึกการลงทะเบียนได้")
			}
			return nil
		}


		full, err := seatsFull(tx, packageID, pkg.MaxSeats)
		if err != nil {
			return err
		}
		if full {
			return ErrPackageSeatsFull
		}

		if err := tx.Create(&newEnrollment).Error; err != nil {
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

	return &newEnrollment, nil
}

// [POST] อนุมัติการลงทะเบียนและสร้างบิล
func (s *EnrollmentService) ApproveEnrollment(enrollmentID uint, adminID uint) (*models.Enrollment, error) {
	var enrollment models.Enrollment
	
	if err := s.db.Preload("Package").Preload("Package.Course").First(&enrollment, enrollmentID).Error; err != nil {
		return nil, ErrEnrollmentNotFound
	}

	if enrollment.Status != models.EnrollmentStatusPending {
		return nil, ErrEnrollmentNotPending
	}

	if enrollment.Package == nil {
		return nil, errors.New("ไม่พบข้อมูลแพ็กเกจของการลงทะเบียนนี้ (แพ็กเกจอาจถูกลบไปแล้ว)")
	}

	err := s.db.Transaction(func(tx *gorm.DB) error {

		expireStaleEnrollments(tx)

		full, err := seatsFull(tx, enrollment.PackageID, enrollment.Package.MaxSeats)
		if err != nil {
			return err
		}
		if full {
			return ErrPackageSeatsFull
		}

		if err := createEnrollmentBilling(tx, &enrollment, &adminID); err != nil {
			return err
		}

		studiedBefore, err := hasStudiedAnything(tx, enrollment.CustomerID, enrollment.ID)
		if err != nil {
			return err
		}

		if studiedBefore {
			return activateEnrollment(tx, &enrollment, enrollment.Package)
		}

		enrollment.Status = models.EnrollmentStatusAwaitingPayment
		if err := tx.Model(&models.Enrollment{}).
			Where("id = ?", enrollment.ID).
			Update("status", models.EnrollmentStatusAwaitingPayment).Error; err != nil {
			return errors.New("ไม่สามารถอัปเดตสถานะการลงทะเบียนได้")
		}
		return nil
	})

	if err != nil {
		return nil, err
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
	err = s.db.Preload("Package").
		Preload("Package.Course").
		Preload("Package.Schedules").
		Preload("Billing").
		Where("customer_id = ?", customerID).
		Order("enrollment_date DESC").
		Find(&enrollments).Error
	if err != nil {
		return nil, err
	}

	return toCustomerEnrollmentDTOs(enrollments), nil
}

// toCustomerEnrollmentDTOs แปลงเป็น DTO แทนการส่ง models.Enrollment ดิบ
//
// เหตุผลที่ไม่ส่ง model ดิบ: relation ที่ Preload มาจะติดไปทั้งก้อน และถ้าวันไหน
// มีคนเพิ่ม Preload("...User") เข้ามา bcrypt hash จะรั่วทันที
// (models.User.Password ยังใช้ tag json:"password" ไม่ใช่ json:"-")
func toCustomerEnrollmentDTOs(enrollments []models.Enrollment) []dto.CustomerEnrollmentDTO {
	items := make([]dto.CustomerEnrollmentDTO, 0, len(enrollments))

	for i := range enrollments {
		e := &enrollments[i]

		item := dto.CustomerEnrollmentDTO{
			ID:                e.ID,
			Status:            string(e.Status),
			EnrollmentDate:    e.EnrollmentDate,
			TotalSessions:     e.TotalSessions,
			RemainingSessions: e.RemainingSessions,
			BillingID:         e.BillingID,
			StartedAt:         e.StartedAt,
			ExpiresAt:         e.ExpiresAt,
			DaysLeft:          dto.DaysLeft(e.ExpiresAt),
			IsOverdue:         dto.IsBillingOverdue(e.Billing),
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
				}
			}

			item.Package = pkgDTO
		}

		items = append(items, item)
	}

	return items
}

// [READ] ดึงข้อมูลการลงทะเบียนทั้งหมด (สำหรับแอดมิน)

func (s *EnrollmentService) GetAllEnrollments() ([]models.Enrollment, error) {
	var enrollments []models.Enrollment
	expireStaleEnrollments(s.db)

	err := s.db.Preload("Customer").
		Preload("Customer.User").
		Preload("Package").
		Preload("Package.Course").
		Preload("Package.Schedules").
		Preload("Billing").
		Order("created_at desc").
		Find(&enrollments).Error
	return enrollments, err
}

// [UPDATE] แก้ไขข้อมูลการลงทะเบียน
func (s *EnrollmentService) UpdateEnrollment(id uint, req dto.UpdateEnrollmentReq) (*models.Enrollment, error) {
	var enrollment models.Enrollment
	if err := s.db.First(&enrollment, id).Error; err != nil {
		return nil, ErrEnrollmentNotFound
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
	}

	if err := s.db.Save(&enrollment).Error; err != nil {
		return nil, errors.New("ไม่สามารถอัปเดตข้อมูลได้")
	}
	return &enrollment, nil
}

// [DELETE] ยกเลิกการลงทะเบียน

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