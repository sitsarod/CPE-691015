package services

import (
	"errors"
	"log"
	"time"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
	"gorm.io/gorm"
)

func classPackageIDs(db *gorm.DB, courseID uint, weekday, startTime, endTime string) ([]uint, error) {
	if courseID == 0 || weekday == "" || startTime == "" || endTime == "" {
		return nil, nil
	}

	var ids []uint
	err := db.Raw(`
		SELECT DISTINCT p.id
		FROM packages p
		JOIN package_schedules ps ON ps.package_id = p.id
		WHERE p.deleted_at IS NULL
		  AND p.course_id = ?
		  AND ps.day_of_week = ?
		  AND ps.start_time = ?
		  AND ps.end_time = ?
		ORDER BY p.id
	`, courseID, weekday, startTime, endTime).Scan(&ids).Error
	if err != nil {
		return nil, errors.New("ไม่สามารถหาแพ็กเกจที่เรียนคาบเดียวกันได้")
	}
	return ids, nil
}

func classAnchorPackageID(db *gorm.DB, courseID uint, weekday, startTime, endTime string) (*uint, error) {
	ids, err := classPackageIDs(db, courseID, weekday, startTime, endTime)
	if err != nil {
		return nil, err
	}
	if len(ids) == 0 {
		return nil, nil
	}
	return &ids[0], nil
}

func (s *AttendanceService) sessionCourseID(tx *gorm.DB, session *models.AttendanceSession) (uint, error) {
	var courseID uint
	if err := tx.Model(&models.Package{}).
		Select("course_id").
		Where("id = ?", session.PackageID).
		Scan(&courseID).Error; err != nil {
		return 0, errors.New("ไม่สามารถอ่านคอร์สของรอบเช็คชื่อได้")
	}
	return courseID, nil
}

func (s *AttendanceService) siblingPackageIDs(
	tx *gorm.DB,
	session *models.AttendanceSession,
) ([]uint, error) {
	anchorOnly := []uint{session.PackageID}

	if session.ScheduleStartTime == "" || session.ScheduleEndTime == "" {
		return anchorOnly, nil
	}

	courseID, err := s.sessionCourseID(tx, session)
	if err != nil {
		return nil, err
	}
	if courseID == 0 {
		return anchorOnly, nil
	}

	ids, err := classPackageIDs(tx, courseID,
		session.SessionDate.Weekday().String(),
		session.ScheduleStartTime,
		session.ScheduleEndTime,
	)
	if err != nil {
		return nil, err
	}

	for _, id := range ids {
		if id == session.PackageID {
			return ids, nil
		}
	}
	return append(ids, session.PackageID), nil
}

func NormalizeFutureWorkSchedulePackages(db *gorm.DB) error {
	loc, err := time.LoadLocation("Asia/Bangkok")
	if err != nil {
		loc = time.Local
	}
	today := time.Now().In(loc).Format("2006-01-02")

	type row struct {
		ID        uint
		CourseID  uint
		PackageID uint
		Date      string
		StartTime string
		EndTime   string
	}

	var rows []row
	if err := db.Raw(`
		SELECT id, course_id, package_id,
		       to_char(date, 'YYYY-MM-DD') AS date, start_time, end_time
		FROM work_schedules
		WHERE deleted_at IS NULL AND package_id IS NOT NULL AND date >= ?::date
		ORDER BY id
	`, today).Scan(&rows).Error; err != nil {
		return errors.New("ไม่สามารถอ่านตารางงานของโค้ชได้")
	}

	changed := 0
	for _, w := range rows {
		d, perr := time.Parse("2006-01-02", w.Date)
		if perr != nil {
			continue
		}

		anchor, aerr := classAnchorPackageID(db, w.CourseID, d.Weekday().String(), w.StartTime, w.EndTime)
		if aerr != nil {
			return aerr
		}
		if anchor == nil || *anchor == w.PackageID {
			continue
		}

		if err := db.Model(&models.WorkSchedule{}).
			Where("id = ?", w.ID).
			Update("package_id", *anchor).Error; err != nil {
			return errors.New("ไม่สามารถปรับแพ็กเกจของตารางงานได้")
		}
		log.Printf("[workschedule] #%d: package_id %d → %d (คลาส %s %s-%s)",
			w.ID, w.PackageID, *anchor, w.Date, w.StartTime, w.EndTime)
		changed++
	}

	log.Printf("[workschedule] ปรับแพ็กเกจหลักของตารางงาน %d แถว จาก %d แถวของวันนี้เป็นต้นไป",
		changed, len(rows))
	return nil
}

func customerClassEnrollments(db *gorm.DB, customerID uint, packageIDs []uint, preloadCustomer bool) ([]models.Enrollment, error) {
	if len(packageIDs) == 0 {
		return nil, nil
	}

	q := db.Where("customer_id = ? AND package_id IN ? AND status = ?",
		customerID, packageIDs, models.EnrollmentStatusActive).
		Order("id ASC")
	if preloadCustomer {
		q = q.Preload("Customer").Preload("Customer.User")
	}

	var list []models.Enrollment
	if err := q.Find(&list).Error; err != nil {
		return nil, errors.New("ไม่สามารถดึงข้อมูลการลงทะเบียนได้")
	}
	return list, nil
}

