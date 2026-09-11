package services

import (
	"errors"
	"fmt"
	"log"
	"time"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"

	"gorm.io/gorm"
)

// ─── คาบที่สอนไปแล้วแต่ไม่เคยมีรอบเช็คชื่อ ───────────────────────────────────
//
// ─── ปัญหาที่ไฟล์นี้แก้ ───
//
// หลังแก้บั๊ก "โค้ชขาดงานยังได้เงินเต็ม" การนับค่าจ้างผูกกับรอบเช็คชื่อเต็มตัว:
// ตารางงานจะถูกนับเป็นเงินก็ต่อเมื่อมีรอบเช็คชื่อของคลาสนั้น "ปิดแล้ว"
//
// แต่รอบเช็คชื่อเปิดได้เฉพาะตอนอยู่ในคาบจริง (±30 นาที ดู findCurrentSchedule)
// และไม่มี endpoint ไหนในระบบสร้างรอบย้อนหลังได้เลย ผลคือ:
//
//	แอดมินลืมเปิดรอบ / เน็ตล่ม / มาสายเกิน 30 นาที
//	  → คาบนั้นไม่มีรอบเช็คชื่อตลอดไป
//	  → โค้ชสอนจริงแต่ได้ 0 บาท
//	  → ไม่มี error ไม่มีคำเตือน ไม่มีใครรู้
//
// ความเงียบคือส่วนที่แย่ที่สุด ไม่ใช่ตัวเลข
//
// ─── ทำไมไม่แก้ด้วยการ "ไม่ต้องมีรอบก็จ่าย" ───
//
// เพราะจะกลายเป็นบั๊กเดิมกลับด้าน: แถว absent เกิดตอนปิดรอบเท่านั้น
// ถ้าไม่มีรอบก็ไม่มีแถว absent แปลว่าโค้ชที่ไม่ได้มาสอนจะได้เงินทุกครั้งที่แอดมินลืมเปิดรอบ
// สลับจาก "จ่ายขาดแบบเงียบ" เป็น "จ่ายเกินแบบเงียบ" ซึ่งไม่ได้ดีขึ้น
//
// ทางออกคือทำให้ "ไม่เงียบ" — ยกคาบที่ค้างขึ้นมาให้เห็น แล้วให้คนตัดสินใจ
// พร้อมบันทึกว่าใครตัดสิน (RecordedByUserID) เหมือนการเช็คชื่อปกติทุกประการ

var (
	ErrMissedClassNotFound = errors.New("ไม่พบตารางงานของคาบที่ต้องการเคลียร์")
	ErrMissedClassNotDue   = errors.New("คาบนี้ยังไม่ผ่านไป เคลียร์ย้อนหลังไม่ได้")
	ErrMissedClassLegacy   = errors.New("คาบรุ่นเก่าที่ไม่ได้ผูกกับแพ็กเกจ เคลียร์ด้วยวิธีนี้ไม่ได้")

	ErrMissedClassResolved = errors.New("คาบนี้มีรอบเช็คชื่อที่ปิดแล้ว ไม่ต้องเคลียร์ย้อนหลัง")
	ErrMissedClassOpen     = errors.New("คาบนี้ยังมีรอบเช็คชื่อเปิดค้างอยู่ ให้เข้าไปปิดรอบตามปกติแทน")

	ErrMissedClassCoachSet = errors.New("ต้องระบุสถานะให้ครบทุกคนที่ถูกมอบหมายคาบนี้ และห้ามมีคนที่ไม่ได้ถูกมอบหมาย")
)

// scheduleDateOnly ตัด "T00:00:00Z" ที่ driver อาจแถมมากับคอลัมน์ date
// (WorkSchedule.Date เป็น string ค่าที่ได้จึงขึ้นกับว่าฐานส่งอะไรกลับมา)
func scheduleDateOnly(v string) string {
	if len(v) >= 10 {
		return v[:10]
	}
	return v
}

