package services

import (
	"errors"
	"sort"
	"time"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ยืนยันการมาเรียนล่วงหน้า
//
// แปลง PackageSchedule (คาบประจำสัปดาห์) เป็นคาบของวันที่จริงใน 7 วันข้างหน้า
// แล้วให้นักเรียนยืนยันทีละคาบ เพื่อให้โรงเรียนรู้จำนวนคนก่อนไปจองสนาม
//
// สองสถานะ: going = มีแถว · pending = ไม่มีแถว (ไฟล์นี้เติมค่าให้ตอนประกอบคำตอบ)
// ยกเลิกการยืนยันคือลบแถวทิ้ง ไม่ใช่เปลี่ยนเป็นสถานะอื่น (ดู CancelConfirmation)

const (
	// ConfirmHorizonDays = จำนวนวันข้างหน้าที่เปิดให้ยืนยัน (รวมวันนี้)
	ConfirmHorizonDays = 7

	// ปิดรับตอนเที่ยงของวันเรียน — โรงเรียนต้องมีเวลาครึ่งวันไปจองสนามก่อนคาบเย็น
	confirmCutoffHour = 12
)

var (
	ErrClassNotFound         = errors.New("ไม่พบคาบเรียนของวันที่เลือก")
	ErrClassConfirmClosed    = errors.New("เลยเวลายืนยันของคาบนี้แล้ว (ปิดรับตอนเที่ยงของวันที่เรียน)")
	ErrClassOutOfRange       = errors.New("ยืนยันได้เฉพาะคาบภายใน 7 วันข้างหน้าเท่านั้น")
	ErrEnrollmentNotActive   = errors.New("ใบลงทะเบียนนี้ยังไม่เปิดสิทธิ์เรียน จึงยืนยันการมาเรียนไม่ได้")
	ErrClassConfirmForbidden = errors.New("ไม่มีสิทธิ์ยืนยันการมาเรียนแทนผู้อื่น")
	ErrClassConfirmBadDate   = errors.New("รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)")
	ErrClassConfirmBadStatus = errors.New("สถานะไม่ถูกต้อง — ยืนยันได้อย่างเดียว ถ้าไม่มาให้กดยกเลิกการยืนยัน")
	ErrNoSessionsToConfirm   = errors.New("ใช้สิทธิ์เรียนของแพ็กเกจนี้ครบแล้ว จึงยืนยันการมาเรียนไม่ได้")
)

type ClassConfirmationService struct {
	db *gorm.DB
}

func NewClassConfirmationService(db *gorm.DB) *ClassConfirmationService {
	return &ClassConfirmationService{db: db}
}

// classConfirmDeadline = เที่ยงของวันเรียน หรือเวลาเริ่มคาบถ้าคาบเริ่มก่อนเที่ยง
//
// คาบเช้า 09:00 ต้องปิดตอน 09:00 ไม่ใช่เที่ยง ไม่งั้นยอดจะขยับหลังคาบเริ่มไปแล้ว
func classConfirmDeadline(classDate time.Time, startTime string) time.Time {
	loc := appLocation()
	y, m, d := classDate.Date()
	cutoff := time.Date(y, m, d, confirmCutoffHour, 0, 0, 0, loc)

	if mins, err := timeToMinutesWS(startTime); err == nil {
		start := time.Date(y, m, d, mins/60, mins%60, 0, 0, loc)
		if start.Before(cutoff) {
			return start
		}
	}
	return cutoff
}

// confirmKey ใช้เป็นคีย์ของแมปคำตอบที่โหลดมาแล้ว (enrollment + วันที่)
type confirmKey struct {
	enrollmentID uint
	date         string
}

func keyOf(enrollmentID uint, date time.Time) confirmKey {
	return confirmKey{enrollmentID: enrollmentID, date: date.Format("2006-01-02")}
}

// horizonDates คืนวันที่ทั้งหมดในช่วงที่เปิดให้ยืนยัน เริ่มจากวันนี้
func horizonDates(from time.Time, days int) []time.Time {
	base := sessionDateValue(from)
	out := make([]time.Time, 0, days)
	for i := 0; i < days; i++ {
		out = append(out, base.AddDate(0, 0, i))
	}
	return out
}

// coversDate ตอบว่าใบลงทะเบียนยังมีสิทธิ์เรียนในวันที่ให้มาหรือไม่
//
// ⚠️ เทียบวันชนวัน ไม่ใช่ timestamp — ExpiresAt เป็นจุดเวลาจริง (14 ก.ย. 18:32)
// ถ้าเทียบตรง ๆ คาบวันที่ 14 ก.ย. จะถูกตัดทิ้งทั้งที่วันนั้นยังเรียนได้
// canAttend = ใบนี้มีสิทธิ์เรียนคาบของวันนั้นจริงไหม
//
// ⚠️ ต้องเช็คโควตาด้วย ไม่ใช่แค่ช่วงวัน
//
// ไม่มีโค้ดไหนในระบบตั้งสถานะเป็น completed เลย ใบที่ใช้สิทธิ์ครบแล้วจึงค้าง
// เป็น active ตลอด ถ้าดูแค่ status จะเห็นคนที่เรียนไม่ได้แล้วโผล่มาในยอด
// ที่แอดมินเอาไปจองสนาม (เช็คอินจริงถูกปฏิเสธด้วย ErrNoSessionsLeft อยู่แล้ว)
func canAttend(e *models.Enrollment, date time.Time) bool {
	return e.RemainingSessions > 0 && coversDate(e, date)
}

func coversDate(e *models.Enrollment, date time.Time) bool {
	if e.ExpiresAt != nil && date.After(sessionDateValue(*e.ExpiresAt)) {
		return false
	}
	if e.StartedAt != nil && date.Before(sessionDateValue(*e.StartedAt)) {
		return false
	}
	return true
}

// GetMyUpcoming คืนคาบเรียนของนักเรียนคนนี้ในช่วง 7 วันข้างหน้า พร้อมสถานะคำตอบ
func (s *ClassConfirmationService) GetMyUpcoming(userID uint) ([]dto.UpcomingClassDTO, error) {
	customerID, err := ResolveCustomerID(s.db, userID)
	if err != nil {
		return nil, err
	}

	// นับเฉพาะใบที่เปิดสิทธิ์เรียนแล้ว — ใบที่รออนุมัติ/รอชำระเงินยังไม่มีคาบให้มา
	var enrollments []models.Enrollment
	if err := s.db.
		Preload("Package").
		Preload("Package.Course").
		Preload("Package.Schedules").
		Where("customer_id = ? AND status = ?", customerID, models.EnrollmentStatusActive).
		Find(&enrollments).Error; err != nil {
		return nil, errors.New("ไม่สามารถดึงข้อมูลคอร์สของคุณได้")
	}
	if len(enrollments) == 0 {
		return []dto.UpcomingClassDTO{}, nil
	}

	now := nowLocal()
	dates := horizonDates(now, ConfirmHorizonDays)

	enrollmentIDs := make([]uint, 0, len(enrollments))
	for i := range enrollments {
		enrollmentIDs = append(enrollmentIDs, enrollments[i].ID)
	}

	answered, err := s.loadAnswers(enrollmentIDs, dates[0], dates[len(dates)-1])
	if err != nil {
		return nil, err
	}

	result := make([]dto.UpcomingClassDTO, 0)
	for _, date := range dates {
		weekday := date.Weekday().String()

		for i := range enrollments {
			e := &enrollments[i]
			if e.Package == nil || !canAttend(e, date) {
				continue
			}

			for _, sch := range e.Package.Schedules {
				if string(sch.DayOfWeek) != weekday {
					continue
				}

				status := dto.ConfirmationStatusPending
				if s, ok := answered[keyOf(e.ID, date)]; ok {
					status = string(s)
				}

				deadline := classConfirmDeadline(date, sch.StartTime)
				courseName := ""
				if e.Package.Course != nil {
					courseName = e.Package.Course.CourseName
				}

				result = append(result, dto.UpcomingClassDTO{
					EnrollmentID:    e.ID,
					PackageID:       e.PackageID,
					CourseName:      courseName,
					ClassDate:       date.Format("2006-01-02"),
					DayOfWeek:       weekday,
					StartTime:       sch.StartTime,
					EndTime:         sch.EndTime,
					Status:          status,
					ConfirmDeadline: deadline.Format(time.RFC3339),
					IsOpen:          now.Before(deadline),
				})
			}
		}
	}

	sortClasses(result)
	return result, nil
}

// loadAnswers ดึงคำตอบที่มีอยู่แล้วมาทำเป็นแมปทีเดียว กัน N+1 ตอนไล่วันคูณใบลงทะเบียน
func (s *ClassConfirmationService) loadAnswers(enrollmentIDs []uint, from, to time.Time) (map[confirmKey]models.ClassConfirmationStatus, error) {
	out := map[confirmKey]models.ClassConfirmationStatus{}
	if len(enrollmentIDs) == 0 {
		return out, nil
	}

	var rows []models.ClassConfirmation
	if err := s.db.
		Where("enrollment_id IN ? AND class_date >= ? AND class_date <= ?", enrollmentIDs, from, to).
		Find(&rows).Error; err != nil {
		return nil, errors.New("ไม่สามารถดึงสถานะการยืนยันได้")
	}

	for _, r := range rows {
		out[keyOf(r.EnrollmentID, r.ClassDate)] = r.Status
	}
	return out, nil
}

func sortClasses(items []dto.UpcomingClassDTO) {
	sort.Slice(items, func(a, b int) bool {
		if items[a].ClassDate != items[b].ClassDate {
			return items[a].ClassDate < items[b].ClassDate
		}
		if items[a].StartTime != items[b].StartTime {
			return items[a].StartTime < items[b].StartTime
		}
		return items[a].CourseName < items[b].CourseName
	})
}

// checkedClass ตรวจทุกกติกาแล้วคืนใบลงทะเบียนกับคาบที่ผ่านการตรวจแล้ว
//
// ยืนยันกับยกเลิกต้องผ่านด่านชุดเดียวกัน (เป็นเจ้าของ · ใบยังใช้งานอยู่ ·
// อยู่ในช่วง 7 วัน · ยังไม่พ้นเส้นตาย) แยกเขียนสองที่แล้วจะแก้หลุดข้างเดียว
func (s *ClassConfirmationService) checkedClass(userID, enrollmentID uint, classDateStr string) (*models.Enrollment, models.PackageSchedule, time.Time, error) {
	var zero models.PackageSchedule

	customerID, err := ResolveCustomerID(s.db, userID)
	if err != nil {
		return nil, zero, time.Time{}, err
	}

	date, err := time.ParseInLocation("2006-01-02", classDateStr, appLocation())
	if err != nil {
		return nil, zero, time.Time{}, ErrClassConfirmBadDate
	}
	classDate := sessionDateValue(date)

	var enrollment models.Enrollment
	if err := s.db.
		Preload("Package").
		Preload("Package.Course").
		Preload("Package.Schedules").
		First(&enrollment, enrollmentID).Error; err != nil {
		return nil, zero, time.Time{}, ErrEnrollmentNotFound
	}

	// enrollment_id เดาต่อได้ ต้องเทียบเจ้าของก่อนเสมอ
	if enrollment.CustomerID != customerID {
		return nil, zero, time.Time{}, ErrClassConfirmForbidden
	}
	if enrollment.Status != models.EnrollmentStatusActive {
		return nil, zero, time.Time{}, ErrEnrollmentNotActive
	}
	// แยกจาก coversDate ข้างล่างเพื่อให้ข้อความบอกสาเหตุจริง ไม่ใช่ "อยู่นอกช่วง 7 วัน"
	if enrollment.RemainingSessions == 0 {
		return nil, zero, time.Time{}, ErrNoSessionsToConfirm
	}

	now := nowLocal()
	dates := horizonDates(now, ConfirmHorizonDays)
	if classDate.Before(dates[0]) || classDate.After(dates[len(dates)-1]) {
		return nil, zero, time.Time{}, ErrClassOutOfRange
	}
	if !coversDate(&enrollment, classDate) {
		return nil, zero, time.Time{}, ErrClassOutOfRange
	}

	// วันที่ที่ส่งมาต้องเป็นวันที่แพ็กเกจนี้มีคาบจริง ไม่ใช่วันไหนก็ได้
	sch, ok := scheduleOn(enrollment.Package, classDate)
	if !ok {
		return nil, zero, time.Time{}, ErrClassNotFound
	}

	if !now.Before(classConfirmDeadline(classDate, sch.StartTime)) {
		return nil, zero, time.Time{}, ErrClassConfirmClosed
	}

	return &enrollment, sch, classDate, nil
}

// classDTO ประกอบคำตอบกลับให้หน้าเว็บ ใช้ร่วมกันทั้งตอนยืนยันและยกเลิก
func classDTO(e *models.Enrollment, sch models.PackageSchedule, classDate time.Time, status string) *dto.UpcomingClassDTO {
	deadline := classConfirmDeadline(classDate, sch.StartTime)
	courseName := ""
	if e.Package != nil && e.Package.Course != nil {
		courseName = e.Package.Course.CourseName
	}
	return &dto.UpcomingClassDTO{
		EnrollmentID:    e.ID,
		PackageID:       e.PackageID,
		CourseName:      courseName,
		ClassDate:       classDate.Format("2006-01-02"),
		DayOfWeek:       classDate.Weekday().String(),
		StartTime:       sch.StartTime,
		EndTime:         sch.EndTime,
		Status:          status,
		ConfirmDeadline: deadline.Format(time.RFC3339),
		IsOpen:          nowLocal().Before(deadline),
	}
}

// CancelConfirmation ยกเลิกการยืนยัน — กลับไปเป็น "ยังไม่ตอบ"
//
// ⚠️ ต้องลบถาวรด้วย Unscoped — unique index ไม่รวม deleted_at ถ้า soft delete
// แถวเดิมจะยังกินที่ใน index แล้วยืนยันคาบนั้นใหม่ไม่ได้อีกเลย
//
// ยิงซ้ำตอนไม่มีแถวก็ไม่ error ผลลัพธ์คือ "ยังไม่ตอบ" เหมือนกัน
func (s *ClassConfirmationService) CancelConfirmation(userID uint, req dto.CancelClassReq) (*dto.UpcomingClassDTO, error) {
	enrollment, sch, classDate, err := s.checkedClass(userID, req.EnrollmentID, req.ClassDate)
	if err != nil {
		return nil, err
	}

	if err := s.db.Unscoped().
		Where("enrollment_id = ? AND class_date = ?", enrollment.ID, classDate).
		Delete(&models.ClassConfirmation{}).Error; err != nil {
		return nil, errors.New("ไม่สามารถยกเลิกการยืนยันได้")
	}

	return classDTO(enrollment, sch, classDate, dto.ConfirmationStatusPending), nil
}

// Confirm บันทึกว่านักเรียนยืนยันจะมาเรียนคาบนั้น
//
// ⚠️ ทุกกติกาบังคับที่นี่ ไม่ใช่ที่หน้าเว็บ — หน้าเว็บซ่อนปุ่มก็จริงแต่ยิง API ตรงได้
// ถ้าไม่ตรวจซ้ำ ยอดที่แอดมินเอาไปจองสนามจะขยับหลังปิดรับไปแล้ว
func (s *ClassConfirmationService) Confirm(userID uint, req dto.ConfirmClassReq) (*dto.UpcomingClassDTO, error) {
	// ⚠️ ตรวจซ้ำที่นี่ ไม่พึ่งแท็ก binding ของ controller อย่างเดียว
	// มีสถานะเดียวที่เขียนลงฐานได้คือ going ค่าอื่นหลุดเข้าไปแล้วนับยอดเพี้ยนทันที
	if req.Status != string(models.ClassConfirmationGoing) {
		return nil, ErrClassConfirmBadStatus
	}

	enrollment, sch, classDate, err := s.checkedClass(userID, req.EnrollmentID, req.ClassDate)
	if err != nil {
		return nil, err
	}

	row := models.ClassConfirmation{
		EnrollmentID:      enrollment.ID,
		ClassDate:         classDate,
		Status:            models.ClassConfirmationStatus(req.Status),
		ScheduleStartTime: sch.StartTime,
		ScheduleEndTime:   sch.EndTime,
		RespondedAt:       nowLocal(),
	}

	// ยืนยันซ้ำ = UPDATE แถวเดิม ให้ฐานตัดสินด้วย ON CONFLICT แทนอ่านก่อนแล้วเขียน
	// เพราะกดรัว ๆ พร้อมกันจะอ่านเจอ "ยังไม่มีแถว" ได้ทั้งคู่แล้ว insert ชนกัน
	if err := s.db.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "enrollment_id"}, {Name: "class_date"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"status", "responded_at", "updated_at",
			"schedule_start_time", "schedule_end_time",
		}),
	}).Create(&row).Error; err != nil {
		return nil, errors.New("ไม่สามารถบันทึกการยืนยันได้")
	}

	return classDTO(enrollment, sch, classDate, req.Status), nil
}

