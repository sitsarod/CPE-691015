package services

import (
	"errors"
	"fmt"
	"log"
	"sort"
	"strconv"
	"strings"
	"time"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"

	"gorm.io/gorm"
)

// weekdayOffset แปลงชื่อวันเป็นจำนวนวันนับจากวันอาทิตย์ (คอลัมน์แรกของสัปดาห์)
var weekdayOffset = map[string]int{
	"Sunday": 0, "Monday": 1, "Tuesday": 2, "Wednesday": 3,
	"Thursday": 4, "Friday": 5, "Saturday": 6,
}

type WorkScheduleService interface {
	AssignWorkSchedule(req dto.CreateWorkScheduleRequest) (*models.WorkSchedule, error)
	GetAll() ([]models.WorkSchedule, error)
	GetByCoachID(coachID uint, userID uint, role string) ([]models.WorkSchedule, error)
	TaughtSessionDates(coachID uint, userID uint, role string) ([]string, error)
	UnresolvedSessionDates(coachID uint, userID uint, role string) ([]string, error)
	GetByID(id uint) (*models.WorkSchedule, error)
	Update(id uint, req dto.CreateWorkScheduleRequest) (*models.WorkSchedule, error)
	Delete(id uint) error
	GetWeekSessions(weekStart string) ([]dto.WeekSessionResponse, error)
}

type workScheduleService struct {
	db *gorm.DB
}

func NewWorkScheduleService(db *gorm.DB) WorkScheduleService {
	return &workScheduleService{db: db}
}

// Sentinel errors ของตารางงาน — ให้ controller แยก HTTP status ได้ถูกต้อง
//
//	ErrScheduleInvalid  = client ส่งข้อมูลผิดรูปแบบ (400)
//	ErrScheduleConflict = ผิดกฎธุรกิจ เช่น นอกเวลาว่าง/เวลาชน/สนามซ้อน (409)
var (
	ErrScheduleInvalid  = errors.New("ข้อมูลตารางงานไม่ถูกต้อง")
	ErrScheduleConflict = errors.New("ตารางงานขัดแย้งกับข้อมูลที่มีอยู่")
)

// isPastScheduleDate บอกว่าวันของคาบนี้ผ่านไปแล้วหรือยัง ตามเวลาที่สนาม
//
// ⚠️ ต้องใช้ตัวนี้ทุกที่ที่ตัดสินเรื่อง "ย้อนหลัง"
//
// เดิม AssignWorkSchedule ใช้ time.Now().Truncate(24*time.Hour) ซึ่งคิดจากเวลา
// absolute จึงได้เที่ยงคืน UTC ไม่ใช่เที่ยงคืนไทย ผลคือช่วง 00:00-07:00 น. เวลาไทย
// แอดมินมอบหมายคาบของ "เมื่อวาน" ได้ ทั้งที่กฎบอกว่าห้าม
//
// พอมีด่านย้อนหลังเพิ่มที่ Update/Delete ความไม่ตรงกันจะกลายเป็นเรื่องใหญ่ขึ้น
// (คาบที่ Assign ปฏิเสธ แต่ Update ยอมรับ) จึงรวมมาที่ฟังก์ชันเดียว
func isPastScheduleDate(date string) bool {
	d := scheduleDateOnly(date)
	return d != "" && d < localDateString(time.Now())
}

// NormalizeClockTimeColumns แปลงเวลาที่เก็บไว้เดิมให้เป็นรูปแบบมาตรฐาน "HH:MM"
//
// ⚠️ ต้องรันก่อนจะเชื่อผลของการจับคู่คลาสด้วยเวลา
//
// ข้อมูลเดิมมีทั้ง "18:00" และ "18:00:00" ปนกันอยู่ (ดูเหตุผลที่ normalizeClockTime)
// ตราบใดที่ยังปนกัน การเทียบเวลาจะพลาดเป็นบางแถวแบบเดาไม่ได้
//
// เขียนเป็น Go ไม่ใช่ SQL เพราะต้องรองรับทั้งการตัดวินาทีออก ("18:00:00" → "18:00")
// และการเติมศูนย์หน้า ("9:00" → "09:00") ซึ่งเขียนเป็น SQL แล้วอ่านไม่ออก
// จำนวนแถวอยู่ในระดับหลักพัน ไม่ใช่ปริมาณที่ต้องให้ฐานช่วยประมวลผล
//
// อัปเดตเฉพาะแถวที่ค่าเปลี่ยนจริง จึงรันซ้ำได้ปลอดภัยและไม่กวน updated_at เกินจำเป็น
func NormalizeClockTimeColumns(db *gorm.DB) error {
	type target struct {
		table   string
		columns []string
	}

	targets := []target{
		{"work_schedules", []string{"start_time", "end_time"}},
		{"attendance_sessions", []string{"schedule_start_time", "schedule_end_time"}},
		{"package_schedules", []string{"start_time", "end_time"}},
		{"coach_availabilities", []string{"start_time", "end_time"}},
	}

	total := 0
	for _, t := range targets {
		for _, col := range t.columns {
			type row struct {
				ID    uint
				Value string
			}

			var rows []row
			if err := db.Raw(
				fmt.Sprintf("SELECT id, %s AS value FROM %s WHERE %s IS NOT NULL AND %s <> ''",
					col, t.table, col, col),
			).Scan(&rows).Error; err != nil {
				return fmt.Errorf("อ่าน %s.%s ไม่สำเร็จ: %w", t.table, col, err)
			}

			for _, r := range rows {
				normalized := normalizeClockTime(r.Value)
				if normalized == r.Value {
					continue
				}
				if err := db.Exec(
					fmt.Sprintf("UPDATE %s SET %s = ? WHERE id = ?", t.table, col),
					normalized, r.ID,
				).Error; err != nil {
					return fmt.Errorf("แปลง %s.%s แถว %d ไม่สำเร็จ: %w", t.table, col, r.ID, err)
				}
				total++
			}
		}
	}

	if total > 0 {
		log.Printf("[time] แปลงรูปแบบเวลาให้เป็น HH:MM แล้ว %d ค่า", total)
	}
	return nil
}

// NotifyCoachSuspension แจ้งเตือนเมื่อโค้ชถูกพักงานทั้งที่ยังมีคาบสอนในอนาคตค้างอยู่
// คืนรายการคาบที่ต้องหาคนแทน (nil ถ้าไม่มี)
//
// ─── ปัญหาที่ฟังก์ชันนี้แก้ ───
//
// การพักงานโค้ช (status = inactive) บล็อกแค่การ "มอบหมายงานใหม่"
// (ดู validateScheduleSlot ข้อ 0) แต่คาบที่มอบหมายไว้แล้วไม่ถูกแตะเลย
//
// ผลคือ: พักงานวันนี้ → คลาสสัปดาห์หน้ายังโชว์ชื่อโค้ชคนนั้นเป็นคนสอน
// → เขาสแกนเช็คชื่อไม่ได้ (recordCoachAttendance บล็อก inactive)
// → ถูกมาร์คขาดงานตอนปิดรอบ → คลาสไม่มีคนสอนจริง
// โดยไม่มีใครรู้ล่วงหน้า จนถึงวันนั้นแล้วนักเรียนมายืนรอ
//
// ─── ทำไมไม่ลบคาบให้เลย ───
//
// การพักงานเป็นเรื่องชั่วคราว (ป่วย/ลาพัก) ต่างจากการลบบัญชีที่ระบบลบคาบอนาคตให้
// (ดู deleteCoachData) ลบทิ้งจะทำให้แผนการสอนที่วางไว้หายไปด้วย
// และถ้าโค้ชกลับมาทำงานก่อนถึงวันนั้น ก็ต้องมานั่งจัดใหม่ทั้งหมดโดยไม่จำเป็น
//
// ─── ทำไมไม่ห้ามพักงาน ───
//
// การพักงานมักเป็นเรื่องด่วน (โค้ชป่วยกะทันหัน) บังคับให้ต้องไปหาคนแทนให้ครบก่อน
// จะทำให้แอดมินทำสิ่งที่จำเป็นตอนนั้นไม่ได้
//
// จึงเลือกทางที่สาม: ปล่อยให้พักงานได้ แต่ยกคาบที่ค้างขึ้นมาให้เห็นทันที
// พร้อมแจ้งทั้งแอดมินทุกคนและตัวโค้ช — หลักเดียวกับเรื่องคาบที่ไม่มีรอบเช็คชื่อ
// (ดู coach_missed_class.go) คือความเงียบคือส่วนที่แย่ที่สุด ไม่ใช่ตัวปัญหาเอง
func NotifyCoachSuspension(db *gorm.DB, coachID uint) ([]models.WorkSchedule, error) {
	today := localDateString(time.Now())

	var future []models.WorkSchedule
	if err := db.Preload("Course").
		Where("coach_id = ? AND date >= ?", coachID, today).
		Order("date ASC, start_time ASC").
		Find(&future).Error; err != nil {
		return nil, errors.New("ไม่สามารถตรวจคาบสอนในอนาคตของโค้ชได้")
	}
	if len(future) == 0 {
		return nil, nil
	}

	var coach models.Coach
	if err := db.Preload("User").First(&coach, coachID).Error; err != nil {
		return future, nil
	}
	fullName, nickname := coachDisplayName(&coach)
	who := strings.TrimSpace(fullName)
	if who == "" {
		who = nickname
	}
	if who == "" {
		who = fmt.Sprintf("โค้ช #%d", coachID)
	}

	// ยกตัวอย่างคาบแรก ๆ ไว้ในข้อความ ให้แอดมินรู้ว่าต้องรีบจัดการอันไหนก่อน
	preview := make([]string, 0, 3)
	for i, w := range future {
		if i >= 3 {
			break
		}
		preview = append(preview, fmt.Sprintf("%s %s-%s",
			scheduleDateOnly(w.Date), w.StartTime, w.EndTime))
	}
	more := ""
	if len(future) > len(preview) {
		more = fmt.Sprintf(" และอีก %d คาบ", len(future)-len(preview))
	}

	NotifyAdmins(db,
		"coach_suspended_schedules",
		fmt.Sprintf("coach-suspended-%d-%s", coachID, today),
		"โค้ชถูกพักงานแต่ยังมีคาบสอนค้างอยู่",
		fmt.Sprintf("%s ถูกพักงาน แต่ยังมีคาบสอนในอนาคต %d คาบที่ต้องหาคนแทน (%s%s)",
			who, len(future), strings.Join(preview, ", "), more),
		"/admin/coachschedule",
		"warning",
	)

	if coach.UserID != 0 {
		CreateNotification(db, coach.UserID,
			"coach_suspended",
			fmt.Sprintf("coach-suspended-self-%d-%s", coachID, today),
			"บัญชีของคุณถูกพักงาน",
			fmt.Sprintf("คุณถูกพักงานชั่วคราว คาบสอนในอนาคต %d คาบจะถูกจัดให้คนอื่นแทน "+
				"ระหว่างนี้จะเช็คชื่อเข้าสอนไม่ได้ หากไม่ถูกต้องกรุณาติดต่อแอดมิน", len(future)),
			"/coach/schedule",
			"warning",
		)
	}

	return future, nil
}