// unresolvedScheduleScope = ตารางงานของคาบที่ผ่านไปแล้วแต่ยังไม่มีรอบเช็คชื่อที่ปิด
//
// ⚠️ เป็นด้านตรงข้ามของ taughtScheduleScope เป๊ะ ๆ โดยตั้งใจ
// ทั้งคู่ใช้ closedSessionForScheduleSQL ตัวเดียวกัน (ตัวหนึ่ง EXISTS อีกตัว NOT EXISTS)
// ถ้าแยกกันเขียนเมื่อไหร่ จะเกิดคาบที่ "ไม่ถูกนับเงิน แต่ก็ไม่โผล่ในรายการค้าง"
// ซึ่งคือเงินหายโดยไม่มีใครเห็น — อาการเดียวกับบั๊กที่ไฟล์นี้แก้อยู่
//
// ไม่ดู coach_attendances เลยโดยตั้งใจ — คำถามตรงนี้คือ "คลาสนี้มีรอบไหม"
// ไม่ใช่ "โค้ชคนนี้มาไหม" คาบที่มีรอบแล้วแต่โค้ชถูกมาร์คขาด ถือว่าเคลียร์แล้ว
//
// todayStr เป็นวันที่ตามเวลาไทย คาบของ "วันนี้" ไม่ถูกนับว่าค้าง เพราะแอดมิน
// อาจยังอยู่ในช่วงที่เปิดรอบได้ตามปกติ คาบวันนี้ที่พลาดจริงจะโผล่พรุ่งนี้
func unresolvedScheduleScope(db *gorm.DB, todayStr string) *gorm.DB {
	return db.Model(&models.WorkSchedule{}).
		Where("work_schedules.package_id IS NOT NULL").
		Where("work_schedules.date < ?", todayStr).
		Where("NOT EXISTS ("+closedSessionForScheduleSQL+")", models.AttendanceSessionClosed)
}

// ListMissedClasses คืนคลาสที่ค้างอยู่ทั้งหมด เรียงคาบล่าสุดขึ้นก่อน
//
// รวมเป็น "คลาส" ไม่ใช่ "ตารางงาน" — คลาสเดียวมีโค้ชหลายคนได้
// และการเคลียร์ต้องทำทั้งคลาสพร้อมกัน (ดู ResolveMissedClass)
func (s *AttendanceService) ListMissedClasses() ([]dto.MissedClassDTO, error) {
	todayStr := nowLocal().Format("2006-01-02")

	var rows []models.WorkSchedule
	if err := unresolvedScheduleScope(s.db, todayStr).
		Preload("Coach", withDeleted).
		Preload("Coach.User", withDeleted).
		Preload("Course", withDeleted).
		Order("work_schedules.date DESC, work_schedules.start_time ASC, work_schedules.id ASC").
		Find(&rows).Error; err != nil {
		return nil, errors.New("ไม่สามารถดึงรายการคาบที่ยังไม่มีรอบเช็คชื่อได้")
	}

	type slotKey struct {
		courseID   uint
		date       string
		start, end string
	}

	groups := make(map[slotKey]*dto.MissedClassDTO)
	order := make([]slotKey, 0, len(rows))
	seen := make(map[slotKey]map[uint]bool)
	anchor := make(map[slotKey]*models.WorkSchedule)

	for i := range rows {
		w := &rows[i]
		date := scheduleDateOnly(w.Date)
		key := slotKey{courseID: w.CourseID, date: date, start: w.StartTime, end: w.EndTime}

		item, ok := groups[key]
		if !ok {
			item = &dto.MissedClassDTO{
				WorkScheduleID: w.ID,
				CourseID:       w.CourseID,
				Date:           date,
				StartTime:      w.StartTime,
				EndTime:        w.EndTime,
			}
			if w.Course != nil {
				item.CourseName = w.Course.CourseName
			}
			groups[key] = item
			seen[key] = make(map[uint]bool)
			anchor[key] = w
			order = append(order, key)
		}

		// work_schedules ไม่มี unique index แถวซ้ำจึงเกิดได้จริง (coachSchedules ก็กันแบบนี้)
		if seen[key][w.CoachID] {
			continue
		}
		seen[key][w.CoachID] = true

		fullName, nickname := coachDisplayName(w.Coach)
		item.Coaches = append(item.Coaches, dto.MissedClassCoachDTO{
			CoachID:     w.CoachID,
			FullName:    fullName,
			Nickname:    nickname,
			IsEmergency: w.IsEmergency,
		})
	}

	result := make([]dto.MissedClassDTO, 0, len(order))
	for _, key := range order {
		groups[key].Students = s.confirmedStudentsForSlot(anchor[key], key.date)
		result = append(result, *groups[key])
	}
	return result, nil
}

