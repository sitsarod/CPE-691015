package services

import (
	"errors"
	"fmt"
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

	var response []dto.CourseDTO
	for _, courseItem := range courses {
		var packagesDTO []dto.CoursePackageDTO
		for _, pkg := range courseItem.Packages {
			var schedulesDTO []dto.PackageScheduleInfoDTO
			for _, sch := range pkg.Schedules {
				schedulesDTO = append(schedulesDTO, dto.PackageScheduleInfoDTO{
					DayOfWeek: string(sch.DayOfWeek),
					StartTime: sch.StartTime,
					EndTime:   sch.EndTime,
				})
			}

			packagesDTO = append(packagesDTO, dto.CoursePackageDTO{
				ID:                 pkg.ID,
				SessionsCount:      pkg.SessionsCount,
				HoursCount:         pkg.HoursCount,
				Price:              pkg.Price,
				MaxSeats:           pkg.MaxSeats,
				CurrentEnrollments: uint(len(pkg.Enrollments)),
				Schedules:          schedulesDTO,
			})
		}

		item := dto.CourseDTO{
			ID:          courseItem.ID,
			CourseName:  courseItem.CourseName,
			Description: courseItem.Description,
			Status:      string(courseItem.Status),
			Packages:    packagesDTO,
		}

		if courseItem.User != nil {
			item.User = &dto.CourseUserDTO{
				FirstName: courseItem.User.FirstName,
				LastName:  courseItem.User.LastName,
				Email:     courseItem.User.Email,
			}
		}
		response = append(response, item)
	}

	return response, nil
}

// [POST] ลงทะเบียนคอร์สเรียน (เปลี่ยนเป็นสถานะ Pending และยังไม่สร้างบิล)
//
// userID ที่รับเข้ามาคือ users.id — จะถูกแปลงเป็น customers.id ก่อนบันทึกลง enrollments
func (s *EnrollmentService) EnrollCourse(userID uint, packageID uint) (*models.Enrollment, error) {
	var pkg models.Package

	if err := s.db.Preload("Course").First(&pkg, packageID).Error; err != nil {
		return nil, errors.New("ไม่พบข้อมูลแพ็กเกจที่เลือก")
	}

	customerID, err := s.toCustomerID(userID)
	if err != nil {
		return nil, err
	}

	var existingCount int64
	if err := s.db.Model(&models.Enrollment{}).
		Where("customer_id = ? AND package_id = ? AND status IN ?",
			customerID, packageID,
			[]models.EnrollmentStatus{models.EnrollmentStatusPending, models.EnrollmentStatusActive}).
		Count(&existingCount).Error; err != nil {
		return nil, errors.New("ไม่สามารถตรวจสอบการลงทะเบียนเดิมได้")
	}
	if existingCount > 0 {
		return nil, errors.New("คุณได้สมัครแพ็กเกจนี้ไว้แล้ว กรุณารอการอนุมัติหรือตรวจสอบคอร์สของคุณ")
	}

	newEnrollment := models.Enrollment{
		CustomerID:         customerID,
		PackageID:          packageID,
		EnrollmentDate:     time.Now(),
		TotalSessions:      pkg.SessionsCount,
		RemainingSessions:  pkg.SessionsCount,
		Status:             models.EnrollmentStatusPending, // รอแอดมินอนุมัติ
	}

	if err := s.db.Create(&newEnrollment).Error; err != nil {
		return nil, errors.New("ไม่สามารถบันทึกการลงทะเบียนได้")
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

	// เช็คว่าที่นั่งเต็มหรือยัง (นับเฉพาะ Active)
	var activeCount int64
	s.db.Model(&models.Enrollment{}).
		Where("package_id = ? AND status = ?", enrollment.PackageID, models.EnrollmentStatusActive).
		Count(&activeCount)

	if uint(activeCount) >= enrollment.Package.MaxSeats {
		return nil, ErrPackageSeatsFull
	}

	var billingType models.BillingType
	if err := s.db.Where("billing_type_name = ?", "ค่าคอร์สเรียน").First(&billingType).Error; err != nil {
		return nil, errors.New("ไม่พบประเภทบิล 'ค่าคอร์สเรียน' ในระบบ")
	}

	// Billing.CustomerID อ้างถึง users.id แต่ enrollment.CustomerID เป็น customers.id
	// จึงต้องแปลงก่อน มิฉะนั้นบิลจะไปผูกกับผู้ใช้ผิดคน (คนที่ users.id บังเอิญ
	// เท่ากับ customers.id นั้นพอดี) ซึ่งเป็นบั๊กที่มองไม่เห็นจนกว่าจะมีข้อมูลจริง
	billingUserID, err := s.toUserID(enrollment.CustomerID)
	if err != nil {
		return nil, err
	}

	err = s.db.Transaction(func(tx *gorm.DB) error {
		newBilling := models.Billing{
			Description:   fmt.Sprintf("ค่าลงทะเบียน: %s (เรียน %d ครั้ง)", enrollment.Package.Course.CourseName, enrollment.Package.SessionsCount),
			Amount:        enrollment.Package.Price,
			DueDate:       time.Now().AddDate(0, 0, 3), // ให้เวลาจ่าย 3 วัน
			Status:        models.StatusUnfunded,
			CustomerID:    billingUserID,
			BillingTypeID: billingType.ID,
			AdminID:       adminID,
		}

		if err := tx.Create(&newBilling).Error; err != nil {
			return errors.New("ไม่สามารถสร้างใบแจ้งหนี้ได้")
		}

		enrollment.Status = models.EnrollmentStatusActive
		enrollment.BillingID = &newBilling.ID
		if err := tx.Save(&enrollment).Error; err != nil {
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
func (s *EnrollmentService) GetCustomerEnrollments(userID uint) ([]models.Enrollment, error) {
	customerID, err := s.toCustomerID(userID)
	if err != nil {
		return nil, err
	}

	var enrollments []models.Enrollment
	err = s.db.Preload("Package").
		Preload("Package.Course").
		Preload("Package.Schedules").
		Where("customer_id = ?", customerID).
		Find(&enrollments).Error
	return enrollments, err
}

// [READ] ดึงข้อมูลการลงทะเบียนทั้งหมด (สำหรับแอดมิน)

func (s *EnrollmentService) GetAllEnrollments() ([]models.Enrollment, error) {
	var enrollments []models.Enrollment
	err := s.db.Preload("Customer").
		Preload("Customer.User").
		Preload("Package").
		Preload("Package.Course").
		Preload("Package.Schedules").
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