// validateScheduleSlot ตรวจว่า slot ที่จะบันทึก/แก้ไขถูกต้องตามกฎทั้งหมด:
//   - วันที่รูปแบบ YYYY-MM-DD และเวลา HH:MM (start < end)
//   - อยู่ในช่วงเวลาว่างของโค้ชในวันนั้น
//   - ไม่ชนกับคาบอื่นของโค้ชคนเดียวกันในวันเดียวกัน
//   - สนาม (court) เดียวกันในวัน/เวลาเดียวกันต้องไม่ถูกใช้โดยคาบอื่น (แม้เป็นโค้ชคนอื่น)
//
// excludeID = 0 สำหรับสร้างใหม่, = schedule.ID สำหรับแก้ไข (จะข้าม record ตัวเองตอนเช็คการชน)
// รับ tx เข้ามาเพื่อให้ทำงานภายใต้ transaction เดียวกับการเขียนข้อมูล
func (s *workScheduleService) validateScheduleSlot(tx *gorm.DB, req dto.CreateWorkScheduleRequest, excludeID uint) error {
	parsedDate, err := time.Parse("2006-01-02", req.Date)
	if err != nil {
		return fmt.Errorf("%w: รูปแบบวันที่ต้องเป็น YYYY-MM-DD", ErrScheduleInvalid)
	}
	dayOfWeekStr := parsedDate.Weekday().String() // "Monday", "Tuesday", ...

	reqStart, err := timeToMinutesWS(req.StartTime)
	if err != nil {
		return fmt.Errorf("%w: start_time %v", ErrScheduleInvalid, err)
	}
	reqEnd, err := timeToMinutesWS(req.EndTime)
	if err != nil {
		return fmt.Errorf("%w: end_time %v", ErrScheduleInvalid, err)
	}
	if reqStart >= reqEnd {
		return fmt.Errorf("%w: start_time ต้องน้อยกว่า end_time", ErrScheduleInvalid)
	}

	// 0) โค้ชที่ถูกพักงาน (status = inactive) มอบหมายงานไม่ได้ (บล็อกแม้โหมดฉุกเฉิน)
	var coach models.Coach
	if err := tx.Select("status").First(&coach, req.CoachID).Error; err != nil {
		return err
	}
	if coach.Status == coachStatusInactive {
		return fmt.Errorf("%w: โค้ชคนนี้ถูกพักงาน (inactive) จึงมอบหมายงานไม่ได้", ErrScheduleConflict)
	}

	// 1) ต้องอยู่ในช่วงเวลาว่างของโค้ชในวันนั้น
	// ยกเว้นกรณีฉุกเฉิน (IgnoreAvailability = true) ที่แอดมินยืนยันจะ assign แม้โค้ชไม่ว่าง
	// แต่ยังคงเช็คเวลาชน/สนามซ้อนด้านล่างเสมอ (ห้ามข้าม เพราะ double-booking เป็น error จริง)
	if !req.IgnoreAvailability {
		var availabilities []models.CoachAvailability
		if err := tx.Where("coach_id = ? AND day_of_week = ?", req.CoachID, dayOfWeekStr).Find(&availabilities).Error; err != nil {
			return err
		}
		if len(availabilities) == 0 {
			return fmt.Errorf("%w: โค้ชไม่ได้ตั้งเวลาว่างไว้ในวัน %s", ErrScheduleConflict, dayOfWeekStr)
		}
		isAvailable := false
		for _, a := range availabilities {
			as, err1 := timeToMinutesWS(a.StartTime)
			ae, err2 := timeToMinutesWS(a.EndTime)
			if err1 != nil || err2 != nil {
				continue
			}
			if reqStart >= as && reqEnd <= ae {
				isAvailable = true
				break
			}
		}
		if !isAvailable {
			return fmt.Errorf("%w: เวลาที่จะมอบหมายอยู่นอกช่วงเวลาว่างของโค้ช", ErrScheduleConflict)
		}
	}

	// 2) โค้ชคนเดียวกันต้องไม่มีคาบสอนอื่นซ้อนช่วงเวลานี้ในวันเดียวกัน (ยกเว้น record ตัวเอง)
	var coachJobs []models.WorkSchedule
	if err := tx.Where("coach_id = ? AND date = ? AND id <> ?", req.CoachID, req.Date, excludeID).Find(&coachJobs).Error; err != nil {
		return err
	}
	for _, w := range coachJobs {
		ws, _ := timeToMinutesWS(w.StartTime)
		we, _ := timeToMinutesWS(w.EndTime)
		if reqStart < we && ws < reqEnd {
			return fmt.Errorf("%w: โค้ชมีคาบสอนอื่นซ้อนช่วงเวลานี้อยู่แล้ว", ErrScheduleConflict)
		}
	}

	// 3) สนาม (optional): คลาสอื่นใช้สนามเดียวกันในเวลาชนกันไม่ได้ · คลาสเดียวกัน (co-teach) ได้
	//    ตัดสินด้วย court_id · แถวเก่าที่ยังไม่ผูก id เทียบด้วยชื่อที่ normalize แล้ว
	courtID, courtName, err := resolveCourt(tx, req.CourtID, req.CourtNumber)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrScheduleInvalid, err)
	}
	if courtID != nil || normalizeCourtName(courtName) != "" {
		var courtJobs []models.WorkSchedule
		q := tx.Where("date = ? AND id <> ?", req.Date, excludeID)
		if courtID != nil {
			q = q.Where("court_id = ? OR (court_id IS NULL AND COALESCE(court_number, '') <> '')", *courtID)
		} else {
			q = q.Where("COALESCE(court_number, '') <> ''")
		}
		if err := q.Find(&courtJobs).Error; err != nil {
			return err
		}
		for _, w := range courtJobs {
			// แถวที่ผูก id แล้วให้เทียบด้วย id · แถวเก่าที่ยังไม่ผูกให้เทียบด้วยชื่อ
			var same bool
			if courtID != nil && w.CourtID != nil {
				same = *w.CourtID == *courtID
			} else {
				same = normalizeCourtName(w.Courtnumber) == normalizeCourtName(courtName) &&
					normalizeCourtName(courtName) != ""
			}
			if !same {
				continue
			}

			ws, _ := timeToMinutesWS(w.StartTime)
			we, _ := timeToMinutesWS(w.EndTime)
			if reqStart < we && ws < reqEnd {
				sameClass := w.CourseID == req.CourseID && w.StartTime == req.StartTime && w.EndTime == req.EndTime
				if sameClass {
					continue // อนุญาต: โค้ชอีกคนสอนคลาสเดียวกันบนสนามเดียวกัน
				}
				label := courtName
				if label == "" {
					label = req.CourtNumber
				}
				return fmt.Errorf("%w: สนาม %s ถูกใช้งานโดยคลาสอื่นในช่วงเวลานี้แล้ว", ErrScheduleConflict, label)
			}
		}
	}

	return nil
}

