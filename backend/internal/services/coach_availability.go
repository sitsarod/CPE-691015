package services

import (
	"errors"
	"fmt"
	"time"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"

	"gorm.io/gorm"
)

// ErrInvalidAvailability ใช้เมื่อชุดเวลาว่างที่ส่งมาไม่ผ่าน validation
// controller ควรแมป error นี้เป็น HTTP 400 (client ส่งข้อมูลผิด ไม่ใช่ระบบพัง)
var ErrInvalidAvailability = errors.New("ข้อมูลเวลาว่างไม่ถูกต้อง")

// ErrAvailabilityConflictsSchedule ใช้เมื่อโค้ชพยายามลบ/แก้เวลาว่างที่มีคาบสอนถูก assign ไว้แล้วในอนาคต
// controller ควรแมปเป็น HTTP 409 (ผิดกฎธุรกิจ — คาบที่ตกลงไว้แล้วห้ามให้หลุดเงียบๆ)
var ErrAvailabilityConflictsSchedule = errors.New("แก้ไขเวลาว่างไม่ได้เพราะชนกับคาบสอนที่ถูกมอบหมายไว้แล้ว")

// isValidDayOfWeek ตรวจว่า day เป็น 1 ใน Monday..Sunday (ตรงกับค่าที่ AssignWorkSchedule ใช้เทียบ)
func isValidDayOfWeek(day string) bool {
	switch models.DayOfWeek(day) {
	case models.Monday, models.Tuesday, models.Wednesday, models.Thursday,
		models.Friday, models.Saturday, models.Sunday:
		return true
	default:
		return false
	}
}

// validateAvailabilities ตรวจความถูกต้องของชุดเวลาว่างก่อนบันทึก:
//   - DayOfWeek ต้องเป็น Monday..Sunday (กันปัญหา match ไม่เจอตอน assign งาน)
//   - เวลาเป็นรูปแบบ HH:MM และ StartTime ต้องน้อยกว่า EndTime
//   - ช่วงเวลาในวันเดียวกันต้องไม่ซ้อนทับกันเอง
func validateAvailabilities(items []dto.AvailabilityDetail) error {
	type slot struct{ start, end int }
	perDay := make(map[string][]slot)

	for i, a := range items {
		if !isValidDayOfWeek(a.DayOfWeek) {
			return fmt.Errorf("%w: รายการที่ %d day_of_week ไม่ถูกต้อง (%q) ต้องเป็น Monday ถึง Sunday", ErrInvalidAvailability, i+1, a.DayOfWeek)
		}

		start, err := timeToMinutesWS(a.StartTime)
		if err != nil {
			return fmt.Errorf("%w: รายการที่ %d start_time %v", ErrInvalidAvailability, i+1, err)
		}
		end, err := timeToMinutesWS(a.EndTime)
		if err != nil {
			return fmt.Errorf("%w: รายการที่ %d end_time %v", ErrInvalidAvailability, i+1, err)
		}
		if start >= end {
			return fmt.Errorf("%w: รายการที่ %d start_time ต้องน้อยกว่า end_time (%s-%s)", ErrInvalidAvailability, i+1, a.StartTime, a.EndTime)
		}

		// เช็คซ้อนทับกับช่วงอื่นในวันเดียวกัน (ซ้อนกันเมื่อ start < end อีกช่วง และ start อีกช่วง < end)
		for _, prev := range perDay[a.DayOfWeek] {
			if start < prev.end && prev.start < end {
				return fmt.Errorf("%w: ช่วงเวลาในวัน %s ซ้อนทับกันเอง", ErrInvalidAvailability, a.DayOfWeek)
			}
		}
		perDay[a.DayOfWeek] = append(perDay[a.DayOfWeek], slot{start: start, end: end})
	}
	return nil
}

type CoachAvailabilityService struct {
	db *gorm.DB
}

// NewCoachAvailabilityService creates a new instance of CoachAvailabilityService
func NewCoachAvailabilityService(db *gorm.DB) *CoachAvailabilityService {
	return &CoachAvailabilityService{db: db}
}

// GetAll ดึงเวลาว่างของโค้ชทุกคนในครั้งเดียว (query เดียว) — ใช้ในหน้า admin จัดตารางสอน
// เพื่อเลี่ยงการยิงทีละโค้ช (N+1) frontend จะ group ตาม coach_id เอง
func (s *CoachAvailabilityService) GetAll() ([]models.CoachAvailability, error) {
	var all []models.CoachAvailability
	err := s.db.Find(&all).Error
	return all, err
}

