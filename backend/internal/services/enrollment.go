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

// [GET] ดึงข้อมูลคอร์สที่เปิดสอน
func (s *EnrollmentService) GetAvailableCourses() ([]dto.CourseDTO, error) {
	var courses []models.Course
	
	err := s.db.Preload("User").
		Preload("Packages").
		Preload("Packages.Schedules").
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
				ID:            pkg.ID,
				SessionsCount: pkg.SessionsCount,
				HoursCount:    pkg.HoursCount,
				Price:         pkg.Price,
				Schedules:     schedulesDTO,
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

// [POST] ลงทะเบียนคอร์สเรียน
func (s *EnrollmentService) EnrollCourse(customerID uint, packageID uint) (*models.Enrollment, error) {
	var pkg models.Package
	
	if err := s.db.Preload("Course").First(&pkg, packageID).Error; err != nil {
		return nil, errors.New("ไม่พบข้อมูลแพ็กเกจที่เลือก")
	}

	var admin models.User
	if err := s.db.Where("role = ?", models.AdminRole).First(&admin).Error; err != nil {
		return nil, errors.New("ไม่พบข้อมูลแอดมินในระบบ")
	}

	var billingType models.BillingType
	if err := s.db.Where("billing_type_name = ?", "ค่าคอร์สเรียน").First(&billingType).Error; err != nil {
		return nil, errors.New("ไม่พบประเภทบิล 'ค่าคอร์สเรียน' ในระบบ")
	}

	newEnrollment := models.Enrollment{
		CustomerID:         customerID,
		PackageID:          packageID,
		EnrollmentDate:     time.Now(),
		TotalSessions:      pkg.SessionsCount,
		RemainingSessions:  pkg.SessionsCount,
		Status:             models.EnrollmentStatusActive,
	}

	err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&newEnrollment).Error; err != nil {
			return errors.New("ไม่สามารถบันทึกการลงทะเบียนได้")
		}

		newBilling := models.Billing{
			Description:   fmt.Sprintf("ค่าลงทะเบียน: %s (เรียน %d ครั้ง)", pkg.Course.CourseName, pkg.SessionsCount),
			Amount:        pkg.Price,
			DueDate:       time.Now().AddDate(0, 0, 3),
			Status:        models.StatusUnfunded,
			CustomerID:    customerID,
			BillingTypeID: billingType.ID,
			AdminID:       admin.ID,
		}

		if err := tx.Create(&newBilling).Error; err != nil {
			return errors.New("ไม่สามารถสร้างใบแจ้งหนี้ได้")
		}

		newEnrollment.BillingID = &newBilling.ID
		if err := tx.Save(&newEnrollment).Error; err != nil {
			return errors.New("ไม่สามารถเชื่อมโยงบิลกับการลงทะเบียนได้")
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	return &newEnrollment, nil
}

// [READ] ดึงประวัติการลงทะเบียนของนักเรียน
func (s *EnrollmentService) GetCustomerEnrollments(customerID uint) ([]models.Enrollment, error) {
	var enrollments []models.Enrollment
	err := s.db.Preload("Package").
		Preload("Package.Course").
		Preload("Package.Schedules").
		Where("customer_id = ?", customerID).
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