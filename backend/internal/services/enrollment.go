package services

import (
	"errors"
	"time"

	"gorm.io/gorm"
	"CPE-691015/internal/models"
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
		IsScheduleUnlocked: true,              // อนุญาตให้จัดตารางเรียนได้
	}

	// 3. บันทึกลง Database
	if err := s.db.Create(&newEnrollment).Error; err != nil {
		return nil, errors.New("ไม่สามารถบันทึกการลงทะเบียนได้")
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
func (s *EnrollmentService) UpdateEnrollment(id uint, updateData map[string]interface{}) (*models.Enrollment, error) {
	var enrollment models.Enrollment
	if err := s.db.First(&enrollment, id).Error; err != nil {
		return nil, errors.New("ไม่พบข้อมูลการลงทะเบียน")
	}

	if status, ok := updateData["status"].(string); ok {
		enrollment.Status = models.EnrollmentStatus(status)
	}
	if remaining, ok := updateData["remaining_sessions"].(float64); ok {
		enrollment.RemainingSessions = uint(remaining)
	}
	if unlocked, ok := updateData["is_schedule_unlocked"].(bool); ok {
		enrollment.IsScheduleUnlocked = unlocked
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