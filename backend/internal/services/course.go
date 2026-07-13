package services

import (
	"errors"
	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
	
	"gorm.io/gorm"
)

type CourseService struct {
	db *gorm.DB
}

func NewCourseService(db *gorm.DB) *CourseService {
	return &CourseService{db: db}
}

// GetAllCourses - ทำงานถูกต้องแล้ว
func (s *CourseService) GetAllCourses() ([]dto.CourseDTO, error) {
	var courses []models.Course

	err := s.db.Preload("User").
		Preload("Packages").
		Order("id ASC").
		Find(&courses).Error

	if err != nil {
		return nil, err
	}

	var response []dto.CourseDTO
	for _, courseItem := range courses {
		var packagesDTO []dto.CoursePackageDTO
		for _, pkg := range courseItem.Packages {
			packagesDTO = append(packagesDTO, dto.CoursePackageDTO{
				ID:            pkg.ID,
				SessionsCount: pkg.SessionsCount,
				HoursCount:    pkg.HoursCount,
				Price:         pkg.Price,
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

// GetCourseByID - ทำงานถูกต้องแล้ว
func (s *CourseService) GetCourseByID(id uint) (*dto.CourseDTO, error) {
	var courseItem models.Course

	err := s.db.Preload("User").
		Preload("Packages").
		First(&courseItem, id).Error

	if err != nil {
		return nil, err // คืนค่า gorm.ErrRecordNotFound กลับไปให้ Controller เช็กได้
	}

	var packagesDTO []dto.CoursePackageDTO
	for _, pkg := range courseItem.Packages {
		packagesDTO = append(packagesDTO, dto.CoursePackageDTO{
			ID:            pkg.ID,
			SessionsCount: pkg.SessionsCount,
			HoursCount:    pkg.HoursCount,
			Price:         pkg.Price,
		})
	}

	response := dto.CourseDTO{
		ID:          courseItem.ID,
		CourseName:  courseItem.CourseName,
		Description: courseItem.Description,
		Status:      string(courseItem.Status),
		Packages:    packagesDTO,
	}

	if courseItem.User != nil {
		response.User = &dto.CourseUserDTO{
			FirstName: courseItem.User.FirstName,
			LastName:  courseItem.User.LastName,
			Email:     courseItem.User.Email,
		}
	}

	return &response, nil
}

// CreateCourse - ปรับปรุงการตรวจสอบชื่อซ้ำ
func (s *CourseService) CreateCourse(course *models.Course) error {
	var existingCourse models.Course
	// ใช้ .Select("id") เพื่อประสิทธิภาพ เพราะเราต้องการเช็กแค่ว่า "มีอยู่ไหม" ไม่ต้องดึงมาทั้ง Object
	err := s.db.Select("id").Where("course_name = ?", course.CourseName).First(&existingCourse).Error
	if err == nil {
		return errors.New("ชื่อคอร์สเรียนนี้มีอยู่ในระบบแล้ว")
	}

	return s.db.Create(course).Error
}

// UpdateCourse - ปรับปรุงการ Mapping และตรวจสอบ Type ของ Status
func (s *CourseService) UpdateCourse(id uint, input models.Course) (*dto.CourseDTO, error) {
	var courseItem models.Course
	err := s.db.First(&courseItem, id).Error
	if err != nil {
		return nil, err
	}

	updateData := make(map[string]interface{})
	if input.CourseName != "" {
		updateData["course_name"] = input.CourseName
	}
	if input.Description != "" {
		updateData["description"] = input.Description
	}
	// แนะนำแปลงเป็น string ก่อนเทียบเคส หรือเช็กตามโครงสร้างจริง
	if string(input.Status) != "" {
		updateData["status"] = input.Status
	}

	if len(updateData) > 0 {
		if err := s.db.Model(&courseItem).Updates(updateData).Error; err != nil {
			return nil, err
		}
	}

	return s.GetCourseByID(id)
}

// DeleteCourse - ทำงานถูกต้องแล้ว
func (s *CourseService) DeleteCourse(id uint) error {
	var courseItem models.Course
	if err := s.db.First(&courseItem, id).Error; err != nil {
		return err
	}
	
	return s.db.Delete(&courseItem).Error
}