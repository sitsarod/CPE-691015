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

// ─────────────────────────────────────────────────────────────────────────────
// การแปลง ID ระหว่าง users กับ customers
//
// ระบบนี้มี "ลูกค้า" อยู่ 2 ความหมายที่ไม่ตรงกัน:
//   - Billing.CustomerID / Invoice.CustomerID  → อ้างถึง users.id
//   - Enrollment.CustomerID                    → อ้างถึง customers.id
//
// ข้อตกลงของโปรเจคนี้คือ **API ทุกเส้นรับ-ส่ง User.ID เสมอ** (ตรงกับ user_id
// ที่ frontend เก็บไว้ใน localStorage และตรงกับ claim user_id ใน JWT)
// การแปลงเป็น customers.id จะทำที่ชั้น service เท่านั้น ผ่านสองฟังก์ชันข้างล่างนี้
//
// อย่าส่ง customers.id ออกไปให้ controller หรือ frontend เห็นเด็ดขาด
// เพราะ CheckIDOR เทียบกับ User.ID จาก JWT — ถ้าปนกันจะกลายเป็นช่องโหว่ IDOR
// ─────────────────────────────────────────────────────────────────────────────

// toCustomerID แปลง users.id → customers.id
func (s *EnrollmentService) toCustomerID(userID uint) (uint, error) {
	var customer models.Customer
	if err := s.db.Where("user_id = ?", userID).First(&customer).Error; err != nil {
		return 0, errors.New("ไม่พบโปรไฟล์ลูกค้าของผู้ใช้งานนี้")
	}
	return customer.ID, nil
}

// toUserID แปลง customers.id → users.id
func (s *EnrollmentService) toUserID(customerID uint) (uint, error) {
	var customer models.Customer
	if err := s.db.First(&customer, customerID).Error; err != nil {
		return 0, errors.New("ไม่พบข้อมูลลูกค้า")
	}
	return customer.UserID, nil
}

// [GET] ดึงข้อมูลคอร์สที่เปิดสอน
func (s *EnrollmentService) GetAvailableCourses() ([]dto.CourseDTO, error) {
	var courses []models.Course
	
	err := s.db.Preload("User").
		Preload("Packages").
		Preload("Packages.Schedules").
		Preload("Packages.Enrollments", "status = ?", models.EnrollmentStatusActive).
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
		return nil, errors.New("ไม่พบข้อมูลการลงทะเบียน")
	}

	if enrollment.Status != models.EnrollmentStatusPending {
		return nil, errors.New("การลงทะเบียนนี้ไม่ได้อยู่ในสถานะรออนุมัติ")
	}

	// เช็คว่าที่นั่งเต็มหรือยัง (นับเฉพาะ Active)
	var activeCount int64
	s.db.Model(&models.Enrollment{}).
		Where("package_id = ? AND status = ?", enrollment.PackageID, models.EnrollmentStatusActive).
		Count(&activeCount)

	if uint(activeCount) >= enrollment.Package.MaxSeats {
		return nil, errors.New("ไม่สามารถอนุมัติได้ เนื่องจากแพ็กเกจนี้ที่นั่งเต็มแล้ว กรุณาขยายจำนวนที่นั่งสูงสุดก่อน")
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
		return nil, errors.New("ไม่พบข้อมูลการลงทะเบียน")
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
		if err := tx.Delete(&models.Enrollment{}, id).Error; err != nil {
			return errors.New("ไม่สามารถยกเลิกการลงทะเบียนได้")
		}
		return nil
	})
}