// confirmedStudentsForSlot คืนนักเรียนที่ยืนยันว่าจะมาเรียนคาบนี้
//
// ⚠️ ไม่กรองสถานะใบลงทะเบียน ต่างจาก confirmedCustomers ที่ใช้ตอนเช็คชื่อสด
// คาบพวกนี้ผ่านไปแล้ว ใบที่หมดอายุทีหลังก็ยังเป็นคนที่ควรมาเรียนวันนั้นอยู่ดี
func (s *AttendanceService) confirmedStudentsForSlot(ws *models.WorkSchedule, date string) []dto.MissedClassStudentDTO {
	out := []dto.MissedClassStudentDTO{}
	if ws == nil || ws.PackageID == nil {
		return out
	}

	day, err := time.Parse("2006-01-02", date)
	if err != nil {
		return out
	}

	pkgIDs := s.slotPackageIDs(s.db, ws, day.Weekday().String())
	if len(pkgIDs) == 0 {
		return out
	}

	var rows []dto.MissedClassStudentDTO
	if err := s.db.Raw(`
		SELECT DISTINCT c.id AS customer_id,
		       c.nickname,
		       TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS full_name
		FROM class_confirmations cc
		JOIN enrollments e ON e.id = cc.enrollment_id AND e.deleted_at IS NULL
		JOIN customers   c ON c.id = e.customer_id
		LEFT JOIN users  u ON u.id = c.user_id
		WHERE cc.deleted_at IS NULL
		  AND cc.status = ?
		  AND cc.class_date = ?::date
		  AND cc.schedule_start_time = ?
		  AND e.package_id IN ?
		ORDER BY c.nickname
	`, models.ClassConfirmationGoing, date, ws.StartTime, pkgIDs).Scan(&rows).Error; err != nil {
		log.Printf("[attendance] ดึงรายชื่อนักเรียนของคาบค้างไม่สำเร็จ: %v", err)
		return out
	}
	return rows
}

type coachDecision struct {
	status  models.AttendanceStatus
	remarks string
}

