package services

import (
	"errors"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
	"gorm.io/gorm"
)

type PackageService struct {
	db *gorm.DB
}

func NewPackageService(db *gorm.DB) *PackageService {
	return &PackageService{db: db}
}

// [CREATE] สร้างแพ็กเกจใหม่ พร้อมตารางเรียนหลายวัน
func (s *PackageService) CreatePackage(req dto.CreatePackageReq) (*models.Package, error) {
	var schedules []models.PackageSchedule
	for _, sch := range req.Schedules {
		schedules = append(schedules, models.PackageSchedule{
			DayOfWeek: models.DayOfWeek(sch.DayOfWeek),
			StartTime: sch.StartTime,
			EndTime:   sch.EndTime,
		})
	}

	newPkg := models.Package{
		CourseID:      req.CourseID,
		SessionsCount: req.SessionsCount,
		HoursCount:    req.HoursCount,
		Price:         req.Price,
		Schedules:     schedules,
	}

	if err := s.db.Create(&newPkg).Error; err != nil {
		return nil, errors.New("ไม่สามารถสร้างแพ็กเกจและตารางเรียนได้")
	}
	return &newPkg, nil
}

// [UPDATE] แก้ไขแพ็กเกจและตารางเวลา
func (s *PackageService) UpdatePackage(id uint, req dto.UpdatePackageReq) (*models.Package, error) {
	var pkg models.Package
	if err := s.db.Preload("Schedules").First(&pkg, id).Error; err != nil {
		return nil, errors.New("ไม่พบข้อมูลแพ็กเกจนี้ในระบบ")
	}

	err := s.db.Transaction(func(tx *gorm.DB) error {
		// อัปเดตข้อมูลหลัก
		if req.SessionsCount != nil {
			pkg.SessionsCount = *req.SessionsCount
		}
		if req.HoursCount != nil {
			pkg.HoursCount = *req.HoursCount
		}
		if req.Price != nil {
			pkg.Price = *req.Price
		}

		if err := tx.Save(&pkg).Error; err != nil {
			return errors.New("ไม่สามารถแก้ไขแพ็กเกจได้")
		}

		if req.Schedules != nil {
			if err := tx.Where("package_id = ?", pkg.ID).Delete(&models.PackageSchedule{}).Error; err != nil {
				return errors.New("ไม่สามารถเคลียร์ตารางเรียนเดิมได้")
			}

			var newSchedules []models.PackageSchedule
			for _, sch := range *req.Schedules {
				newSchedules = append(newSchedules, models.PackageSchedule{
					PackageID: pkg.ID,
					DayOfWeek: models.DayOfWeek(sch.DayOfWeek),
					StartTime: sch.StartTime,
					EndTime:   sch.EndTime,
				})
			}
			
			if len(newSchedules) > 0 {
				if err := tx.Create(&newSchedules).Error; err != nil {
					return errors.New("ไม่สามารถบันทึกตารางเรียนใหม่ได้")
				}
			}
			pkg.Schedules = newSchedules // อัปเดตตัวแปรเพื่อส่งกลับไปให้ Controller
		}
		return nil
	})

	if err != nil {
		return nil, err
	}

	return &pkg, nil
}

// [DELETE] ลบแพ็กเกจ
func (s *PackageService) DeletePackage(id uint) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("package_id = ?", id).Delete(&models.PackageSchedule{}).Error; err != nil {
			return errors.New("ไม่สามารถลบตารางเรียนที่ผูกกับแพ็กเกจนี้ได้")
		}
		
		if err := tx.Delete(&models.Package{}, id).Error; err != nil {
			return errors.New("ไม่สามารถลบแพ็กเกจได้ หรือแพ็กเกจนี้ถูกใช้งานอยู่")
		}
		return nil
	})
}