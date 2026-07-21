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
		Order("id ASC")

	if onlyActive {
		query = query.Where("status = ?", models.CourseStatusActive)
	}

	err := query.Find(&courses).Error

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

// GetCourseByID
//
// onlyActive = true  → หาเฉพาะคอร์ส active (public) — ถ้าเป็น draft/inactive จะคืน
//                      gorm.ErrRecordNotFound เหมือนไม่มีคอร์สนี้ (กันคอร์สที่ยังไม่เปิดหลุด)
// onlyActive = false → หาได้ทุกสถานะ (แอดมิน/ใช้ภายในหลังสร้างคอร์ส)
func (s *CourseService) GetCourseByID(id uint, onlyActive bool) (*dto.CourseDTO, error) {
	var courseItem models.Course

	query := s.db.Preload("User").
		Preload("Packages").
		Preload("Packages.Schedules")

	if onlyActive {
		query = query.Where("status = ?", models.CourseStatusActive)
	}

	err := query.First(&courseItem, id).Error

	if err != nil {
		return nil, err
	}

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
			Schedules:          schedulesDTO,
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
	if string(input.Status) != "" {
		updateData["status"] = input.Status
	}

	if len(updateData) > 0 {
		if err := s.db.Model(&courseItem).Updates(updateData).Error; err != nil {
			return nil, err
		}
	}

	// แอดมินต้องเห็นผลแม้คอร์สจะเป็น draft/inactive → onlyActive = false
	return s.GetCourseByID(id, false)
}

// DeleteCourse
func (s *CourseService) DeleteCourse(id uint) error {
	var courseItem models.Course
	if err := s.db.First(&courseItem, id).Error; err != nil {
		return err
	}
	
	return s.db.Delete(&courseItem).Error
}