// ResolveMissedClass สร้างรอบเช็คชื่อ "ปิดแล้ว" ย้อนหลังให้คลาสที่ค้างอยู่
// พร้อมบันทึกสถานะของโค้ชทุกคนในคลาสตามที่แอดมินตัดสิน
//
// ─── ทำไมสร้างรอบเช็คชื่อ แทนที่จะเพิ่มฟิลด์ใหม่ในตารางงาน ───
//
// เพราะระบบนี้เจ็บมาแล้วสามรอบจากการมี "นิยามเดียวกันสองชุด" (ข้อ 1, 20, 21)
// การนับเงินอ่านจาก coach_attendances อยู่แล้ว ถ้าเพิ่มช่องทางที่สองสำหรับ
// ตัดสินว่าโค้ชได้เงินไหม จะกลายเป็นแหล่งความจริงที่สามที่ต้องคอยให้ตรงกัน
//
// ─── ทำไมไม่แตะนักเรียนเลย ───
//
// การปิดรอบตามปกติจะมาร์คนักเรียนที่ยืนยันว่าจะมาแล้วไม่มาเป็น "ขาดเรียน"
// แต่คาบนี้ไม่เคยมีการเช็คชื่อเกิดขึ้นจริง เราจึงไม่รู้ว่าใครมาหรือไม่มา
// การเดาแทนนักเรียนคือการสร้างประวัติเท็จในบันทึกที่นักเรียนเห็นได้
// เรื่องที่ต้องเคลียร์คือค่าจ้างโค้ช จึงแตะเฉพาะฝั่งโค้ช
func (s *AttendanceService) ResolveMissedClass(
	req dto.ResolveMissedClassRequest,
	adminUserID uint,
) (*dto.ResolveMissedClassResultDTO, error) {
	now := nowLocal()
	todayStr := now.Format("2006-01-02")

	var result dto.ResolveMissedClassResultDTO
	notify := make([]models.CoachAttendance, 0, len(req.Coaches))

	err := s.db.Transaction(func(tx *gorm.DB) error {
		var ws models.WorkSchedule
		if err := tx.First(&ws, req.WorkScheduleID).Error; err != nil {
			return ErrMissedClassNotFound
		}
		if ws.PackageID == nil {
			return ErrMissedClassLegacy
		}

		date := scheduleDateOnly(ws.Date)
		if date >= todayStr {
			return ErrMissedClassNotDue
		}
		day, perr := time.Parse("2006-01-02", date)
		if perr != nil {
			return fmt.Errorf("%w: วันที่ของตารางงานอ่านไม่ออก (%s)", ErrScheduleInvalid, ws.Date)
		}
		weekday := day.Weekday().String()

		assigned, err := s.slotCoachIDs(tx, &ws, date)
		if err != nil {
			return err
		}
		decisions, err := matchCoachDecisions(assigned, req.Coaches)
		if err != nil {
			return err
		}

		pkgIDs := s.slotPackageIDs(tx, &ws, weekday)
		if err := s.assertNoExistingSession(tx, &ws, date, pkgIDs); err != nil {
			return err
		}

		// รอบที่สร้างต้องชี้ "แพ็กเกจตัวแทน" ตัวเดียวกับที่ OpenSession ใช้
		// ไม่งั้นรอบนี้จะกลายเป็นรอบที่สองของคลาสเมื่อมีคนเปิดรอบปกติทีหลัง
		anchor := *ws.PackageID
		if a, aerr := classAnchorPackageID(tx, ws.CourseID, weekday, ws.StartTime, ws.EndTime); aerr == nil && a != nil {
			anchor = *a
		}

		closedAt := now
		closedBy := adminUserID
		session := models.AttendanceSession{
			PackageID:         anchor,
			SessionDate:       sessionDateValue(day),
			Status:            models.AttendanceSessionClosed,
			OpenedAt:          now,
			OpenedByUserID:    adminUserID,
			ClosedAt:          &closedAt,
			ClosedByUserID:    &closedBy,
			ScheduleStartTime: ws.StartTime,
			ScheduleEndTime:   ws.EndTime,
		}
		if err := tx.Create(&session).Error; err != nil {
			// unique (package_id, session_date) — มีคนชิงเปิดรอบระหว่างที่เราทำอยู่
			if isUniqueViolation(err) {
				return ErrMissedClassResolved
			}
			return errors.New("ไม่สามารถสร้างรอบเช็คชื่อย้อนหลังได้")
		}

		for _, coachID := range assigned {
			d := decisions[coachID]
			record := models.CoachAttendance{
				CoachID:             coachID,
				AttendanceSessionID: session.ID,
				WorkDate:            session.SessionDate,
				CheckInTime:         now,
				CheckInMethod:       models.CheckInMethodManual,
				Status:              d.status,
				Remarks:             d.remarks,
				IsScheduled:         true, // มาจากตารางงาน ถึงได้อยู่ในรายการค้าง
				RecordedByUserID:    &closedBy,
			}
			if err := tx.Create(&record).Error; err != nil {
				return errors.New("ไม่สามารถบันทึกสถานะการสอนของโค้ชได้")
			}
			notify = append(notify, record)

			if d.status == models.AttendanceStatusPresent {
				result.PresentCoachIDs = append(result.PresentCoachIDs, coachID)
			} else {
				result.AbsentCoachIDs = append(result.AbsentCoachIDs, coachID)
			}
		}

		result.SessionID = session.ID
		result.PackageID = session.PackageID
		result.Date = date
		result.StartTime = ws.StartTime
		result.EndTime = ws.EndTime
		return nil
	})

	if err != nil {
		return nil, err
	}

	// แจ้งหลัง commit — การแจ้งเตือนล้มเหลวต้องไม่ทำให้การเคลียร์ที่สำเร็จแล้วถูก rollback
	s.notifyMissedClassResolved(notify, result)

	return &result, nil
}