func anchorPackageForSlot(db *gorm.DB, req dto.CreateWorkScheduleRequest) *uint {
	d, err := time.Parse("2006-01-02", req.Date)
	if err != nil {
		return nil
	}
	anchor, err := classAnchorPackageID(db, req.CourseID, d.Weekday().String(), req.StartTime, req.EndTime)
	if err != nil {
		return nil
	}
	return anchor
}

// AssignWorkSchedule สร้างตารางงานใหม่ให้ coach หลังผ่าน validation ครบ (ทำในทรานแซกชันเดียว)
func (s *workScheduleService) AssignWorkSchedule(req dto.CreateWorkScheduleRequest) (*models.WorkSchedule, error) {
	// ห้ามมอบหมายคาบที่วันผ่านไปแล้ว (กันย้อนหลัง — เช็คที่ server ด้วย ไม่ใช่แค่ที่ UI)
	if isPastScheduleDate(req.Date) {
		return nil, fmt.Errorf("%w: ไม่สามารถมอบหมายคาบสอนของวันที่ผ่านไปแล้ว", ErrScheduleConflict)
	}

	var work models.WorkSchedule

	err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := s.validateScheduleSlot(tx, req, 0); err != nil {
			return err
		}

		packageID := req.PackageID
		if anchor := anchorPackageForSlot(tx, req); anchor != nil {
			packageID = anchor
		}

		// ⚠️ ห้ามสร้างคาบที่ไม่ผูกกับแพ็กเกจ
		//
		// แถวที่ package_id = NULL ตกเข้า legacyTaughtScope ซึ่ง "จ่ายเงินทันทีที่วันผ่านไป
		// โดยไม่ต้องมีรอบเช็คชื่อ" และเพราะ unresolvedScheduleScope บังคับ package_id IS NOT NULL
		// แถวนั้นจึงไม่โผล่ในรายการคาบค้าง มาร์คขาดงานก็ไม่ได้ (ไม่มีรอบให้ผูก)
		// = ไม่มีทางตัดเงินได้เลย
		//
		// เส้นทาง legacy มีไว้ "อ่านข้อมูลเก่า" ไม่ใช่ช่องให้สร้างข้อมูลแบบนั้นเพิ่มวันนี้
		if packageID == nil {
			return fmt.Errorf("%w: ไม่พบคาบเรียนของคอร์สนี้ในวันและเวลาที่เลือก "+
				"กรุณาตรวจตารางเรียนของแพ็กเกจก่อนมอบหมายงาน", ErrScheduleInvalid)
		}

		// ชื่อสนามเก็บเป็นชื่อ ณ ตอนมอบหมาย คู่กับ id
		courtID, courtName, err := resolveCourt(tx, req.CourtID, req.CourtNumber)
		if err != nil {
			return fmt.Errorf("%w: %v", ErrScheduleInvalid, err)
		}
		if err := ensureCourtUsable(tx, courtID, nil); err != nil {
			return fmt.Errorf("%w: %v", ErrScheduleConflict, err)
		}

		work = models.WorkSchedule{
			Date: req.Date,
			// เก็บรูปแบบมาตรฐานเสมอ ไม่ใช่ตามที่ client ส่งมา (ดู normalizeClockTime)
			StartTime:         normalizeClockTime(req.StartTime),
			EndTime:           normalizeClockTime(req.EndTime),
			Description:       req.Description,
			Courtnumber:       courtName,
			CourtID:           courtID,
			CoachID:           req.CoachID,
			CourseID:          req.CourseID,
			PackageID:         packageID,
			PackageScheduleID: req.PackageScheduleID,
			IsEmergency:       req.IgnoreAvailability,

			// สแนปช็อตเรตตอนมอบหมาย — ปรับค่าจ้างทีหลังต้องไม่ย้อนไปเปลี่ยนคาบนี้
			PayRateSnapshot: coachPayRateSnapshot(tx, req.CoachID),
		}
		return tx.Create(&work).Error
	})

	if err != nil {
		return nil, err
	}

	// แจ้งโค้ชว่าได้รับมอบหมายคาบสอนใหม่ (ใช้ helper ตัวเดียวกับเส้น Update)
	notifyCoachUser(s.db, work.CoachID,
		"work_assigned", fmt.Sprintf("workschedule-%d", work.ID),
		"ได้รับมอบหมายคาบสอนใหม่",
		fmt.Sprintf("วันที่ %s เวลา %s-%s น.",
			scheduleDateOnly(work.Date), work.StartTime, work.EndTime),
		"info")

	return &work, nil
}

// GetAll ดึงตารางงานทั้งหมด (ใช้ในหน้า admin ดูปฏิทินรวมของทุก coach)
func (s *workScheduleService) GetAll() ([]models.WorkSchedule, error) {
	var schedules []models.WorkSchedule
	err := s.db.Preload("Coach").Preload("Course").Find(&schedules).Error
	return schedules, err
}

// GetByCoachID ดึงตารางงานของ coach คนเดียว (ใช้ในหน้า coach ดูตารางสอนของตัวเอง)
// coach ดูได้เฉพาะของตัวเอง, admin ดูได้ทุกคน
func (s *workScheduleService) GetByCoachID(coachID uint, userID uint, role string) ([]models.WorkSchedule, error) {
	if err := VerifyCoachOwnership(s.db, coachID, userID, role); err != nil {
		return nil, err
	}

	var schedules []models.WorkSchedule
	err := s.db.Where("coach_id = ?", coachID).Preload("Course").Find(&schedules).Error
	return schedules, err
}

// TaughtSessionDates คืน "วันที่ของคาบที่สอนจริง" ของโค้ช (รูปแบบ YYYY-MM-DD)
// ใช้คำนวณค่าจ้าง (นับจำนวน) และให้ frontend จัดกลุ่มรายเดือนได้ด้วยเกณฑ์เดียวกันทั้งระบบ
//
// นิยาม "สอนจริง" = คาบสอน (WorkSchedule) ที่มีรอบเช็คชื่อ (AttendanceSession) ของ
// package เดียวกันในวันเดียวกัน รอบนั้น "ปิดแล้ว" (status = closed)
// และโค้ชคนนั้น "ไม่ได้ถูกมาร์คว่าขาดงาน" ในรอบนั้น
// การปิดรอบเช็คชื่อคือหลักฐานว่าคาบนั้นเกิดขึ้นจริง (ไม่ใช่แค่มีตารางในอดีต)
//
// ผลที่ได้:
//   - คาบที่ถูกยกเลิก (ลบตารางทิ้ง = soft delete) ไม่ถูกนับอยู่แล้ว
//   - คาบในอดีตที่ไม่เคยเปิด/ปิดรอบเช็คชื่อ (โค้ชไม่มา/ไม่ได้สอน) ก็ไม่ถูกนับ
//   - คาบที่โค้ชถูกมาร์ค absent ไม่ถูกนับ
//
// ─── เงื่อนไข "ไม่ขาดงาน" ใช้เกณฑ์แบบผ่อนปรน ───
//
// ตัดออกเฉพาะเมื่อ "มีแถว coach_attendances ที่บอกว่า absent ชัดเจน" เท่านั้น
// ไม่ใช่ "ต้องมีแถว present ถึงจะได้เงิน" — สองแบบนี้ต่างกันตรงแถวที่หายไป
//
// เลือกแบบผ่อนปรนเพราะ:
//
//  1. สำหรับข้อมูลใหม่ ให้ผลเหมือนแบบเข้มงวดทุกประการอยู่แล้ว เนื่องจาก
//     markCoachAbsentees สร้างแถว absent ให้โค้ชทุกคนที่มีตารางแต่ไม่ได้สแกน
//     ตอนปิดรอบ และจับคู่ด้วยคีย์ชุดเดียวกับ query นี้ (package_id + date)
//     หลังปิดรอบจึงไม่มีคาบไหนที่ "ไม่มีแถว" หลงเหลือ
//
//  2. แต่กับข้อมูลเก่าที่ปิดรอบไปก่อนระบบเช็คชื่อโค้ชจะมีผลบังคับ ยังไม่มีแถวเลย
//     ถ้าใช้เกณฑ์เข้มงวด คาบเหล่านั้นจะกลายเป็นศูนย์ยกแผง แล้วยอดค่าจ้าง
//     ย้อนหลังทั้งระบบจะเปลี่ยนทันทีที่ deploy โดยไม่มีใครตั้งใจ
//
// สรุปคือ "ไม่มีข้อมูล" ไม่ได้แปลว่า "ขาดงาน" — ต้องมีคนหรือระบบมาร์คไว้จริงเท่านั้น
//
// ⚠️ ถ้าโค้ชมาสอนจริงแต่ลืมสแกน ระบบจะมาร์ค absent ให้ตอนปิดรอบและโค้ชจะไม่ได้เงิน
// ทางแก้คือให้แอดมินแก้สถานะย้อนหลังผ่าน UpdateCoachAttendanceStatus
// (หน้ารอบที่เปิดอยู่ และหน้าประวัติเช็คชื่อ ทั้งสองหน้ามีปุ่มแก้ให้แล้ว)
//
// Fallback สำหรับคาบแบบเก่า (package_id = NULL) ที่จับคู่ attendance ไม่ได้:
// ใช้เกณฑ์เดิม = คาบที่วันสอนผ่านไปแล้ว (date < วันนี้) และยังไม่ถูกลบ
// เพื่อให้คาบเก่าที่สอนไปจริงยังได้ค่าจ้าง (สองเงื่อนไขไม่ทับกัน: NOT NULL vs NULL)
func (s *workScheduleService) TaughtSessionDates(coachID uint, userID uint, role string) ([]string, error) {
	if err := VerifyCoachOwnership(s.db, coachID, userID, role); err != nil {
		return nil, err
	}
	return s.taughtSessionDates(coachID)
}

