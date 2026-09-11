package services

import (
	"errors"
	"fmt"

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

var (
	ErrInvalidDuration        = errors.New("ระยะเวลาของแพ็กเกจต้องอยู่ระหว่าง 1 ถึง 366 วัน")
	ErrPackageScheduleInvalid = errors.New("ตารางเรียนไม่ถูกต้อง")

	ErrPackageHasActiveEnrollments = errors.New("ไม่สามารถลบแพ็กเกจนี้ได้ เนื่องจากยังมีนักเรียนลงทะเบียนอยู่ กรุณายกเลิกการลงทะเบียนที่ค้างก่อน")

	ErrMaxSeatsBelowEnrolled = errors.New("จำนวนที่นั่งสูงสุดน้อยกว่าจำนวนนักเรียนที่รับไปแล้ว")
)

// validatePackageSchedules ตรวจตารางเรียนก่อนบันทึก
func validatePackageSchedules(schedules []dto.PackageScheduleReq) error {
	seen := make(map[string]bool, len(schedules))

	for _, sch := range schedules {
		start, err := timeToMinutesWS(sch.StartTime)
		if err != nil {
			return fmt.Errorf("%w: เวลาเริ่ม %q ต้องเป็นรูปแบบ HH:MM", ErrPackageScheduleInvalid, sch.StartTime)
		}

		end, err := timeToMinutesWS(sch.EndTime)
		if err != nil {
			return fmt.Errorf("%w: เวลาจบ %q ต้องเป็นรูปแบบ HH:MM", ErrPackageScheduleInvalid, sch.EndTime)
		}

		if end <= start {
			return fmt.Errorf("%w: คาบ %s %s–%s เวลาจบต้องอยู่หลังเวลาเริ่ม (คาบข้ามเที่ยงคืนยังไม่รองรับ)",
				ErrPackageScheduleInvalid, sch.DayOfWeek, sch.StartTime, sch.EndTime)
		}

		key := sch.DayOfWeek + " " + sch.StartTime
		if seen[key] {
			return fmt.Errorf("%w: มีคาบ %s %s ซ้ำกันสองแถว",
				ErrPackageScheduleInvalid, sch.DayOfWeek, sch.StartTime)
		}
		seen[key] = true
	}

	return nil
}

const maxPackageDurationDays = 366

func resolvePackageDuration(days uint) (uint, error) {
	if days == 0 {
		return defaultEnrollmentDurationDays, nil
	}
	if days > maxPackageDurationDays {
		return 0, ErrInvalidDuration
	}
	return days, nil
}

// [CREATE] สร้างแพ็กเกจใหม่ พร้อมตารางเรียนหลายวัน
func (s *PackageService) CreatePackage(req dto.CreatePackageReq) (*models.Package, error) {
	if err := validatePackageSchedules(req.Schedules); err != nil {
		return nil, err
	}

	var schedules []models.PackageSchedule
	for _, sch := range req.Schedules {
		schedules = append(schedules, models.PackageSchedule{
			DayOfWeek: models.DayOfWeek(sch.DayOfWeek),
			StartTime: sch.StartTime,
			EndTime:   sch.EndTime,
		})
	}

	durationDays, err := resolvePackageDuration(req.DurationDays)
	if err != nil {
		return nil, err
	}

	newPkg := models.Package{
		CourseID:      req.CourseID,
		SessionsCount: req.SessionsCount,
		HoursCount:    req.HoursCount,
		Price:         req.Price,
		MaxSeats:      req.MaxSeats,
		DurationDays:  durationDays,
		Schedules:     schedules,
	}

	if err := s.db.Create(&newPkg).Error; err != nil {
		return nil, errors.New("ไม่สามารถสร้างแพ็กเกจและตารางเรียนได้")
	}
	return &newPkg, nil
}

// [UPDATE] แก้ไขแพ็กเกจและตารางเวลา
func (s *PackageService) UpdatePackage(id uint, req dto.UpdatePackageReq) (*models.Package, error) {
	if req.Schedules != nil {
		if err := validatePackageSchedules(*req.Schedules); err != nil {
			return nil, err
		}
	}

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
		if req.MaxSeats != nil {
			taken, err := seatsTaken(tx, pkg.ID)
			if err != nil {
				return err
			}
			if taken > *req.MaxSeats {
				return fmt.Errorf("%w (ตอนนี้รับไปแล้ว %d คน)", ErrMaxSeatsBelowEnrolled, taken)
			}
			pkg.MaxSeats = *req.MaxSeats
		}
		if req.Price != nil {
			pkg.Price = *req.Price
		}
		if req.DurationDays != nil {
			if *req.DurationDays == 0 || *req.DurationDays > maxPackageDurationDays {
				return ErrInvalidDuration
			}
			pkg.DurationDays = *req.DurationDays
		}

		if err := tx.Save(&pkg).Error; err != nil {
			return errors.New("ไม่สามารถแก้ไขแพ็กเกจได้")
		}

		if req.Schedules != nil {
			if err := tx.Where("package_id = ?", pkg.ID).Delete(&models.PackageSchedule{}).Error; err != nil {
				return errors.New("ไม่สามารถเคลียร์ตารางเรียนเดิมได้")
			}

			// ตารางงานโค้ชที่อ้าง id เดิมอยู่ต้องล้างทิ้ง ไม่ใช่ปล่อยให้ชี้ไปที่แถวที่ไม่มีแล้ว
			if err := tx.Model(&models.WorkSchedule{}).
				Where("package_id = ?", pkg.ID).
				Update("package_schedule_id", gorm.Expr("NULL")).Error; err != nil {
				return errors.New("ไม่สามารถล้างการอ้างอิงตารางเรียนเดิมได้")
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
//
// ⚠️ ด่านกันนักเรียนค้างต้องอยู่ที่นี่ ไม่ใช่แค่ที่ DeleteCourse
// ลบทีละแพ็กเกจจนหมดคือทางอ้อมที่ข้ามด่านระดับคอร์สไปได้ทั้งดุ้น
// และ FK constraint ช่วยไม่ได้เพราะ soft delete ยิง UPDATE ไม่ใช่ DELETE
func (s *PackageService) DeletePackage(id uint) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		taken, err := packagesHaveEnrollments(tx, []uint{id})
		if err != nil {
			return err
		}
		if taken {
			return ErrPackageHasActiveEnrollments
		}

		if err := tx.Where("package_id = ?", id).Delete(&models.PackageSchedule{}).Error; err != nil {
			return errors.New("ไม่สามารถลบตารางเรียนที่ผูกกับแพ็กเกจนี้ได้")
		}

		if err := tx.Delete(&models.Package{}, id).Error; err != nil {
			return errors.New("ไม่สามารถลบแพ็กเกจได้ หรือแพ็กเกจนี้ถูกใช้งานอยู่")
		}
		return nil
	})
}