// slotCoachIDs คืนโค้ชทุกคนของคลาสนี้ (ไม่ซ้ำ) ตามนิยาม course + วัน + เวลา
// ตัวเดียวกับ classScheduleScope — คลาสเดียวกันต้องแปลว่าเหมือนกันทุกที่
func (s *AttendanceService) slotCoachIDs(tx *gorm.DB, ws *models.WorkSchedule, date string) ([]uint, error) {
	var rows []models.WorkSchedule
	if err := tx.Where("course_id = ? AND date = ? AND start_time = ? AND end_time = ?",
		ws.CourseID, date, ws.StartTime, ws.EndTime).
		Order("id ASC").Find(&rows).Error; err != nil {
		return nil, errors.New("ไม่สามารถดึงรายชื่อโค้ชของคาบนี้ได้")
	}

	seen := make(map[uint]bool, len(rows))
	ids := make([]uint, 0, len(rows))
	for _, r := range rows {
		if seen[r.CoachID] {
			continue
		}
		seen[r.CoachID] = true
		ids = append(ids, r.CoachID)
	}
	if len(ids) == 0 {
		return nil, ErrMissedClassNotFound
	}
	return ids, nil
}

// matchCoachDecisions บังคับว่าคำตัดสินที่ส่งมาต้องตรงกับรายชื่อโค้ชของคาบนั้น "พอดี"
//
// ⚠️ ขาดคนไหน คนนั้นจะได้เงินฟรี — กติกาการนับคาบคือ "ไม่มีแถว absent = ได้เงิน"
// การสร้างรอบขึ้นมาโดยไม่บันทึกสถานะของใครสักคน จึงเท่ากับจ่ายเงินให้เขาโดยไม่มีใครสั่ง
func matchCoachDecisions(
	assigned []uint,
	given []dto.ResolveMissedClassCoachReq,
) (map[uint]coachDecision, error) {
	inSlot := make(map[uint]bool, len(assigned))
	for _, id := range assigned {
		inSlot[id] = true
	}

	out := make(map[uint]coachDecision, len(given))
	for _, c := range given {
		status := models.AttendanceStatus(c.Status)
		if status != models.AttendanceStatusPresent && status != models.AttendanceStatusAbsent {
			return nil, ErrInvalidStatus
		}
		if !inSlot[c.CoachID] {
			return nil, fmt.Errorf("%w (โค้ช #%d ไม่ได้ถูกมอบหมายคาบนี้)", ErrMissedClassCoachSet, c.CoachID)
		}
		if _, dup := out[c.CoachID]; dup {
			return nil, fmt.Errorf("%w (โค้ช #%d ถูกส่งมาซ้ำ)", ErrMissedClassCoachSet, c.CoachID)
		}
		out[c.CoachID] = coachDecision{status: status, remarks: c.Remarks}
	}

	for _, id := range assigned {
		if _, ok := out[id]; !ok {
			return nil, fmt.Errorf("%w (ยังไม่ได้ระบุสถานะของโค้ช #%d)", ErrMissedClassCoachSet, id)
		}
	}
	return out, nil
}