// taughtScheduleScope จำกัดผลลัพธ์ให้เหลือเฉพาะคาบที่ "นับว่าสอนจริง" ของโค้ชคนหนึ่ง
// (เฉพาะคาบใหม่ที่มี package_id — คาบเก่าใช้เกณฑ์อื่น ดู taughtSessionDates)
//
// แยกออกมาเป็นฟังก์ชันของตัวเองด้วยสองเหตุผล:
//
//  1. นี่คือกติกาที่ตัดสินว่าโค้ชได้เงินกี่คาบ ควรมีที่มาที่เดียวและมีชื่อเรียก
//     ไม่ใช่เงื่อนไขที่ฝังอยู่กลาง query จนคนอ่านไม่ทันสังเกตว่าแตะเงิน
//
//  2. เทสยิงเข้ามาที่นี่ได้ตรง ๆ โดยไม่ต้องผ่าน to_char ซึ่งเป็นฟังก์ชันเฉพาะของ
//     postgres (sqlite ที่ใช้ในเทสไม่มี) ส่วน to_char เป็นแค่การจัดรูปแบบวันที่
//     ไม่ใช่ตรรกะที่ต้องเทส
//
// ─── นิยาม "คลาสเดียวกัน" ต้องตรงกับ classScheduleScope เสมอ ───
//
// จับคู่ตารางงานกับรอบเช็คชื่อด้วย course + วันที่ + เวลาเริ่ม-จบ ไม่ใช่ package_id
// เพราะคอร์สเดียวขายได้หลาย package (8 ครั้ง / 12 ครั้ง) ที่เรียนพร้อมกัน
// package เป็นแค่โควตาจำนวนครั้งของนักเรียน ไม่ใช่ตัวแยกคลาส
//
// ⚠️ เดิมจับคู่ด้วย package_id ซึ่งพังเมื่อ "แพ็กเกจตัวแทน" ของคลาสเปลี่ยน
// ตัวแทนคือแพ็กเกจ id ต่ำสุดที่ยังไม่ถูกลบ (ดู classAnchorPackageID) พอแอดมิน
// เลิกขายแพ็กเกจตัวแทน ตัวแทนจะเลื่อนไปตัวถัดไป แต่ตารางงานที่มอบหมายไว้แล้ว
// ยังชี้ตัวเก่า → จับคู่ไม่เจอ → โค้ชได้เงิน 0 ทั้งที่สอนจริง และไม่มี error ให้เห็น
// (เทส TestPayrollSurvivesAnchorPackageDeletion ตรึงเคสนี้ไว้)
//
// เงื่อนไข OR ท่อนหลังเป็นทางถอยสำหรับรอบเช็คชื่อรุ่นเก่าที่ยังไม่มีสแนปช็อตเวลา
// (schedule_start_time/end_time ว่าง) ซึ่งเทียบเวลาไม่ได้ จึงกลับไปใช้ package_id
//
// ─── ทำไมเป็น EXISTS ไม่ใช่ JOIN ───
//
// คลาสหนึ่งอาจมีรอบเช็คชื่อค้างอยู่มากกว่าหนึ่งรอบในข้อมูลเก่า (ก่อนระบบยุบรอบ
// ให้เหลือรอบเดียวต่อคลาส) ถ้าใช้ JOIN ตารางงานแถวเดียวจะถูกจับคู่หลายครั้ง
// แล้วกลายเป็นนับหลายคาบ = จ่ายเงินหลายเท่า
//
// EXISTS ตอบแค่ว่า "มีรอบที่เข้าเงื่อนไขอยู่ไหม" จำนวนแถวผลลัพธ์จึงเท่ากับ
// จำนวนตารางงานเสมอ ไม่ขึ้นกับว่ามีรอบกี่รอบ — 1 แถวตารางงาน = เงิน 1 หน่วย
//
// ส่วน NOT EXISTS ชั้นในตัดคาบที่โค้ชถูกมาร์คว่าขาดงานออก
// classSessionForScheduleSQL คือ subquery "คลาสของตารางงานแถวนี้ มีรอบเช็คชื่อสถานะที่ระบุอยู่ไหม"
//
// ⚠️ นี่คือนิยาม "คลาสเดียวกัน" ฉบับที่ใช้กับเรื่องเงิน — ต้องมีชุดเดียวในระบบ
//
// ประวัติของไฟล์นี้บอกว่าทุกครั้งที่มีนิยามชุดที่สองเกิดขึ้น จะกลายเป็นบั๊กเรื่องเงินเสมอ
// ข้อ 20: หน้าจัดตารางรวมคลาสแต่หน้าเปิดรอบไม่รวม → จ่าย 2 เท่า
// ข้อ 21: classScheduleScope ใช้ course+เวลา แต่ตัวคิดเงินยังใช้ package_id → จ่าย 0
//
// จึงดึงออกมาเป็นค่าคงที่ให้ทุกฝั่งใช้ร่วมกัน:
//   - taughtScheduleScope     EXISTS(closed)      = คาบนี้เคลียร์แล้วและนับเงินได้
//   - unresolvedScheduleScope NOT EXISTS(closed)  = คาบนี้ยังไม่มีรอบ ค้างอยู่ไม่ได้เงิน
//   - classSessionExists      EXISTS(สถานะที่ถาม) = ด่านตอนกดเคลียร์ย้อนหลัง
//
// ⚠️ ตัวที่สามเพิ่มมาทีหลังเพราะเคยพลาดเรื่องนี้จริง
//
// ตอนแรก assertNoExistingSession เขียนเงื่อนไขของตัวเองขึ้นมาใหม่ (จับคู่ด้วย
// package_id IN แพ็กเกจพี่น้อง) ซึ่ง "กว้างกว่า" ตัวที่ทำรายการ ผลคือคาบที่มีรอบเก่า
// ของแพ็กเกจพี่น้องจะโผล่ในรายการว่าค้าง แต่กดเคลียร์แล้วถูกปฏิเสธว่า
// "มีรอบปิดแล้ว" — ค้างอยู่ตลอดไป กดออกไม่ได้เลย
//
// รับพารามิเตอร์ ? ตัวเดียว = สถานะของรอบที่ต้องการหา
//
// ─── ทำไมต้องจับคู่ "สองทาง" (เวลา หรือ package_id) ───
//
// ทางเดียวไม่พอ เพราะแต่ละทางพังในสถานการณ์ที่อีกทางรอด:
//
//	จับคู่ด้วย package_id เท่านั้น
//	  พังเมื่อ "แพ็กเกจตัวแทน" ของคลาสเปลี่ยน (แอดมินเลิกขายตัวเดิม)
//	  ตารางงานยังชี้ตัวเก่า รอบชี้ตัวใหม่ → จับคู่ไม่เจอ → โค้ชได้เงิน 0 (บั๊กเดิมข้อ 21)
//
//	จับคู่ด้วย course + วัน + เวลา เท่านั้น
//	  พังเมื่อเวลาในตารางงานไม่ตรงกับเวลาของคาบจริง
//	  เช่นคาบเรียน 16:00-20:00 แต่แอดมินมอบหมายโค้ชไว้ 18:00-20:00
//	  → จับคู่ไม่เจอ → โค้ชได้เงิน 0 และคาบค้างในรายการตลอดไป (บั๊กที่ผู้ใช้เจอ)
//
// การรับทั้งสองทางจึงไม่ใช่การ "ผ่อนปรน" แต่เป็นการยอมรับว่าคาบเดียวกัน
// ถูกอ้างถึงได้สองแบบในระบบนี้ และทั้งสองแบบถูกต้องเท่ากัน
//
// ─── ⚠️ ท่อน package_id ต้องมีเงื่อนไข "ไม่กำกวม" กำกับ ───
//
// เคยเขียนท่อนนี้แบบไม่มีเงื่อนไข พร้อมคอมเมนต์ว่า "ปลอดภัยเพราะ 1 แพ็กเกจ
// มีรอบได้วันละ 1 รอบ" — คอมเมนต์นั้น **ผิด และเป็นเหตุผลที่ทำให้เกิดบั๊ก**
//
// ความจริงคือตรงกันข้าม: การที่แพ็กเกจหนึ่งมีรอบได้วันละรอบเดียว แปลว่า
// ถ้าโค้ชมีตารางงานหลายแถวของแพ็กเกจ+วันเดียวกัน (คนละช่วงเวลา)
// **ทุกแถวจะไปเกาะรอบเดียวกันหมด** ผลคือ:
//
//	จ่ายเกิน  — ปิดรอบแค่คาบเช้า แต่คาบบ่ายก็ได้เงินด้วย (พิสูจน์แล้ว: sessions=2)
//	จ่ายขาด  — มาร์คขาดงานคาบเช้า ตัดเงินคาบบ่ายไปด้วย (พิสูจน์แล้ว: sessions=0)
//
// ทั้งสองอาการ "เงียบ" ไม่มี error และไม่โผล่ในรายการคาบค้างให้ใครเห็น
//
// ท่อนนี้จึงเป็น "ทางสำรองสุดท้าย" ที่ใช้ได้เฉพาะเมื่อไม่มีความกำกวม —
// คือโค้ชมีตารางงานของแพ็กเกจ+วันนั้นอยู่แถวเดียว จึงไม่มีข้อสงสัยว่าหมายถึงแถวไหน
// ถ้ามีหลายแถว ต้องให้ท่อนเวลาเป็นตัวตัดสินเท่านั้น แถวที่จับคู่ไม่ได้จะไปโผล่
// ในรายการคาบค้างให้คนเห็น ซึ่งดีกว่าเงียบ
//
// (เทส TestOnePackageTwoSlotsSameDay* ตรึงทั้งสองอาการไว้แล้ว)
const classSessionForScheduleSQL = `
			SELECT 1
			FROM attendance_sessions a
			WHERE a.deleted_at IS NULL
			  AND a.status = ?
			  AND a.session_date = work_schedules.date
			  AND (
			        (
			          COALESCE(a.schedule_start_time, '') <> ''
			          AND COALESCE(a.schedule_end_time, '') <> ''
			          AND a.schedule_start_time = work_schedules.start_time
			          AND a.schedule_end_time   = work_schedules.end_time
			          AND EXISTS (
			                SELECT 1 FROM packages p
			                WHERE p.id = a.package_id
			                  AND p.course_id = work_schedules.course_id
			              )
			        )
			        OR
			        (
			          a.package_id = work_schedules.package_id
			          AND NOT EXISTS (
			                SELECT 1 FROM work_schedules w2
			                WHERE w2.deleted_at IS NULL
			                  AND w2.coach_id   = work_schedules.coach_id
			                  AND w2.package_id = work_schedules.package_id
			                  AND w2.date       = work_schedules.date
			                  AND w2.id        <> work_schedules.id
			              )
			        )
			      )`

