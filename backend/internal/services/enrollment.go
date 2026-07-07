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
func (s *EnrollmentService) GetAvailableCourses() ([]models.Course, error) {
	var courses []models.Course
	// ค้นหาคอร์สที่สถานะเป็น active และ Preload ข้อมูล Packages ข้างในมาด้วย
	err := s.db.Preload("Packages").Where("status = ?", models.CourseStatusActive).Find(&courses).Error
	return courses, err
}

// [POST] ลงทะเบียนคอร์สเรียน
func (s *EnrollmentService) EnrollCourse(customerID uint, packageID uint) (*models.Enrollment, error) {
	var pkg models.Package
	// 1. ตรวจสอบว่ามีแพ็กเกจนี้อยู่จริง
	if err := s.db.First(&pkg, packageID).Error; err != nil {
		return nil, errors.New("ไม่พบข้อมูลแพ็กเกจที่เลือก")
	}

	// 2. สร้างข้อมูลการลงทะเบียน
	newEnrollment := models.Enrollment{
		CustomerID:         customerID,
		PackageID:          packageID,
		EnrollmentDate:     time.Now(),
		TotalSessions:      pkg.SessionsCount, // ดึงจำนวนครั้งจาก Package
		RemainingSessions:  pkg.SessionsCount, // ตั้งค่าเริ่มต้นให้เท่ากับจำนวนครั้งทั้งหมด
		Status:             models.EnrollmentStatusActive,
		IsScheduleUnlocked: false,             // แก้เป็น false: ยังไม่อนุญาตให้จัดตารางเรียนจนกว่าจะชำระเงิน
	}

	// 3. บันทึกลง Database (เพิ่ม Transaction ผูกกับระบบบิล)
	err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&newEnrollment).Error; err != nil {
			return errors.New("ไม่สามารถบันทึกการลงทะเบียนได้")
		}

		newBilling := models.Billing{
			Description: fmt.Sprintf("ค่าลงทะเบียนเรียนแพ็กเกจ ID: %d", packageID),
			Amount:      pkg.Price, // สมมติว่ามีฟิลด์ Price ใน Package
			DueDate:     time.Now().AddDate(0, 0, 3),
			Status:      models.StatusUnfunded,
			CustomerID:  customerID,
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
		Preload("WeeklySchedules").
		Where("customer_id = ?", customerID).
		Find(&enrollments).Error
	return enrollments, err
}

// [UPDATE] แก้ไขข้อมูลการลงทะเบียน (เช่น แอดมินแก้ไขโควตา หรือสถานะ)
func (s *EnrollmentService) UpdateEnrollment(id uint, req dto.UpdateEnrollmentReq) (*models.Enrollment, error) {
	var enrollment models.Enrollment
	if err := s.db.First(&enrollment, id).Error; err != nil {
		return nil, errors.New("ไม่พบข้อมูลการลงทะเบียน")
	}

	// ตรวจสอบจากค่า Pointer ใน DTO แทน
	if req.Status != nil {
		enrollment.Status = models.EnrollmentStatus(*req.Status)
	}
	if req.RemainingSessions != nil {
		enrollment.RemainingSessions = uint(*req.RemainingSessions)
	}
	if req.IsScheduleUnlocked != nil {
		enrollment.IsScheduleUnlocked = *req.IsScheduleUnlocked
	}

	if err := s.db.Save(&enrollment).Error; err != nil {
		return nil, errors.New("ไม่สามารถอัปเดตข้อมูลได้")
	}
	return &enrollment, nil
}

// [DELETE] ยกเลิกการลงทะเบียน
func (s *EnrollmentService) CancelEnrollment(id uint) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("enrollment_id = ?", id).Delete(&models.WeeklySchedule{}).Error; err != nil {
			return errors.New("ไม่สามารถลบตารางเรียนที่เกี่ยวข้องได้")
		}
		if err := tx.Delete(&models.Enrollment{}, id).Error; err != nil {
			return errors.New("ไม่สามารถยกเลิกการลงทะเบียนได้")
		}
		return nil
	})
}

// [CREATE] จัดตารางเรียน (รองรับการส่งมาหลายวันพร้อมกัน)
func (s *EnrollmentService) SetupWeeklySchedule(enrollmentID uint, schedules []models.WeeklySchedule) error {
	if len(schedules) == 0 {
		return errors.New("กรุณาระบุตารางเรียนอย่างน้อย 1 วัน")
	}

	var enrollment models.Enrollment
	if err := s.db.Preload("Billing").First(&enrollment, enrollmentID).Error; err != nil {
		return errors.New("ไม่พบข้อมูลการลงทะเบียน")
	}

	// ตรวจสอบสถานะการจ่ายเงินจาก Billing
	if enrollment.Billing == nil || enrollment.Billing.Status != models.StatusPaid {
		return errors.New("ไม่สามารถจัดตารางเรียนได้ เนื่องจากยังไม่ได้ชำระเงิน หรือแอดมินยังไม่อนุมัติ")
	}

	for i := range schedules {
		schedules[i].EnrollmentID = enrollmentID
	}

	return s.db.Create(&schedules).Error
}

// [UPDATE] แก้ไขเวลาเรียน (ทีละรายการ)
func (s *EnrollmentService) UpdateSingleSchedule(scheduleID uint, day models.DayOfWeek, start string, end string) (*models.WeeklySchedule, error) {
	var schedule models.WeeklySchedule
	if err := s.db.First(&schedule, scheduleID).Error; err != nil {
		return nil, errors.New("ไม่พบตารางเรียนนี้")
	}

	schedule.DayOfWeek = day
	schedule.StartTime = start
	schedule.EndTime = end

	if err := s.db.Save(&schedule).Error; err != nil {
		return nil, errors.New("ไม่สามารถแก้ไขเวลาเรียนได้")
	}
	return &schedule, nil
}

// [DELETE] ลบตารางเรียน 1 วัน
func (s *EnrollmentService) DeleteSingleSchedule(scheduleID uint) error {
	if err := s.db.Delete(&models.WeeklySchedule{}, scheduleID).Error; err != nil {
		return errors.New("ไม่สามารถลบตารางเรียนได้")
	}
	return nil
}