// slotPackageIDs คืนแพ็กเกจทั้งหมดของคลาสนี้ อย่างน้อยต้องมีของตารางงานเองเสมอ
func (s *AttendanceService) slotPackageIDs(tx *gorm.DB, ws *models.WorkSchedule, weekday string) []uint {
	ids, err := classPackageIDs(tx, ws.CourseID, weekday, ws.StartTime, ws.EndTime)
	if err != nil {
		ids = nil
	}
	for _, id := range ids {
		if id == *ws.PackageID {
			return ids
		}
	}
	return append(ids, *ws.PackageID)
}

// assertNoExistingSession กันเคลียร์ทับรอบที่มีอยู่แล้ว
//
// รอบที่เปิดค้าง = ยังมีทางปกติให้เดิน (เข้าไปกดปิด) ไม่ควรสร้างรอบที่สองมาแข่ง
// รอบที่ปิดแล้ว = คาบนี้ไม่ได้ค้างตั้งแต่แรก การเคลียร์ซ้ำจะกลายเป็นสองรอบในคลาสเดียว
func (s *AttendanceService) assertNoExistingSession(
	tx *gorm.DB,
	ws *models.WorkSchedule,
	date string,
	pkgIDs []uint,
) error {
	dayEnd := "9999-12-31"
	if d, err := time.Parse("2006-01-02", date); err == nil {
		dayEnd = d.AddDate(0, 0, 1).Format("2006-01-02")
	}

	var existing []models.AttendanceSession
	if err := tx.Where("package_id IN ? AND session_date >= ? AND session_date < ?",
		pkgIDs, date, dayEnd).
		// ⚠️ ต้องกรองเวลาคาบด้วย ไม่ใช่แค่วัน — แพ็กเกจเดียวมีคาบหลายช่วงในวันเดียวกันได้
		Where("COALESCE(schedule_start_time, '') = '' OR (schedule_start_time = ? AND schedule_end_time = ?)",
			ws.StartTime, ws.EndTime).
		Find(&existing).Error; err != nil {
		return errors.New("ไม่สามารถตรวจรอบเช็คชื่อที่มีอยู่ได้")
	}

	for i := range existing {
		if existing[i].Status == models.AttendanceSessionOpen {
			return ErrMissedClassOpen
		}
	}
	if len(existing) > 0 {
		return ErrMissedClassResolved
	}
	return nil
}

// notifyMissedClassResolved บอกโค้ชว่ามีการบันทึกย้อนหลังเกิดขึ้นกับคาบของเขา
//
// จำเป็นเพราะแถวนี้กระทบค่าจ้างโดยตรงและโค้ชไม่ได้อยู่ตรงนั้นตอนแอดมินกด
// โค้ชต้องมีโอกาสทักท้วงถ้าถูกบันทึกว่าไม่ได้มาสอนทั้งที่มา
func (s *AttendanceService) notifyMissedClassResolved(
	records []models.CoachAttendance,
	result dto.ResolveMissedClassResultDTO,
) {
	for i := range records {
		r := &records[i]

		var coach models.Coach
		if err := s.db.Select("id", "user_id").First(&coach, r.CoachID).Error; err != nil || coach.UserID == 0 {
			continue
		}

		title := "บันทึกการสอนย้อนหลัง"
		tone := "success"
		body := fmt.Sprintf("คาบวันที่ %s เวลา %s-%s ถูกบันทึกว่ามาสอน และนับเป็นคาบที่ได้ค่าจ้าง",
			result.Date, result.StartTime, result.EndTime)
		if r.Status == models.AttendanceStatusAbsent {
			tone = "warning"
			body = fmt.Sprintf("คาบวันที่ %s เวลา %s-%s ถูกบันทึกว่าไม่ได้มาสอน คาบนี้จะไม่ถูกนับค่าจ้าง หากไม่ถูกต้องกรุณาแจ้งแอดมิน",
				result.Date, result.StartTime, result.EndTime)
		}

		CreateNotification(s.db, coach.UserID,
			"coach_missed_class",
			fmt.Sprintf("missed-class-%d-%d", result.SessionID, r.CoachID),
			title, body, "/coach/schedule", tone,
		)
	}
}