func taughtScheduleScope(db *gorm.DB, coachID uint) *gorm.DB {
	return db.Model(&models.WorkSchedule{}).
		Where("work_schedules.coach_id = ? AND work_schedules.package_id IS NOT NULL", coachID).
		Where("EXISTS ("+classSessionForScheduleSQL+`
			  AND NOT EXISTS (
			        SELECT 1 FROM coach_attendances ca
			        WHERE ca.coach_id = work_schedules.coach_id
			          AND ca.attendance_session_id = a.id
			          AND ca.status = ?
			          AND ca.deleted_at IS NULL
			      )
		)`, models.AttendanceSessionClosed, models.AttendanceStatusAbsent)
}

// taughtSessionDates เป็น query จริง (ไม่เช็คสิทธิ์) — ให้ public method ข้างบนเรียกหลังตรวจสิทธิ์แล้ว
// คืนวันที่แบบ YYYY-MM-DD ผ่าน to_char เพื่อกัน format วันที่เพี้ยนจากชนิด time.Time ของ driver
func (s *workScheduleService) taughtSessionDates(coachID uint) ([]string, error) {
	// คาบใหม่ (มี package_id): เอาเฉพาะที่มีรอบเช็คชื่อปิดแล้วจริง และโค้ชไม่ได้ถูกมาร์คว่าขาด
	var attended []string
	if err := taughtScheduleScope(s.db, coachID).
		Pluck("to_char(work_schedules.date, 'YYYY-MM-DD')", &attended).Error; err != nil {
		return nil, err
	}

	// คาบเก่า (package_id = NULL): ใช้วันที่ท้องถิ่นไทยเป็นเส้นแบ่ง "อดีต"
	loc, err := time.LoadLocation("Asia/Bangkok")
	if err != nil {
		loc = time.Local
	}
	todayStr := time.Now().In(loc).Format("2006-01-02")

	var legacy []string
	if err := s.db.Model(&models.WorkSchedule{}).
		Where("coach_id = ? AND package_id IS NULL AND date < ?", coachID, todayStr).
		Pluck("to_char(date, 'YYYY-MM-DD')", &legacy).Error; err != nil {
		return nil, err
	}

	return append(attended, legacy...), nil
}

// UnresolvedSessionDates คืนวันที่ของคาบที่ "สอนไปแล้วแต่ยังไม่มีรอบเช็คชื่อ" ของโค้ชคนหนึ่ง
//
// ⚠️ คู่กับ TaughtSessionDates เสมอ — ตัวนั้นคือคาบที่ได้เงินแล้ว ตัวนี้คือคาบที่ยังไม่ได้
// หน้าเว็บที่แสดงยอดค่าจ้างต้องแสดงตัวนี้ด้วย ไม่งั้นคาบที่ค้างจะหายไปจากสายตา
// ซึ่งคือบั๊กที่ ResolveMissedClass ถูกเขียนขึ้นมาแก้ (ดู coach_missed_class.go)
func (s *workScheduleService) UnresolvedSessionDates(coachID uint, userID uint, role string) ([]string, error) {
	if err := VerifyCoachOwnership(s.db, coachID, userID, role); err != nil {
		return nil, err
	}
	return s.unresolvedSessionDates(coachID)
}

func (s *workScheduleService) unresolvedSessionDates(coachID uint) ([]string, error) {
	loc, err := time.LoadLocation("Asia/Bangkok")
	if err != nil {
		loc = time.Local
	}
	todayStr := time.Now().In(loc).Format("2006-01-02")

	var dates []string
	if err := unresolvedScheduleScope(s.db, todayStr).
		Where("work_schedules.coach_id = ?", coachID).
		Order("work_schedules.date ASC, work_schedules.start_time ASC").
		Pluck("to_char(work_schedules.date, 'YYYY-MM-DD')", &dates).Error; err != nil {
		return nil, err
	}
	return dates, nil
}

// GetByID ดึงตารางงาน 1 รายการ
func (s *workScheduleService) GetByID(id uint) (*models.WorkSchedule, error) {
	var schedule models.WorkSchedule
	err := s.db.Preload("Coach").Preload("Course").First(&schedule, id).Error
	if err != nil {
		return nil, err
	}
	return &schedule, nil
}