// GetByCoachID ดึงตารางเวลาว่างทั้งหมดของ coach คนหนึ่ง (ใช้แสดงหน้า "ตารางเวลาว่าง" ของ coach)
// coach ดูได้เฉพาะของตัวเอง, admin ดูได้ทุกคน
func (s *CoachAvailabilityService) GetByCoachID(coachID uint, userID uint, role string) ([]models.CoachAvailability, error) {
	if err := VerifyCoachOwnership(s.db, coachID, userID, role); err != nil {
		return nil, err
	}

	var availabilities []models.CoachAvailability
	err := s.db.Where("coach_id = ?", coachID).Find(&availabilities).Error
	return availabilities, err
}

// UpdateAvailability แทนที่ตารางเวลาว่างทั้งหมดของ coach ด้วยชุดใหม่ที่ส่งมา
// (ตาม flow ที่อธิบายไว้: "โค้ชกดยืนยันตารางเวลาว่างทั้งหมดเข้ามา" ทีเดียว ไม่ใช่ทีละช่วง
// จึงลบของเก่าทิ้งแล้วสร้างใหม่ทั้งหมดใน transaction เดียว ป้องกันข้อมูลค้างถ้าทำแค่ครึ่งเดียว)
func (s *CoachAvailabilityService) UpdateAvailability(coachID uint, userID uint, role string, req dto.UpdateCoachAvailabilityRequest) ([]models.CoachAvailability, error) {
	// กัน IDOR + business rule: วันเวลาว่างเป็นของโค้ชเจ้าของเท่านั้น
	// coach คนอื่นแก้ไม่ได้ และ admin ก็แก้ไม่ได้ (VerifyCoachSelf จะปฏิเสธ admin ด้วย)
	if err := VerifyCoachSelf(s.db, coachID, userID, role); err != nil {
		return nil, err
	}

	// ตรวจความถูกต้องของเวลา/วันก่อนแตะ DB (กันข้อมูลขยะที่ทำให้ assign งานพลาด)
	if err := validateAvailabilities(req.Availabilities); err != nil {
		return nil, err
	}

	// กันเคสโค้ชลบ/แก้เวลาว่างที่มีคาบสอนถูก assign ไว้แล้วในอนาคต (คาบที่ตกลงไว้ห้ามหลุดเงียบๆ)
	if err := s.ensureNoScheduleConflict(coachID, req.Availabilities); err != nil {
		return nil, err
	}

	var result []models.CoachAvailability

	err := s.db.Transaction(func(tx *gorm.DB) error {
		// 1. ลบเวลาว่างเดิมของ coach คนนี้ทั้งหมด
		if err := tx.Where("coach_id = ?", coachID).Delete(&models.CoachAvailability{}).Error; err != nil {
			return err
		}

		// 2. สร้างชุดใหม่ตามที่ส่งมา
		newAvailabilities := make([]models.CoachAvailability, 0, len(req.Availabilities))
		for _, a := range req.Availabilities {
			newAvailabilities = append(newAvailabilities, models.CoachAvailability{
				CoachID:   coachID,
				DayOfWeek: models.DayOfWeek(a.DayOfWeek), // แปลง string -> custom type DayOfWeek
				StartTime: normalizeClockTime(a.StartTime),
				EndTime:   normalizeClockTime(a.EndTime),
			})
		}

		if len(newAvailabilities) > 0 {
			if err := tx.Create(&newAvailabilities).Error; err != nil {
				return err
			}
		}

		result = newAvailabilities
		return nil
	})

	if err != nil {
		return nil, err
	}
	return result, nil
}

// ─── หมายเหตุ: เคยมี DeleteAll(coachID) อยู่ตรงนี้ ถูกลบออกแล้ว ───
//
// มันไม่เคยถูก wire เข้า router เลย และ "ไม่มี ownership check"
// ถ้าวันหนึ่งมีคนเห็นแล้วต่อ route ให้ จะกลายเป็นช่องโหว่ IDOR ทันที
// (โค้ชคนไหนก็ล้างตารางของคนอื่นได้ด้วยการเปลี่ยนเลข id)
//
// การล้างเวลาว่างทั้งหมดทำได้ผ่าน UpdateAvailability ด้วยรายการว่างอยู่แล้ว
// ซึ่งเดินผ่าน VerifyCoachSelf และ ensureNoScheduleConflict ครบทุกด่าน