// scheduleOn หาคาบของแพ็กเกจที่ตรงกับวันในสัปดาห์ของวันที่ให้มา
func scheduleOn(pkg *models.Package, date time.Time) (models.PackageSchedule, bool) {
	if pkg == nil {
		return models.PackageSchedule{}, false
	}
	weekday := date.Weekday().String()
	for _, sch := range pkg.Schedules {
		if string(sch.DayOfWeek) == weekday {
			return sch, true
		}
	}
	return models.PackageSchedule{}, false
}

// GetHeadcounts คืนยอดสรุปรายคาบของวันนี้
//
// ⚠️ วันนี้วันเดียว ไม่ใช่ 7 วันเหมือนฝั่งนักเรียน — แอดมินจองสนามตอนตัวเลขนิ่ง
// ซึ่งคือหลังเที่ยงของวันเรียน วันอื่นยังเปลี่ยนได้ เอาไปจองไม่ได้อยู่ดี
//
// ⚠️ รายงานเฉพาะคาบที่มีนักเรียนจริง — ข้ามคาบที่ total = 0
//
// แพ็กเกจส่วนใหญ่ตั้งตารางไว้หลายช่วงเวลาต่อวันโดยที่ยังไม่มีคนสมัคร (เช่นคอร์ส
// PRIVATE ที่มี 4-5 คาบต่อวัน) ถ้ารายงานหมดตารางจะยาวเป็นสิบแถวที่เป็นศูนย์ทั้งหมด
// จนหาคาบที่มีคนจริงไม่เจอ ซึ่งเป็นข้อมูลเดียวที่ใช้ตัดสินใจจองสนามได้
//
// โหลดสามชุดทีเดียวแล้วประกอบในหน่วยความจำ ไล่ query ต่อคาบจะกลายเป็น N+1
func (s *ClassConfirmationService) GetHeadcounts() ([]dto.ClassHeadcountDTO, error) {
	now := nowLocal()
	dates := horizonDates(now, 1)

	var packages []models.Package
	if err := s.db.Preload("Course").Preload("Schedules").Find(&packages).Error; err != nil {
		return nil, errors.New("ไม่สามารถดึงข้อมูลแพ็กเกจได้")
	}

	var enrollments []models.Enrollment
	if err := s.db.
		Where("status = ?", models.EnrollmentStatusActive).
		Find(&enrollments).Error; err != nil {
		return nil, errors.New("ไม่สามารถดึงข้อมูลผู้เรียนได้")
	}

	byPackage := map[uint][]*models.Enrollment{}
	enrollmentIDs := make([]uint, 0, len(enrollments))
	for i := range enrollments {
		e := &enrollments[i]
		byPackage[e.PackageID] = append(byPackage[e.PackageID], e)
		enrollmentIDs = append(enrollmentIDs, e.ID)
	}

	answered, err := s.loadAnswers(enrollmentIDs, dates[0], dates[len(dates)-1])
	if err != nil {
		return nil, err
	}

	result := make([]dto.ClassHeadcountDTO, 0)
	for _, date := range dates {
		weekday := date.Weekday().String()

		for i := range packages {
			pkg := &packages[i]

			sch, ok := scheduleOn(pkg, date)
			if !ok || string(sch.DayOfWeek) != weekday {
				continue
			}

			var going, total int
			for _, e := range byPackage[pkg.ID] {
				if !canAttend(e, date) {
					continue
				}
				total++
				if answered[keyOf(e.ID, date)] == models.ClassConfirmationGoing {
					going++
				}
			}

			if total == 0 {
				continue
			}

			item := dto.ClassHeadcountDTO{
				PackageID: pkg.ID,
				CourseID:  pkg.CourseID,
				ClassDate: date.Format("2006-01-02"),
				DayOfWeek: weekday,
				StartTime: sch.StartTime,
				EndTime:   sch.EndTime,
				Total:     total,
				Going:     going,
				Pending:   total - going,
				IsClosed:  !now.Before(classConfirmDeadline(date, sch.StartTime)),
			}
			if pkg.Course != nil {
				item.CourseName = pkg.Course.CourseName
			}
			result = append(result, item)
		}
	}

	sort.Slice(result, func(a, b int) bool {
		if result[a].ClassDate != result[b].ClassDate {
			return result[a].ClassDate < result[b].ClassDate
		}
		if result[a].StartTime != result[b].StartTime {
			return result[a].StartTime < result[b].StartTime
		}
		return result[a].CourseName < result[b].CourseName
	})
	return result, nil
}