// Update แก้ไขตารางงานที่มีอยู่ (เช่น admin เลื่อนเวลา หรือเปลี่ยน court)
// ตรวจ availability/เวลาชน/สนามซ้อน ด้วยกฎเดียวกับตอน assign (ยกเว้น record ตัวเอง) ในทรานแซกชันเดียว
func (s *workScheduleService) Update(id uint, req dto.CreateWorkScheduleRequest) (*models.WorkSchedule, error) {
	var schedule models.WorkSchedule
	var before models.WorkSchedule

	err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.First(&schedule, id).Error; err != nil {
			return err
		}

		if err := guardPastScheduleEdit(&schedule, req); err != nil {
			return err
		}

		if err := s.validateScheduleSlot(tx, req, id); err != nil {
			return err
		}

		before = schedule // สแนปช็อตก่อนแก้ ใช้เทียบว่าต้องแจ้งใครหลัง commit

		courtID, courtName, err := resolveCourt(tx, req.CourtID, req.CourtNumber)
		if err != nil {
			return fmt.Errorf("%w: %v", ErrScheduleInvalid, err)
		}
		if err := ensureCourtUsable(tx, courtID, schedule.CourtID); err != nil {
			return fmt.Errorf("%w: %v", ErrScheduleConflict, err)
		}

		updateData := map[string]interface{}{
			"date":        req.Date,
			"start_time":  normalizeClockTime(req.StartTime),
			"end_time":    normalizeClockTime(req.EndTime),
			"description": req.Description,
			"coach_id":    req.CoachID,
			"course_id":   req.CourseID,
		}

		// สนามเดิม = ไม่แตะชื่อที่เก็บไว้ ไม่งั้นเปลี่ยนชื่อสนามแล้วประวัติคาบเก่าเปลี่ยนตาม
		if !sameCourt(schedule.CourtID, schedule.Courtnumber, courtID, courtName) {
			updateData["court_id"] = courtID
			updateData["court_number"] = courtName
		}

		if anchor := anchorPackageForSlot(tx, req); anchor != nil {
			updateData["package_id"] = *anchor
		}

		// ⚠️ is_emergency เขียนแบบ "ติดแล้วติดเลย" ห้ามเขียนทับด้วย false
		//
		// validateScheduleSlot อ่าน req.IgnoreAvailability ใน Update ด้วย แปลว่าแอดมิน
		// ส่ง ignore_availability: true ผ่าน PATCH เพื่อข้ามการตรวจเวลาว่างได้อยู่แล้ว
		// แต่เดิมแถวนั้นไม่ถูกติดธง = หลักฐานว่า "คาบนี้เคยถูกมอบหมายนอกกฎ" หายไป
		// ซึ่งขัดกับเจตนาที่เขียนไว้ในโมเดลเอง (models/coach_workschedule.go)
		//
		// ไม่เซ็ต false เพราะธงนี้เป็นข้อเท็จจริงทางประวัติศาสตร์ ไม่ใช่สถานะที่รอเคลียร์
		// แอดมินมาเติมเลขสนามทีหลังแล้วธงยังเป็น true อยู่ — ตั้งใจ ไม่ใช่บั๊ก
		if req.IgnoreAvailability {
			updateData["is_emergency"] = true
		}

		// ⚠️ แตะสแนปช็อตเรตเฉพาะตอนเปลี่ยนตัวโค้ชเท่านั้น
		// ถ้าเขียนทับทุกครั้งที่แก้ (เช่น แอดมินมาเติมเลขสนามทีหลัง) เรตปัจจุบัน
		// จะไหลย้อนไปทับคาบเก่า ซึ่งคือบั๊ก "ปรับเรตแล้วอดีตเพี้ยน" ที่เพิ่งแก้ไป
		if schedule.CoachID != req.CoachID {
			updateData["pay_rate_snapshot"] = coachPayRateSnapshot(tx, req.CoachID)
		}

		if err := tx.Model(&schedule).Updates(updateData).Error; err != nil {
			return err
		}

		return tx.First(&schedule, id).Error
	})

	if err != nil {
		return nil, err
	}

	// แจ้งหลัง commit — การแจ้งเตือนล้มเหลวต้องไม่ทำให้การแก้ที่สำเร็จแล้วถูก rollback
	s.notifyScheduleChanged(&before, &schedule)

	return &schedule, nil
}

// notifyScheduleChanged บอกโค้ชที่เกี่ยวข้องว่าตารางงานของเขาเปลี่ยน
//
// ⚠️ AssignWorkSchedule แจ้งเตือนตอนมอบหมายใหม่ แต่ Update ไม่เคยแจ้งใครเลย
// ผลคือแอดมินเปลี่ยนตัวโค้ชหรือเลื่อนเวลาได้เงียบ ๆ — โค้ชคนใหม่ไม่รู้ว่าได้งาน
// โค้ชคนเก่าไม่รู้ว่าถูกถอด แล้วทั้งคู่ก็ไม่มา หรือมาทั้งคู่
//
// แจ้งเฉพาะการเปลี่ยนที่กระทบ "ต้องไปยืนที่ไหน เมื่อไหร่" — เลขสนามกับคำอธิบาย
// ไม่ต้องแจ้ง เพราะแจ้งทุกการแก้จะกลายเป็นเสียงรบกวนจนโค้ชเลิกอ่าน
func (s *workScheduleService) notifyScheduleChanged(before, after *models.WorkSchedule) {
	if before == nil || after == nil || before.ID == 0 {
		return
	}

	slot := fmt.Sprintf("วันที่ %s เวลา %s-%s น.",
		scheduleDateOnly(after.Date), after.StartTime, after.EndTime)

	// เปลี่ยนตัวโค้ช — ต้องบอกทั้งคนใหม่และคนเก่า
	if before.CoachID != after.CoachID {
		notifyCoachUser(s.db, after.CoachID,
			"work_assigned", fmt.Sprintf("workschedule-%d-assigned-%d", after.ID, after.CoachID),
			"ได้รับมอบหมายคาบสอน", slot, "info")

		notifyCoachUser(s.db, before.CoachID,
			"work_unassigned", fmt.Sprintf("workschedule-%d-unassigned-%d", after.ID, before.CoachID),
			"ถูกถอดจากคาบสอน",
			fmt.Sprintf("%s ถูกมอบหมายให้โค้ชคนอื่นแล้ว", slot), "warning")
		return
	}

	moved := scheduleDateOnly(before.Date) != scheduleDateOnly(after.Date) ||
		before.StartTime != after.StartTime ||
		before.EndTime != after.EndTime

	if moved {
		notifyCoachUser(s.db, after.CoachID,
			"work_rescheduled", fmt.Sprintf("workschedule-%d-moved-%s-%s", after.ID,
				scheduleDateOnly(after.Date), after.StartTime),
			"คาบสอนของคุณถูกเปลี่ยนเวลา",
			fmt.Sprintf("จาก วันที่ %s เวลา %s-%s น. เป็น %s",
				scheduleDateOnly(before.Date), before.StartTime, before.EndTime, slot),
			"warning")
	}
}

// notifyCoachUser ส่งแจ้งเตือนถึงโค้ชด้วย coaches.id (แปลงเป็น users.id ให้เอง)
//
// แยกออกมาเพราะทุกจุดที่แจ้งโค้ชต้องทำขั้นตอนเดียวกันนี้ และเคยลืมกันมาแล้ว
// ว่า CoachID ไม่ใช่ users.id (ดูคอมเมนต์ที่ resolveCoachIDByUser)
func notifyCoachUser(db *gorm.DB, coachID uint, ntype, signature, title, body, tone string) {
	if coachID == 0 {
		return
	}
	var coach models.Coach
	if err := db.Select("id", "user_id").First(&coach, coachID).Error; err != nil || coach.UserID == 0 {
		return
	}
	CreateNotification(db, coach.UserID, ntype, signature, title, body, "/coach/schedule", tone)
}

// guardPastScheduleEdit กันการแก้คาบที่ผ่านไปแล้วในทางที่กระทบค่าจ้าง
//
// ─── ทำไมต้องมี ───
//
// 1 แถวใน work_schedules = ค่าจ้าง 1 หน่วย (พร้อมอัตราที่ตรึงไว้ใน pay_rate_snapshot)
// การย้ายวัน/เวลา/ตัวโค้ชของคาบที่ผ่านไปแล้ว จึงเท่ากับเขียนประวัติการทำงานใหม่
// และย้ายเงินจากคนหนึ่งไปอีกคนโดยไม่มีร่องรอย
//
// ─── ทำไมยังให้แก้บางฟิลด์ได้ ───
//
// เลขสนามกับคำอธิบายไม่เกี่ยวกับการคิดเงิน แอดมินต้องแก้ข้อมูลที่พิมพ์ผิดได้
// การล็อกทั้งแถวจะทำให้ข้อมูลผิดค้างอยู่ตลอดไปโดยไม่ได้ปกป้องอะไรเพิ่ม
func guardPastScheduleEdit(current *models.WorkSchedule, req dto.CreateWorkScheduleRequest) error {
	sameDate := scheduleDateOnly(current.Date) == scheduleDateOnly(req.Date)

	// ห้ามย้ายคาบไปเป็นวันในอดีต (กฎเดียวกับ Assign)
	//
	// ⚠️ ต้องยกเว้นกรณีวันไม่เปลี่ยน ไม่ใช่เช็ค req.Date อย่างเดียว
	// คาบที่อยู่ในอดีตแล้วส่ง req.Date เป็นวันเดิมมาด้วยเสมอ ถ้าเช็คแค่ว่า
	// "วันปลายทางเป็นอดีตไหม" จะบล็อกการแก้เลขสนามของคาบเก่าไปด้วย
	// ทั้งที่ไม่ได้ย้ายอะไรเลย (เทส TestUpdatePastWorkScheduleCannotMoveButCanFixCourt
	// จับเคสนี้ไว้ — ตอนแรกผมเขียนพลาดตรงนี้จริง)
	if !sameDate && isPastScheduleDate(req.Date) {
		return fmt.Errorf("%w: ไม่สามารถย้ายคาบสอนไปเป็นวันที่ผ่านไปแล้ว", ErrScheduleConflict)
	}

	if !isPastScheduleDate(current.Date) {
		return nil
	}

	moved := !sameDate ||
		current.StartTime != req.StartTime ||
		current.EndTime != req.EndTime ||
		current.CoachID != req.CoachID ||
		current.CourseID != req.CourseID

	if moved {
		return fmt.Errorf("%w: คาบสอนที่ผ่านไปแล้วแก้วัน เวลา คอร์ส หรือตัวโค้ชไม่ได้ "+
			"เพราะเป็นบันทึกที่ใช้คิดค่าจ้าง (แก้เลขสนามหรือคำอธิบายได้) "+
			"ถ้าโค้ชไม่ได้มาสอนคาบนี้ ให้แก้สถานะเป็นไม่ได้มาสอนในหน้าประวัติเช็คชื่อแทน",
			ErrScheduleConflict)
	}
	return nil
}