func confirmedForClass(db *gorm.DB, customerID uint, packageIDs []uint, classDate time.Time, startTime string) bool {
	if len(packageIDs) == 0 {
		return false
	}

	var n int64
	err := db.Model(&models.ClassConfirmation{}).
		Joins("JOIN enrollments e ON e.id = class_confirmations.enrollment_id AND e.deleted_at IS NULL").
		Where("e.customer_id = ? AND e.package_id IN ? AND e.status = ?",
			customerID, packageIDs, models.EnrollmentStatusActive).
		Where("class_confirmations.class_date = ? AND class_confirmations.status = ?",
			dateKey(classDate), models.ClassConfirmationGoing).
		Where("class_confirmations.schedule_start_time = ?", startTime).
		Count(&n).Error
	if err != nil {
		return false
	}
	return n > 0
}

// openSessionForSlot หารอบเช็คชื่อที่มีอยู่แล้วของ "คาบนี้" ในวันนั้น
//
// ⚠️ ต้องกรองเวลาคาบด้วย ไม่ใช่แค่แพ็กเกจกับวันที่
//
// เดิมหาด้วย (package_id IN ?, วันที่) เท่านั้น ซึ่งพังเมื่อแพ็กเกจเดียวมีคาบเรียน
// หลายช่วงในวันเดียวกัน (เช่น เสาร์ 10:00-12:00 และ เสาร์ 14:00-16:00)
//
//	เปิดรอบบ่ายไปแล้ว → จะเปิดรอบเช้า → เจอรอบบ่ายแล้วคืนตัวนั้นกลับไป
//	→ รอบเช้าเปิดไม่ได้ → คาบเช้าไม่มีรอบที่ปิด → โค้ชไม่ได้เงินของคาบนั้น
//
// startTime/endTime = เวลาของคาบที่กำลังจะเปิด (สแนปช็อตชุดเดียวกับที่เก็บใน session)
//
// เงื่อนไข OR ท่อนหลังเป็นทางถอยสำหรับรอบรุ่นเก่าที่ยังไม่มีสแนปช็อตเวลา
// ซึ่งเทียบเวลาไม่ได้ จึงถือว่าเป็นรอบของคาบนี้ไปตามเดิม (หลักเดียวกับ
// closedSessionForScheduleSQL ในฝั่งคิดเงิน)
func (s *AttendanceService) openSessionForSlot(
	tx *gorm.DB,
	packageIDs []uint,
	dayStart, dayEnd string,
	startTime string,
) (*models.AttendanceSession, error) {
	if len(packageIDs) == 0 {
		return nil, nil
	}

	var existing models.AttendanceSession
	// ใช้เงื่อนไขฝั่ง main — เวลาเริ่มอย่างเดียวพอระบุคาบได้
	// (แพ็กเกจเดียวกันในวันเดียวกันมีคาบที่เริ่มเวลาเดียวกันสองคาบไม่ได้)
	// ฝั่งนี้เคยเขียนแบบเทียบทั้ง start และ end ซึ่งให้ผลเหมือนกันแต่ต่างจาก main เปล่า ๆ
	err := tx.Where("package_id IN ? AND session_date >= ? AND session_date < ?",
		packageIDs, dayStart, dayEnd).
		Where("COALESCE(schedule_start_time, '') = '' OR schedule_start_time = ?", startTime).
		Order("id ASC").
		First(&existing).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, errors.New("ไม่สามารถตรวจรอบเช็คชื่อที่เปิดไว้แล้วได้")
	}
	return &existing, nil
}

// classPackageDetails คืนรายละเอียดของแพ็กเกจทุกใบในคาบ พร้อมจำนวนคนของแต่ละใบ
//
// นับ "หัวคน" ไม่ใช่ "ใบลงทะเบียน" เหมือนที่อื่นทั้งระบบ — คนหนึ่งถือหลายใบใน
// แพ็กเกจเดียวกันได้ ถ้านับเป็นใบยอดบนจอจะเกินจำนวนคนจริง
//
// ⚠️ คนที่ถือใบในหลายแพ็กเกจของคาบเดียวกันจะถูกนับในทุกใบที่เขาถือ
// ผลรวมของทุกแถวจึงมากกว่าจำนวนคนในคาบได้ ตัวเลขรวมของคาบต้องอ่านจาก
// StudentCount ที่นับแยกต่างหาก ไม่ใช่เอาแถวพวกนี้มาบวกกัน
func classPackageDetails(db *gorm.DB, packageIDs []uint, anchorID uint) ([]dto.ClassPackageDTO, error) {
	if len(packageIDs) == 0 {
		return []dto.ClassPackageDTO{}, nil
	}

	var rows []struct {
		ID            uint
		SessionsCount uint
		Price         float64
		StudentCount  int64
	}
	err := db.Raw(`
		SELECT p.id, p.sessions_count, p.price,
		       COUNT(DISTINCT e.customer_id) AS student_count
		FROM packages p
		LEFT JOIN enrollments e
		       ON e.package_id = p.id AND e.deleted_at IS NULL AND e.status = ?
		WHERE p.id IN ?
		GROUP BY p.id, p.sessions_count, p.price
		ORDER BY p.id
	`, models.EnrollmentStatusActive, packageIDs).Scan(&rows).Error
	if err != nil {
		return nil, errors.New("ไม่สามารถดึงรายละเอียดแพ็กเกจของคาบนี้ได้")
	}

	out := make([]dto.ClassPackageDTO, 0, len(rows))
	for _, r := range rows {
		out = append(out, dto.ClassPackageDTO{
			ID:            r.ID,
			SessionsCount: r.SessionsCount,
			Price:         r.Price,
			StudentCount:  r.StudentCount,
			IsAnchor:      r.ID == anchorID,
		})
	}
	return out, nil
}
