package services

import (
	"strings"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
)


// ToCourseDTO แปลงคอร์สหนึ่งรายการ
func ToCourseDTO(courseItem *models.Course) dto.CourseDTO {
	packagesDTO := make([]dto.CoursePackageDTO, 0, len(courseItem.Packages))
	for _, pkg := range courseItem.Packages {
		schedulesDTO := make([]dto.PackageScheduleInfoDTO, 0, len(pkg.Schedules))
		for _, sch := range pkg.Schedules {
			schedulesDTO = append(schedulesDTO, dto.PackageScheduleInfoDTO{
				DayOfWeek: string(sch.DayOfWeek),
				StartTime: sch.StartTime,
				EndTime:   sch.EndTime,
			})
		}


		durationDays := pkg.DurationDays
		if durationDays == 0 {
			durationDays = defaultEnrollmentDurationDays
		}

		packagesDTO = append(packagesDTO, dto.CoursePackageDTO{
			ID:                 pkg.ID,
			SessionsCount:      pkg.SessionsCount,
			HoursCount:         pkg.HoursCount,
			Price:              pkg.Price,
			MaxSeats:           pkg.MaxSeats,
			DurationDays:       durationDays,
			CurrentEnrollments: uint(len(pkg.Enrollments)),
			Schedules:          schedulesDTO,
		})
	}

	item := dto.CourseDTO{
		ID:               courseItem.ID,
		CourseName:       courseItem.CourseName,
		Description:      courseItem.Description,
		Status:           string(courseItem.Status),
		LearningOutcomes: SplitLearningOutcomes(courseItem.LearningOutcomes),
		Packages:         packagesDTO,
	}

	if courseItem.User != nil {
		item.User = &dto.CourseUserDTO{
			FirstName: courseItem.User.FirstName,
			LastName:  courseItem.User.LastName,
			Email:     courseItem.User.Email,
		}
	}

	return item
}

// ToCourseDTOs แปลงทั้งรายการ
func ToCourseDTOs(courses []models.Course) []dto.CourseDTO {
	result := make([]dto.CourseDTO, 0, len(courses))
	for i := range courses {
		result = append(result, ToCourseDTO(&courses[i]))
	}
	return result
}


func SplitLearningOutcomes(raw string) []string {
	out := []string{}
	if strings.TrimSpace(raw) == "" {
		return out
	}

	for _, line := range strings.Split(strings.ReplaceAll(raw, "\r\n", "\n"), "\n") {
		line = strings.TrimSpace(line)
		line = strings.TrimLeft(line, "-•*")
		line = strings.TrimSpace(line)
		if line != "" {
			out = append(out, line)
		}
	}
	return out
}

// JoinLearningOutcomes แปลงรายการกลับเป็นข้อความหลายบรรทัดสำหรับเก็บลง DB
func JoinLearningOutcomes(items []string) string {
	cleaned := make([]string, 0, len(items))
	for _, s := range items {
		if s = strings.TrimSpace(s); s != "" {
			cleaned = append(cleaned, s)
		}
	}
	return strings.Join(cleaned, "\n")
}