// Delete ลบตารางงาน (เช่น admin ยกเลิกคาบสอน)
//
// ⚠️ ลบได้เฉพาะคาบที่ยังไม่ถึง
//
// คาบที่ผ่านไปแล้วคือบันทึกการทำงานที่ใช้คิดค่าจ้าง การลบทำให้ยอดที่ควรได้ลดลง
// เงียบ ๆ และถ้าจ่ายไปแล้ว ส่วนที่จ่ายเกินจะถูกกลืนหายไป (ยอดค้างถูก clamp ที่ 0)
//
// ลายเซ็นเดียวกับบั๊กปุ่มลบโค้ชที่ทำลายประวัติค่าจ้างถาวร ต่างกันแค่ระดับ
//
// เคสจริงที่คนอยากลบคาบเก่าคือ "โค้ชไม่ได้มาสอน" ซึ่งมีทางที่ถูกอยู่แล้ว —
// แก้สถานะเช็คชื่อเป็น absent คาบนั้นจะไม่ถูกนับเงินโดยที่ประวัติยังอยู่
func (s *workScheduleService) Delete(id uint) error {
	var schedule models.WorkSchedule
	if err := s.db.First(&schedule, id).Error; err != nil {
		return err
	}

	if isPastScheduleDate(schedule.Date) {
		return fmt.Errorf("%w: คาบสอนที่ผ่านไปแล้วลบไม่ได้ เพราะเป็นบันทึกที่ใช้คิดค่าจ้าง "+
			"ถ้าโค้ชไม่ได้มาสอนคาบนี้ ให้แก้สถานะเป็นไม่ได้มาสอนในหน้าประวัติเช็คชื่อแทน",
			ErrScheduleConflict)
	}

	if err := s.db.Delete(&schedule).Error; err != nil {
		return err
	}

	// คาบที่หายไปจากตารางต้องไม่หายเงียบ ๆ โค้ชวางแผนวันนั้นไว้แล้ว
	notifyCoachUser(s.db, schedule.CoachID,
		"work_cancelled", fmt.Sprintf("workschedule-%d-cancelled", schedule.ID),
		"คาบสอนถูกยกเลิก",
		fmt.Sprintf("วันที่ %s เวลา %s-%s น. ถูกยกเลิกแล้ว",
			scheduleDateOnly(schedule.Date), schedule.StartTime, schedule.EndTime),
		"warning")

	return nil
}

// GetWeekSessions คืนคาบเรียนของทุก package ในสัปดาห์ที่เลือก (session-centric)
// แสดงเฉพาะ package ที่มี enrollment สถานะ active และช่วงสิทธิ์เรียนคลุมสัปดาห์นั้น
// พร้อมรายชื่อโค้ชที่ถูก assign ให้แต่ละคาบไปแล้ว (ถ้ามี)
func (s *workScheduleService) GetWeekSessions(weekStart string) ([]dto.WeekSessionResponse, error) {
	start, err := time.Parse("2006-01-02", weekStart)
	if err != nil {
		return nil, fmt.Errorf("%w: week_start ต้องเป็น YYYY-MM-DD", ErrScheduleInvalid)
	}

	// ⚠️ ทั้งฟังก์ชันคิดจากสมมติฐานว่า start คือวันอาทิตย์ (ดู weekdayOffset ที่ Sunday = 0)
	// แล้วบวก offset ไปหาวันอื่น ถ้ารับวันจันทร์มา ตารางทั้งสัปดาห์จะเลื่อนไป 1 วัน
	// โดยไม่มี error ให้ใครเห็น — คาบวันอาทิตย์ไปโผล่วันจันทร์
	//
	// ตอนนี้หน้าเว็บส่งถูก แต่กฎที่ถูกบังคับด้วย "ผู้เรียกจำไว้เอง" ไม่ใช่กฎ
	if start.Weekday() != time.Sunday {
		return nil, fmt.Errorf("%w: week_start ต้องเป็นวันอาทิตย์ (ได้ %s)",
			ErrScheduleInvalid, start.Weekday())
	}
	start = time.Date(start.Year(), start.Month(), start.Day(), 0, 0, 0, 0, time.UTC)
	weekEnd := start.AddDate(0, 0, 7).Add(-time.Second) // ถึงสิ้นวันเสาร์

	// 1) enrollment ที่ active และช่วงสิทธิ์คลุมสัปดาห์นี้
	var enrollments []models.Enrollment
	if err := s.db.
		Where("status = ? AND started_at IS NOT NULL AND started_at <= ? AND (expires_at IS NULL OR expires_at >= ?)",
			models.EnrollmentStatusActive, weekEnd, start).
		Find(&enrollments).Error; err != nil {
		return nil, err
	}
	if len(enrollments) == 0 {
		return []dto.WeekSessionResponse{}, nil
	}

	pkgIDSet := make(map[uint]bool)
	for _, e := range enrollments {
		pkgIDSet[e.PackageID] = true
	}
	pkgIDs := make([]uint, 0, len(pkgIDSet))
	for id := range pkgIDSet {
		pkgIDs = append(pkgIDs, id)
	}

	// 2) โหลด package พร้อมตารางเรียนและคอร์ส
	var packages []models.Package
	if err := s.db.Preload("Schedules").Preload("Course").Where("id IN ?", pkgIDs).Find(&packages).Error; err != nil {
		return nil, err
	}

	// 2.1) เตรียมนับจำนวนนักเรียน: จับ enrollment เข้าตาม package
	//      + โหลด "ยืนยันมาเรียน" (ClassConfirmation going) ของทั้งสัปดาห์ทีเดียว กัน N+1
	enrollmentsByPackage := make(map[uint][]*models.Enrollment)
	enrollmentIDs := make([]uint, 0, len(enrollments))
	for i := range enrollments {
		e := &enrollments[i]
		enrollmentsByPackage[e.PackageID] = append(enrollmentsByPackage[e.PackageID], e)
		enrollmentIDs = append(enrollmentIDs, e.ID)
	}

	goingSet := make(map[confirmKey]bool)
	if len(enrollmentIDs) > 0 {
		var confs []models.ClassConfirmation
		if err := s.db.
			Where("enrollment_id IN ? AND status = ? AND class_date >= ? AND class_date <= ?",
				enrollmentIDs, models.ClassConfirmationGoing, start, weekEnd).
			Find(&confs).Error; err != nil {
			return nil, err
		}
		for _, c := range confs {
			goingSet[keyOf(c.EnrollmentID, sessionDateValue(c.ClassDate), c.ScheduleStartTime)] = true
		}
	}

	// 3) รวมคาบเป็น "คลาส" ตาม course + วันที่ + เวลาเริ่ม-จบ
	//    package เป็นแค่โควตาจำนวนครั้งที่นักเรียนมาเรียนได้ ไม่ใช่ตัวแยกคลาส
	//    ดังนั้นหลาย package ของคอร์สเดียวกันที่เรียนวัน-เวลาเดียวกัน = คลาสเดียว การ์ดเดียว
	type classKey struct {
		courseID uint
		date     string
		start    string
		end      string
	}
	classMap := make(map[classKey]*dto.WeekSessionResponse)

	for _, pkg := range packages {
		courseName := ""
		courseID := pkg.CourseID
		if pkg.Course != nil {
			courseName = pkg.Course.CourseName
			courseID = pkg.Course.ID
		}

		for _, sch := range pkg.Schedules {
			off, ok := weekdayOffset[string(sch.DayOfWeek)]
			if !ok {
				continue
			}
			classDate := sessionDateValue(start.AddDate(0, 0, off))
			dateStr := classDate.Format("2006-01-02")
			key := classKey{courseID: courseID, date: dateStr, start: sch.StartTime, end: sch.EndTime}
			entry, exists := classMap[key]
			if !exists {
				entry = &dto.WeekSessionResponse{
					PackageID:         pkg.ID, // แค่ตัวแทน (มีหลาย package ในคลาสเดียว)
					PackageScheduleID: sch.ID, // แค่ตัวแทน
					CourseID:          courseID,
					CourseName:        courseName,
					Date:              dateStr,
					DayOfWeek:         string(sch.DayOfWeek),
					StartTime:         sch.StartTime,
					EndTime:           sch.EndTime,
				}
				classMap[key] = entry
			}

			// นับนักเรียนของ package นี้เข้า "คลาส" — หลาย package ของคอร์ส/เวลาเดียวกัน
			// ใช้คีย์เดียวกัน ยอดจึงบวกรวมข้าม package ให้อัตโนมัติตามที่ต้องการ
			for _, e := range enrollmentsByPackage[pkg.ID] {
				if !canAttend(e, classDate) {
					continue
				}
				entry.TotalCount++
				if goingSet[keyOf(e.ID, classDate, sch.StartTime)] {
					entry.GoingCount++
				}
			}
		}
	}

	// 4) ดึงโค้ชที่ถูก assign ให้แต่ละคลาส (match ด้วย course + วันที่ + เวลา ไม่ใช่ package_schedule_id)
	sessions := make([]dto.WeekSessionResponse, 0, len(classMap))
	for _, sess := range classMap {
		var ws []models.WorkSchedule
		if err := s.db.Preload("Coach.User").
			Where("course_id = ? AND date = ? AND start_time = ? AND end_time = ?", sess.CourseID, sess.Date, sess.StartTime, sess.EndTime).
			Find(&ws).Error; err != nil {
			return nil, err
		}
		coaches := make([]dto.WeekSessionCoach, 0, len(ws))
		seen := make(map[uint]bool) // กันโค้ชซ้ำ (เผื่อข้อมูลเก่าที่ assign ต่อ package)
		for _, w := range ws {
			if seen[w.CoachID] {
				continue
			}
			seen[w.CoachID] = true
			name := ""
			if w.Coach != nil {
				name = w.Coach.Nickname
				if name == "" && w.Coach.User != nil {
					name = w.Coach.User.FirstName + " " + w.Coach.User.LastName
				}
			}
			coaches = append(coaches, dto.WeekSessionCoach{
				WorkScheduleID: w.ID,
				CoachID:        w.CoachID,
				CoachName:      name,
				CourtNumber:    w.Courtnumber,
				IsEmergency:    w.IsEmergency,
			})
		}
		sess.AssignedCoaches = coaches
		sessions = append(sessions, *sess)
	}

	sort.Slice(sessions, func(i, j int) bool {
		if sessions[i].Date != sessions[j].Date {
			return sessions[i].Date < sessions[j].Date
		}
		if sessions[i].StartTime != sessions[j].StartTime {
			return sessions[i].StartTime < sessions[j].StartTime
		}
		return sessions[i].CourseName < sessions[j].CourseName
	})

	return sessions, nil
}

