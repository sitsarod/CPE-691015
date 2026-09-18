package services

import (
	"errors"
	"fmt"
	"log"
	"time"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const courtFeeDueDays = 7

var (
	ErrCourtFeeBilled       = errors.New("ออกบิลค่าสนามของรอบนี้ไปแล้ว")
	ErrCourtFeeNotClosed    = errors.New("ต้องปิดรอบก่อนจึงจะออกบิลค่าสนามได้")
	ErrCourtFeeTotalInvalid = errors.New("ค่าสนามรวมต้องมากกว่า 0")
	ErrCourtFeeNotBilled    = errors.New("รอบนี้ยังไม่ได้ออกบิลค่าสนามผ่านหน้าเช็คชื่อ จึงยกเลิกไม่ได้")
	ErrCourtFeePaid         = errors.New("มีนักเรียนจ่ายหรือแนบสลิปค่าสนามของรอบนี้แล้ว จึงยกเลิกบิลทั้งรอบไม่ได้ — ต้องแก้บิลรายคนแทน")
	ErrCourtFeeNoPayers     = errors.New("รอบนี้ไม่มีคนมาเรียนหรือยืนยันไว้ จึงไม่มีใครต้องจ่ายค่าสนาม — ปิดรอบโดยไม่ออกบิลได้เลย")
)

type issuedBill struct {
	userID    uint
	billingID uint
	amount    float64
	desc      string
}

// BillCourtFee ออกบิลค่าสนามให้รอบที่ปิดไปแล้วแต่ยังไม่ได้ออกบิล
func (s *AttendanceService) BillCourtFee(sessionID, adminUserID uint, total float64) (*dto.AttendanceSessionDTO, error) {
	var issued []issuedBill
	err := s.db.Transaction(func(tx *gorm.DB) error {
		var err error
		issued, err = billCourtFeeTx(tx, sessionID, adminUserID, total)
		return err
	})
	if err != nil {
		return nil, err
	}

	notifyIssuedBills(s.db, issued)
	return s.GetSession(sessionID)
}

// CancelCourtFee ยกเลิกบิลค่าสนามทั้งรอบเพื่อออกใหม่ · ทำได้เฉพาะตอนยังไม่มีใครจ่ายหรือแนบสลิป
func (s *AttendanceService) CancelCourtFee(sessionID, adminUserID uint) (*dto.AttendanceSessionDTO, error) {
	err := s.db.Transaction(func(tx *gorm.DB) error {
		var session models.AttendanceSession
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&session, sessionID).Error; err != nil {
			return ErrSessionNotFound
		}
		if session.CourtFeeTotal == nil {
			return ErrCourtFeeNotBilled
		}

		var bills []models.Billing
		if err := tx.Where("attendance_session_id = ?", sessionID).Find(&bills).Error; err != nil {
			return errors.New("ไม่สามารถดึงบิลค่าสนามของรอบนี้ได้")
		}

		ids := make([]uint, 0, len(bills))
		for _, b := range bills {
			if b.Status == models.StatusPaid || b.Status == models.StatusWaitCheck {
				return ErrCourtFeePaid
			}
			ids = append(ids, b.ID)
		}

		if len(ids) > 0 {
			var pending int64
			if err := tx.Model(&models.PaymentItem{}).
				Joins("JOIN invoices ON invoices.id = payment_items.invoice_id").
				Where("payment_items.billing_id IN ? AND invoices.status = ?", ids, models.InvoicePending).
				Count(&pending).Error; err != nil {
				return errors.New("ไม่สามารถตรวจสอบสถานะใบแจ้งหนี้ของบิลค่าสนามได้")
			}
			if pending > 0 {
				return ErrCourtFeePaid
			}

			if err := tx.Delete(&models.Billing{}, ids).Error; err != nil {
				return errors.New("ไม่สามารถยกเลิกบิลค่าสนามได้")
			}
		}

		if err := tx.Model(&models.AttendanceSession{}).
			Where("id = ?", sessionID).
			Updates(map[string]any{
				"court_fee_total":  nil,
				"court_billed_at":  nil,
				"court_fee_source": "",
			}).Error; err != nil {
			return errors.New("ไม่สามารถยกเลิกสถานะออกบิลค่าสนามของรอบได้")
		}

		log.Printf("[court-fee] รอบ #%d: แอดมิน #%d ยกเลิกบิลค่าสนาม %d ใบ", sessionID, adminUserID, len(ids))
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.GetSession(sessionID)
}

// GetUnbilledCourtSessions คืนรอบที่ปิดแล้วแต่ยังไม่ได้ออกบิลค่าสนาม เฉพาะรอบที่มีคนต้องจ่าย
func (s *AttendanceService) GetUnbilledCourtSessions() ([]dto.UnbilledCourtSessionDTO, error) {
	items := []dto.UnbilledCourtSessionDTO{}
	if err := s.db.Table("attendance_sessions").
		Select(`attendance_sessions.id, attendance_sessions.session_date,
			attendance_sessions.schedule_start_time, attendance_sessions.schedule_end_time,
			attendance_sessions.closed_at, COALESCE(courses.course_name, '') AS course_name,
			COUNT(DISTINCT enrollments.customer_id) AS payer_count`).
		Joins("JOIN student_attendances ON student_attendances.attendance_session_id = attendance_sessions.id AND student_attendances.deleted_at IS NULL").
		Joins("JOIN enrollments ON enrollments.id = student_attendances.enrollment_id").
		Joins("LEFT JOIN packages ON packages.id = attendance_sessions.package_id").
		Joins("LEFT JOIN courses ON courses.id = packages.course_id").
		Where("attendance_sessions.deleted_at IS NULL AND attendance_sessions.status = ? AND attendance_sessions.court_billed_at IS NULL",
			models.AttendanceSessionClosed).
		Where("(student_attendances.status = ? OR (student_attendances.status = ? AND student_attendances.is_off_schedule = false))",
			models.AttendanceStatusPresent, models.AttendanceStatusAbsent).
		Group("attendance_sessions.id, courses.course_name").
		Order("attendance_sessions.session_date DESC, attendance_sessions.schedule_start_time DESC").
		Scan(&items).Error; err != nil {
		return nil, errors.New("ไม่สามารถดึงรายการรอบที่ยังไม่ได้ออกบิลค่าสนามได้")
	}
	return items, nil
}

// billCourtFeeTx หารค่าสนามรวมของคาบให้คนในรอบแล้วออกบิลรายคน · รอบต้องปิดแล้วและยังไม่เคยออกบิล
func billCourtFeeTx(tx *gorm.DB, sessionID, adminUserID uint, total float64) ([]issuedBill, error) {
	if total <= 0 {
		return nil, ErrCourtFeeTotalInvalid
	}

	var session models.AttendanceSession
	if err := tx.
		Preload("Package", withDeleted).
		Preload("Package.Course", withDeleted).
		First(&session, sessionID).Error; err != nil {
		return nil, ErrSessionNotFound
	}
	if session.Status != models.AttendanceSessionClosed {
		return nil, ErrCourtFeeNotClosed
	}

	now := nowLocal()

	// จองสิทธิ์ออกบิลก่อน กันแอดมินสองคนกดพร้อมกันแล้วนักเรียนโดนบิลซ้ำ
	claim := tx.Model(&models.AttendanceSession{}).
		Where("id = ? AND court_billed_at IS NULL", sessionID).
		Updates(map[string]any{
			"court_fee_total":  total,
			"court_billed_at":  now,
			"court_fee_source": models.CourtFeeSourceAttendance,
		})
	if claim.Error != nil {
		return nil, errors.New("ไม่สามารถบันทึกการออกบิลค่าสนามได้")
	}
	if claim.RowsAffected == 0 {
		return nil, ErrCourtFeeBilled
	}

	// ไม่มีคนจ่ายต้องล้มทั้ง transaction — ไม่งั้นรอบถูกบันทึกว่าออกบิลแล้วทั้งที่ไม่มีบิลสักใบ
	payers, err := courtFeePayers(tx, sessionID)
	if err != nil {
		return nil, err
	}
	if len(payers) == 0 {
		return nil, ErrCourtFeeNoPayers
	}

	billingTypeID, err := billingTypeIDByName(tx, billingTypeCourtFee)
	if err != nil {
		return nil, err
	}

	perHead := splitPerHead(total, len(payers))
	desc := courtFeeDescription(&session)
	dueDate := endOfLocalDay(now.AddDate(0, 0, courtFeeDueDays))

	issued := make([]issuedBill, 0, len(payers))
	for _, userID := range payers {
		billing := models.Billing{
			Description:         desc,
			Amount:              perHead,
			DueDate:             dueDate,
			Status:              models.StatusUnfunded,
			BillingTypeID:       billingTypeID,
			CustomerID:          userID,
			AdminID:             &adminUserID,
			AttendanceSessionID: &sessionID,
		}
		if err := tx.Create(&billing).Error; err != nil {
			return nil, errors.New("ไม่สามารถออกบิลค่าสนามได้")
		}
		issued = append(issued, issuedBill{userID: userID, billingID: billing.ID, amount: perHead, desc: desc})
	}

	log.Printf("[court-fee] รอบ #%d: ค่าสนามรวม %.2f บาท หาร %d คน = คนละ %.0f บาท",
		sessionID, total, len(payers), perHead)
	return issued, nil
}

// courtFeePayers คืน users.id ของคนที่ต้องจ่ายค่าสนามในรอบนี้ (มาเรียน หรือยืนยันแล้วไม่มา) ไม่ซ้ำกัน
func courtFeePayers(tx *gorm.DB, sessionID uint) ([]uint, error) {
	var rows []struct {
		UserID     *uint
		CustomerID uint
	}
	if err := tx.Model(&models.StudentAttendance{}).
		Select("student_attendances.user_id, enrollments.customer_id").
		Joins("JOIN enrollments ON enrollments.id = student_attendances.enrollment_id").
		Where("student_attendances.attendance_session_id = ?", sessionID).
		Where("(student_attendances.status = ? OR (student_attendances.status = ? AND student_attendances.is_off_schedule = false))",
			models.AttendanceStatusPresent, models.AttendanceStatusAbsent).
		Scan(&rows).Error; err != nil {
		return nil, errors.New("ไม่สามารถดึงรายชื่อคนที่ต้องจ่ายค่าสนามได้")
	}

	seen := make(map[uint]bool, len(rows))
	payers := make([]uint, 0, len(rows))
	for _, r := range rows {
		var userID uint
		if r.UserID != nil {
			userID = *r.UserID
		} else if uid, err := ResolveUserID(tx, r.CustomerID); err == nil {
			userID = uid
		}
		if userID == 0 || seen[userID] {
			continue
		}
		seen[userID] = true
		payers = append(payers, userID)
	}
	return payers, nil
}

func courtFeeDescription(session *models.AttendanceSession) string {
	courseName := "คอร์สเรียน"
	if session.Package != nil && session.Package.Course != nil {
		courseName = session.Package.Course.CourseName
	}
	return fmt.Sprintf("ค่าสนาม %s วันที่ %s เวลา %s-%s",
		courseName, session.SessionDate.Format("02/01/2006"),
		session.ScheduleStartTime, session.ScheduleEndTime)
}

func notifyIssuedBills(db *gorm.DB, issued []issuedBill) {
	for _, b := range issued {
		notifyBillIssued(db, b.userID, b.billingID, b.amount, b.desc)
	}
}

// courseDaySessions คืน query ของรอบเช็คชื่อทุกรอบของคอร์สในช่วงวันที่ระบุ
func courseDaySessions(db *gorm.DB, courseID uint, from, to time.Time) *gorm.DB {
	return db.Model(&models.AttendanceSession{}).
		Where("package_id IN (?)", db.Unscoped().Model(&models.Package{}).Select("id").Where("course_id = ?", courseID)).
		Where("session_date >= ? AND session_date < ?", from, to)
}

// MarkLegacyCourtFeeSessions ปิดสถานะออกบิลให้รอบที่ปิดไปก่อนมีระบบค่าสนาม ไม่ให้ค้างในรายการรอออกบิล
func MarkLegacyCourtFeeSessions(db *gorm.DB) error {
	res := db.Model(&models.AttendanceSession{}).
		Where("status = ? AND court_billed_at IS NULL", models.AttendanceSessionClosed).
		Updates(map[string]any{
			"court_billed_at":  gorm.Expr("COALESCE(closed_at, updated_at)"),
			"court_fee_source": models.CourtFeeSourceLegacy,
		})
	if res.Error != nil {
		return fmt.Errorf("ปิดสถานะออกบิลค่าสนามของรอบเก่าไม่สำเร็จ: %w", res.Error)
	}
	if res.RowsAffected > 0 {
		log.Printf("[court-fee] รอบที่ปิดไปก่อนมีระบบค่าสนาม %d รอบ ถูกนับว่าออกบิลแล้ว", res.RowsAffected)
	}
	return nil
}

// BackfillCourtFeeSource เติมที่มาของการออกบิลให้รอบที่บันทึกไว้ก่อนมีคอลัมน์ court_fee_source
func BackfillCourtFeeSource(db *gorm.DB) error {
	blank := "court_billed_at IS NOT NULL AND (court_fee_source IS NULL OR court_fee_source = '')"

	if err := db.Model(&models.AttendanceSession{}).
		Where(blank).Where("court_fee_total IS NOT NULL").
		Update("court_fee_source", models.CourtFeeSourceAttendance).Error; err != nil {
		return fmt.Errorf("เติมที่มาของบิลค่าสนามไม่สำเร็จ: %w", err)
	}

	res := db.Model(&models.AttendanceSession{}).
		Where(blank).Where("court_fee_total IS NULL").
		Update("court_fee_source", models.CourtFeeSourceLegacy)
	if res.Error != nil {
		return fmt.Errorf("เติมที่มาของบิลค่าสนามไม่สำเร็จ: %w", res.Error)
	}
	if res.RowsAffected > 0 {
		log.Printf("[court-fee] รอบที่ออกบิลแล้วแต่ไม่มียอดรวม %d รอบ ถูกนับเป็นรอบเก่า (ออกบิลย้อนหลังด้วยฟอร์มหารเฉลี่ยได้)", res.RowsAffected)
	}
	return nil
}