// GetClassRoster คืนรายชื่อนักเรียนของคาบหนึ่ง แบ่งกลุ่มตามคำตอบ
//
// ⚠️ ต้องยืนยันว่าแพ็กเกจมีคาบในวันนั้นจริงก่อนเสมอ ไม่งั้นส่งวันที่มั่วมาจะได้
// รายชื่อ pending ทั้งหมดของ "คาบที่ไม่มีอยู่จริง" ซึ่งชวนให้เข้าใจผิด
func (s *ClassConfirmationService) GetClassRoster(packageID uint, dateStr string) (*dto.ClassRosterDTO, error) {
	date, err := time.ParseInLocation("2006-01-02", dateStr, appLocation())
	if err != nil {
		return nil, ErrClassConfirmBadDate
	}
	classDate := sessionDateValue(date)

	var pkg models.Package
	if err := s.db.Preload("Course").Preload("Schedules").First(&pkg, packageID).Error; err != nil {
		return nil, ErrPackageNotFound
	}

	sch, ok := scheduleOn(&pkg, classDate)
	if !ok {
		return nil, ErrClassNotFound
	}

	// ต้อง preload Customer.User ด้วย ไม่งั้นชื่อ-นามสกุลว่างทั้งรายการ
	var enrollments []models.Enrollment
	if err := s.db.
		Preload("Customer").
		Preload("Customer.User").
		Where("package_id = ? AND status = ?", packageID, models.EnrollmentStatusActive).
		Find(&enrollments).Error; err != nil {
		return nil, errors.New("ไม่สามารถดึงรายชื่อผู้เรียนได้")
	}

	enrollmentIDs := make([]uint, 0, len(enrollments))
	for i := range enrollments {
		enrollmentIDs = append(enrollmentIDs, enrollments[i].ID)
	}

	var rows []models.ClassConfirmation
	if len(enrollmentIDs) > 0 {
		if err := s.db.
			Where("enrollment_id IN ? AND class_date = ?", enrollmentIDs, classDate).
			Find(&rows).Error; err != nil {
			return nil, errors.New("ไม่สามารถดึงสถานะการยืนยันได้")
		}
	}
	answered := make(map[uint]models.ClassConfirmation, len(rows))
	for _, r := range rows {
		answered[r.EnrollmentID] = r
	}

	out := &dto.ClassRosterDTO{
		PackageID: pkg.ID,
		CourseID:  pkg.CourseID,
		ClassDate: classDate.Format("2006-01-02"),
		DayOfWeek: classDate.Weekday().String(),
		StartTime: sch.StartTime,
		EndTime:   sch.EndTime,
		IsClosed:  !nowLocal().Before(classConfirmDeadline(classDate, sch.StartTime)),
		Going:     []dto.ClassRosterItemDTO{},
		Pending:   []dto.ClassRosterItemDTO{},
	}
	if pkg.Course != nil {
		out.CourseName = pkg.Course.CourseName
	}

	for i := range enrollments {
		e := &enrollments[i]

		// เกณฑ์เดียวกับที่ใช้นับยอด
		if !canAttend(e, classDate) {
			continue
		}

		item := dto.ClassRosterItemDTO{
			EnrollmentID: e.ID,
			CustomerID:   e.CustomerID,
			Status:       dto.ConfirmationStatusPending,
		}
		if e.Customer != nil {
			item.Nickname = e.Customer.Nickname
			item.PhoneNumber = e.Customer.PhoneNumber
			if e.Customer.User != nil {
				item.FullName = e.Customer.User.FirstName + " " + e.Customer.User.LastName
			}
		}

		if conf, ok := answered[e.ID]; ok {
			item.Status = string(conf.Status)
		}

		if item.Status == dto.ConfirmationStatusGoing {
			out.Going = append(out.Going, item)
		} else {
			out.Pending = append(out.Pending, item)
		}
	}

	// เรียงตามชื่อเล่นให้หาคนในรายการยาว ๆ ได้
	for _, list := range [][]dto.ClassRosterItemDTO{out.Going, out.Pending} {
		sort.Slice(list, func(a, b int) bool { return list[a].Nickname < list[b].Nickname })
	}

	return out, nil
}