// timeToMinutesWS แปลงเวลา "HH:MM" เป็นนาทีนับจากเที่ยงคืน
// หมายเหตุ: ตั้งชื่อแยกจาก timeToMinutes ใน coach_filter_service.go เพื่อไม่ให้ชนกัน (ทั้งคู่อยู่ package services เดียวกัน)
// แนะนำในระยะยาวให้รวมเป็นฟังก์ชันเดียวใน package utils แทน
// timeToMinutesWS แปลง "HH:MM" เป็นจำนวนนาทีนับจากเที่ยงคืน
//
// ⚠️ ต้องปฏิเสธข้อความที่มีอะไรต่อท้าย
//
// เดิมใช้ fmt.Sscanf(t, "%d:%d", &h, &m) ซึ่ง "ไม่บังคับให้กินทั้งสตริง"
// ค่าอย่าง "09:00xyz" หรือ "09:00:00" จึงผ่านไปได้ (อ่านได้ 2 ตัวเลข err = nil)
// แล้วกลายเป็นเวลาที่ดูเหมือนถูกต้องทั้งที่ข้อมูลเสีย
//
// ตัวนี้ถูกใช้ตรวจทั้งเวลาว่างของโค้ชและตารางงาน ซึ่งเป็นข้อมูลที่ไปตัดสินว่า
// ใครสอนคาบไหนและได้เงินกี่คาบ การปล่อยข้อมูลเสียเข้าไปจึงไม่ใช่เรื่องเล็ก
//
// ─── รูปแบบที่ยอมรับ (และเหตุผล) ───
//
//	"09:00"     — input type="time" ของหน้าเว็บส่งมาแบบนี้
//	"9:00"      — ข้อมูลรุ่นเก่าในฐานที่ไม่ได้เติมศูนย์ ถ้าเข้มกว่านี้แถวเดิมจะอ่านไม่ออก
//	"09:00:00"  — รูปแบบที่ Postgres คืนมาจากคอลัมน์ชนิด time (มีวินาที)
//
// ⚠️ ท่อน "09:00:00" ไม่ใช่ความบังเอิญ เทส TestTimeToMinutesWS ตรึงไว้ตั้งแต่เดิม
// เพราะเป็นค่าที่มาจากฐานจริง ตอนแรกผมเขียนตัวใหม่ให้รับแค่ HH:MM แล้วเทสจับได้
// (วินาทีถูกตรวจว่าอยู่ในช่วงถูกต้อง แต่ไม่ถูกนำมาคิดเป็นนาที — ตารางสอนละเอียดถึงนาที)
func timeToMinutesWS(t string) (int, error) {
	invalid := fmt.Errorf("invalid time format, expected HH:MM or HH:MM:SS, got %q", t)

	parts := strings.Split(t, ":")
	if len(parts) < 2 || len(parts) > 3 {
		return 0, invalid
	}

	// ชั่วโมงยอมได้ 1-2 หลัก ส่วนนาที/วินาทีต้องสองหลักเสมอ
	if len(parts[0]) < 1 || len(parts[0]) > 2 || len(parts[1]) != 2 {
		return 0, invalid
	}
	if len(parts) == 3 && len(parts[2]) != 2 {
		return 0, invalid
	}
	for _, part := range parts {
		if !isAllDigits(part) {
			return 0, invalid
		}
	}

	h, err := strconv.Atoi(parts[0])
	if err != nil {
		return 0, invalid
	}
	m, err := strconv.Atoi(parts[1])
	if err != nil {
		return 0, invalid
	}
	if h > 23 || m > 59 {
		return 0, fmt.Errorf("time out of range: %q", t)
	}
	if len(parts) == 3 {
		sec, err := strconv.Atoi(parts[2])
		if err != nil || sec > 59 {
			return 0, fmt.Errorf("time out of range: %q", t)
		}
	}

	return h*60 + m, nil
}

// normalizeClockTime แปลงเวลาให้เป็นรูปแบบมาตรฐานเดียว "HH:MM"
//
// ⚠️ ทุกจุดที่ "เขียน" เวลาลงฐานต้องผ่านตัวนี้
//
// ─── ปัญหาที่ตัวนี้แก้ ───
//
// เวลาถูกเก็บเป็น varchar หลายตาราง และมาจากคนละทางกัน:
//
//	attendance_sessions.schedule_start_time  ← คัดลอกจาก package_schedules
//	work_schedules.start_time                ← แอดมินกรอกในหน้ามอบหมายงาน
//
// คนละที่ คนละคนกรอก คนละเวลา จึงมีทั้ง "18:00" และ "18:00:00" อยู่ในฐานเดียวกัน
//
// การจับคู่คลาสเทียบสองคอลัมน์นี้ด้วย = ตรง ๆ (classSessionForScheduleSQL)
// พอรูปแบบไม่ตรงกันจะเกิดอาการ:
//
//	ระบบตอบว่า "คาบนี้ยังไม่มีรอบเช็คชื่อ" → สั่งสร้างรอบใหม่
//	→ ฐานปฏิเสธเพราะ unique (package_id, session_date) มีอยู่แล้ว
//	→ ผู้ใช้เห็น duplicate key ... (SQLSTATE 23505)
//
// ทางแก้ที่ถูกคือ "มีรูปแบบเดียวในฐาน" ไม่ใช่ให้ทุกจุดที่เทียบคอยรองรับทุกรูปแบบ
// (ตัวอ่าน timeToMinutesWS ยังรองรับรูปแบบเก่าอยู่ เพื่อให้ข้อมูลที่ยังไม่ถูกแปลงอ่านได้)
//
// คืนค่าเดิมถ้าอ่านไม่ออก — การมอบหมายงานไม่ควรล้มเพราะเรื่องรูปแบบ
// ด่าน validateScheduleSlot จะปฏิเสธค่าที่ใช้ไม่ได้อยู่แล้ว
func normalizeClockTime(v string) string {
	if v == "" {
		return v
	}
	minutes, err := timeToMinutesWS(v)
	if err != nil {
		return v
	}
	return minutesToClock(minutes)
}

func isAllDigits(v string) bool {
	if v == "" {
		return false
	}
	for _, r := range v {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}
