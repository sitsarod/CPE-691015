package services

import (
	"errors"
	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
	
	"gorm.io/gorm"
)

var enrollmentSeatStatuses = []models.EnrollmentStatus{
	models.EnrollmentStatusPending,
	models.EnrollmentStatusActive,
}

var (
	ErrInvalidCourseStatus = errors.New("สถานะคอร์สไม่ถูกต้อง (ต้องเป็น active, inactive หรือ draft)")
	ErrCourseHasActiveEnrollments = errors.New("ไม่สามารถลบคอร์สได้ เนื่องจากยังมีนักเรียนลงทะเบียนอยู่ กรุณายกเลิกการลงทะเบียนที่ค้างก่อน")
)

func isValidCourseStatus(s models.CourseStatus) bool {
	switch s {
	case models.CourseStatusActive, models.CourseStatusInactive, models.CourseStatusDraft:
		return true
	default:
		return false
	}
}

type CourseService struct {
	db *gorm.DB
}

func NewCourseService(db *gorm.DB) *CourseService {
	return &CourseService{db: db}
}

// GetAllCourses
//
// onlyActive = true  → คืนเฉพาะคอร์สสถานะ active (สำหรับเส้นทาง public /courses)
// onlyActive = false → คืนทุกสถานะรวม draft/inactive (สำหรับหน้าจัดการของแอดมิน)
// (C1) เดิม public เห็นคอร์ส draft/inactive ด้วย จึงต้องแยกเงื่อนไขตาม caller
func (s *CourseService) GetAllCourses(onlyActive bool) ([]dto.CourseDTO, error) {
	var courses []models.Course

	query := s.db.Preload("User").
		Preload("Packages").
		Preload("Packages.Schedules").
		Preload("Packages.Enrollments", "status IN ?", enrollmentSeatStatuses).
		Order("id ASC")

	if onlyActive {
		query = query.Where("status = ?", models.CourseStatusActive)
	}

	err := query.Find(&courses).Error

	if err != nil {
		return nil, err
	}

	return ToCourseDTOs(courses), nil
}

// GetCourseByID
//
// onlyActive = true  → หาเฉพาะคอร์ส active (public) — ถ้าเป็น draft/inactive จะคืน
//                      gorm.ErrRecordNotFound เหมือนไม่มีคอร์สนี้ (กันคอร์สที่ยังไม่เปิดหลุด)
// onlyActive = false → หาได้ทุกสถานะ (แอดมิน/ใช้ภายในหลังสร้างคอร์ส)
func (s *CourseService) GetCourseByID(id uint, onlyActive bool) (*dto.CourseDTO, error) {
	var courseItem models.Course

	query := s.db.Preload("User").
		Preload("Packages").
		Preload("Packages.Schedules").
		Preload("Packages.Enrollments", "status IN ?", enrollmentSeatStatuses)

	if onlyActive {
		query = query.Where("status = ?", models.CourseStatusActive)
	}

	err := query.First(&courseItem, id).Error

	if err != nil {
		return nil, err
	}

	response := ToCourseDTO(&courseItem)
	return &response, nil
}

// CreateCourse 
func (s *CourseService) CreateCourse(course *models.Course) error {
	var existingCourse models.Course
	err := s.db.Select("id").Where("course_name = ?", course.CourseName).First(&existingCourse).Error
	if err == nil {
		return errors.New("ชื่อคอร์สเรียนนี้มีอยู่ในระบบแล้ว")
	}

	return s.db.Create(course).Error
}

// UpdateCourse
//
// รับ DTO แทน models.Course ดิบ เพื่อให้ LearningOutcomes รับเข้ามาเป็น array ได้
// (model เก็บเป็น text บรรทัดละข้อ จึงต้องแปลงที่ชั้นนี้) และเพื่อไม่ให้ client
// ยัดฟิลด์อื่นของ model เช่น user_id เข้ามาแก้ได้
//
// ทุกฟิลด์เป็น pointer — nil = ไม่แก้ ส่งค่ามา = แก้ตามนั้น (รวมถึงแก้เป็นค่าว่าง)
func (s *CourseService) UpdateCourse(id uint, input dto.UpdateCourseReq) (*dto.CourseDTO, error) {
	var courseItem models.Course
	err := s.db.First(&courseItem, id).Error
	if err != nil {
		return nil, err
	}

	updateData := make(map[string]interface{})
	if input.CourseName != nil {
		updateData["course_name"] = *input.CourseName
	}
	if input.Description != nil {
		updateData["description"] = *input.Description
	}
	if input.Status != nil {
		status := models.CourseStatus(*input.Status)
		if !isValidCourseStatus(status) {
			return nil, ErrInvalidCourseStatus
		}
		updateData["status"] = status
	}
	if input.LearningOutcomes != nil {
		// ส่ง [] มา = ลบรายการทั้งหมด ซึ่งต่างจากไม่ส่งฟิลด์นี้มาเลย (= ไม่แตะ)
		updateData["learning_outcomes"] = JoinLearningOutcomes(*input.LearningOutcomes)
	}

	if len(updateData) > 0 {
		if err := s.db.Model(&courseItem).Updates(updateData).Error; err != nil {
			return nil, err
		}
	}

	// แอดมินต้องเห็นผลแม้คอร์สจะเป็น draft/inactive → onlyActive = false
	return s.GetCourseByID(id, false)
}


func (s *CourseService) DeleteCourse(id uint) error {
	var courseItem models.Course
	if err := s.db.Preload("Packages").First(&courseItem, id).Error; err != nil {
		return err
	}

	packageIDs := make([]uint, 0, len(courseItem.Packages))
	for _, p := range courseItem.Packages {
		packageIDs = append(packageIDs, p.ID)
	}

	// กันลบคอร์สที่ยังมีการลงทะเบียน pending/active ค้างอยู่
	if len(packageIDs) > 0 {
		var activeEnroll int64
		if err := s.db.Model(&models.Enrollment{}).
			Where("package_id IN ? AND status IN ?", packageIDs, enrollmentSeatStatuses).
			Count(&activeEnroll).Error; err != nil {
			return err
		}
		if activeEnroll > 0 {
			return ErrCourseHasActiveEnrollments
		}
	}

	return s.db.Transaction(func(tx *gorm.DB) error {
		if len(packageIDs) > 0 {
			// PackageSchedule ไม่มี soft delete (ไม่มี gorm.Model) → hard delete
			if err := tx.Where("package_id IN ?", packageIDs).Delete(&models.PackageSchedule{}).Error; err != nil {
				return err
			}
			// Package มี gorm.Model → soft delete
			if err := tx.Where("course_id = ?", id).Delete(&models.Package{}).Error; err != nil {
				return err
			}
		}
		if err := tx.Where("course_id = ?", id).Delete(&models.QuizOptionCourse{}).Error; err != nil {
			return err
		}
		if err := tx.Delete(&courseItem).Error; err != nil {
			return err
		}
		return nil
	})
}