// ensureNoScheduleConflict ตรวจว่าเวลาว่างชุดใหม่ยังคลุมคาบสอนที่ถูก assign ไว้แล้วในอนาคตครบทุกคาบ
// ถ้ามีคาบไหนหลุดออกนอกเวลาว่างใหม่ จะคืน ErrAvailabilityConflictsSchedule (บล็อกการบันทึก)
//
// ─── สองเงื่อนไขที่ต้องยกเว้น ───
//
//  1. คาบฉุกเฉิน (is_emergency = true) คือคาบที่ถูกสร้างขึ้น "นอกเวลาว่างโดยตั้งใจ"
//     ทั้งจากแอดมินติ๊กฉุกเฉินเอง และจากระบบสร้างให้ตอนโค้ชสแกนเช็คชื่อคาบที่ไม่มีในตาราง
//     (ดู ensureCoachWorkSchedule — สร้างโดยไม่ตรวจอะไรเลย)
//
//     ถ้าไม่ยกเว้น จะเกิดวงจรที่โค้ชออกเองไม่ได้: สแกนเช็คชื่อหน้างานครั้งเดียว
//     → ระบบสร้างคาบฉุกเฉินในอนาคตให้ → เวลาว่างชุดใหม่ไม่คลุมคาบนั้น (เพราะมันอยู่นอกเวลาว่าง
//     ตั้งแต่แรก) → โค้ชแก้เวลาว่างตัวเองไม่ได้เลยจนกว่าจะเลยวันนั้น โดยได้ error
//     ว่า "กรุณาติดต่อแอดมิน" ทั้งที่ไม่ได้ทำอะไรผิด
//
//  2. คาบของวันนี้ที่สอนจบไปแล้ว — เดิมใช้ date >= today ซึ่งเหมารวมคาบเช้าที่จบตอนเที่ยง
//     การแก้เวลาว่างตอนเย็นจึงยังติดคาบนั้นอยู่ ทั้งที่ไม่มีอะไรให้กระทบแล้ว
func (s *CoachAvailabilityService) ensureNoScheduleConflict(coachID uint, avails []dto.AvailabilityDetail) error {
	now := time.Now().In(appLocation())
	today := now.Format("2006-01-02")
	nowClock := now.Format("15:04")

	var futureWS []models.WorkSchedule
	if err := s.db.
		Where("coach_id = ? AND is_emergency = ?", coachID, false).
		Where("(date > ? OR (date = ? AND end_time > ?))", today, today, nowClock).
		Find(&futureWS).Error; err != nil {
		return err
	}
	if len(futureWS) == 0 {
		return nil
	}

	// สร้าง map: ชื่อวัน -> ช่วงเวลาว่างใหม่ (เป็นนาที)
	type window struct{ start, end int }
	byDay := make(map[string][]window)
	for _, a := range avails {
		st, err := timeToMinutesWS(a.StartTime)
		if err != nil {
			continue
		}
		en, err := timeToMinutesWS(a.EndTime)
		if err != nil {
			continue
		}
		byDay[a.DayOfWeek] = append(byDay[a.DayOfWeek], window{start: st, end: en})
	}

	for _, w := range futureWS {
		datePart := w.Date
		if len(datePart) >= 10 {
			datePart = datePart[:10] // ตัดส่วน T00:00:00Z ถ้ามี
		}
		d, err := time.Parse("2006-01-02", datePart)
		if err != nil {
			continue
		}
		dayName := d.Weekday().String()

		ws, err1 := timeToMinutesWS(w.StartTime)
		we, err2 := timeToMinutesWS(w.EndTime)
		if err1 != nil || err2 != nil {
			continue
		}

		covered := false
		for _, win := range byDay[dayName] {
			if ws >= win.start && we <= win.end {
				covered = true
				break
			}
		}
		if !covered {
			return fmt.Errorf("%w: มีคาบสอนที่มอบหมายไว้วันที่ %s เวลา %s-%s ซึ่งอยู่นอกเวลาว่างใหม่ กรุณาติดต่อแอดมินก่อนแก้ไข",
				ErrAvailabilityConflictsSchedule, datePart, w.StartTime, w.EndTime)
		}
	}
	return nil
}
