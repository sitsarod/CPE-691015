package services

import (
	"errors"
	"strings"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
	"gorm.io/gorm"
)

func (s *AttendanceService) LookupByQR(sessionID uint, qrCode string) (*dto.ScanResultDTO, error) {
	session, err := s.loadOpenSession(s.db, sessionID)
	if err != nil {
		return nil, err
	}

	ctx, err := s.resolveByQR(s.db, session, qrCode)
	if err != nil {
		return nil, err
	}

	result := &dto.ScanResultDTO{
		EnrollmentID:      ctx.Enrollment.ID,
		FullName:          ctx.FullName,
		Nickname:          ctx.Nickname,
		CourseName:        ctx.CourseName,
		TotalSessions:     ctx.Enrollment.TotalSessions,
		RemainingSessions: ctx.Enrollment.RemainingSessions,
		IsConfirmed:       ctx.Confirmed,
		CanCheckIn:        true,
	}

	if err := s.checkQuotaAndDuplicate(s.db, ctx); err != nil {
		result.CanCheckIn = false
		result.Reason = err.Error()
	}

	return result, nil
}

// เครื่องคีออสตัวเดียวรับ QR ทั้งนักเรียนและโค้ช — แยกทางที่นี่
// (โค้ชไม่มี enrollment ไม่มีโควตา จึงไม่ยัดรวมเข้า checkIn ตัวเดียวกัน)
//
// ⚠️ ต้องถามว่าเป็น QR โค้ชไหม "ก่อน" เข้าเส้นทางนักเรียน
// เพราะ checkIn ผ่านด่านรอบเปิด/เวลาเรียนก่อนจะไปหาว่า QR เป็นของใคร
// ดักทีหลังจะได้ error "เลยเวลาเช็คชื่อ" ซึ่งกลบสาเหตุจริง
func (s *AttendanceService) CheckInByQR(sessionID uint, qrCode string) (*dto.ScanCheckInDTO, error) {
	if coach, err := s.findCoachByQR(qrCode); err == nil {
		result, err := s.checkInCoach(sessionID, coach)
		if err != nil {
			return nil, err
		}
		return &dto.ScanCheckInDTO{Kind: dto.ScanKindCoach, Coach: result}, nil
	} else if !errors.Is(err, ErrCoachQRNotFound) {
		return nil, err
	}

	student, err := s.checkIn(sessionID, func(tx *gorm.DB, session *models.AttendanceSession) (*scanContext, error) {
		return s.resolveByQR(tx, session, qrCode)
	}, models.CheckInMethodQRCode, "", nil, nil)
	if err != nil {
		return nil, err
	}
	return &dto.ScanCheckInDTO{Kind: dto.ScanKindStudent, Student: student}, nil
}

// ManualCheckIn บันทึกให้โดยแอดมิน สำหรับกรณีนักเรียนลืมเอา QR มา
func (s *AttendanceService) ManualCheckIn(
	sessionID uint,
	enrollmentID uint,
	adminUserID uint,
	remarks string,
) (*dto.CheckInResultDTO, error) {
	return s.checkIn(sessionID, func(tx *gorm.DB, session *models.AttendanceSession) (*scanContext, error) {
		return s.resolveByEnrollment(tx, session, enrollmentID)
	}, models.CheckInMethodManual, strings.TrimSpace(remarks), &adminUserID, nil)
}

// checkInExtra คือข้อมูลที่มีเฉพาะบางวิธีเช็คชื่อ
//
// ห่อเป็น struct แทนการเพิ่มพารามิเตอร์เรื่อย ๆ จนอ่านไม่ออกว่าค่าไหนคืออะไร
// ตอนนี้มีฟิลด์เดียวเพราะเลือกไม่เก็บภาพ snapshot (เก็บแค่คะแนนความมั่นใจ)
type checkInExtra struct {
	ConfidenceScore float64
}

func (s *AttendanceService) checkIn(
	sessionID uint,
	resolve func(tx *gorm.DB, session *models.AttendanceSession) (*scanContext, error),
	method models.CheckInMethod,
	remarks string,
	recordedBy *uint,
	extra *checkInExtra, // nil สำหรับ QR/manual ที่ไม่มีคะแนนความมั่นใจ
) (*dto.CheckInResultDTO, error) {
	var result dto.CheckInResultDTO
	var studentUserIDForNotify uint
	var courseName string

	err := s.db.Transaction(func(tx *gorm.DB) error {
		session, err := s.loadOpenSession(tx, sessionID)
		if err != nil {
			return err
		}

		ctx, err := resolve(tx, session)
		if err != nil {
			return err
		}

		if err := s.checkQuotaAndDuplicate(tx, ctx); err != nil {
			return err
		}

		now := nowLocal()
		sessionIDVal := session.ID

		var studentUserID *uint
		if uid, err := ResolveUserID(tx, ctx.Enrollment.CustomerID); err == nil {
			studentUserID = &uid
			studentUserIDForNotify = uid
		}
		courseName = ctx.CourseName

		record := models.StudentAttendance{
			CheckInTime:         now,
			CheckInMethod:       method,
			Status:              models.AttendanceStatusPresent,
			IsOffSchedule:       !ctx.Confirmed,
			Remarks:             remarks,
			EnrollmentID:        ctx.Enrollment.ID,
			UserID:              studentUserID,
			AttendanceSessionID: &sessionIDVal,
			RecordedByUserID:    recordedBy,
		}
		if extra != nil {
			// เก็บทุกครั้งแม้ครั้งที่คะแนนไม่สูงนัก เพราะต้องใช้ calibrate threshold
			// จากข้อมูลจริงทีหลัง (แผนข้อ 5.3)
			record.ConfidenceScore = extra.ConfidenceScore
		}

		if err := tx.Create(&record).Error; err != nil {
			if isUniqueViolation(err) {
				return ErrAlreadyCheckedIn
			}
			return errors.New("ไม่สามารถบันทึกการเช็คชื่อได้")
		}

		if err := deductSession(tx, ctx.Enrollment.ID); err != nil {
			return err
		}
		remaining := ctx.Enrollment.RemainingSessions - 1
		var fresh models.Enrollment
		if err := tx.Select("remaining_sessions").First(&fresh, ctx.Enrollment.ID).Error; err == nil {
			remaining = fresh.RemainingSessions
		}

		result = dto.CheckInResultDTO{
			AttendanceID:      record.ID,
			EnrollmentID:      ctx.Enrollment.ID,
			FullName:          ctx.FullName,
			Nickname:          ctx.Nickname,
			CheckInMethod:     string(method),
			CheckInTime:       now,
			IsOffSchedule:     record.IsOffSchedule,
			RemainingSessions: remaining,
		}
		return nil
	})

	if err != nil {
		return nil, err
	}

	notifyCheckedIn(s.db, studentUserIDForNotify, &result, courseName)
	return &result, nil
}

// deductSession หักครั้งคงเหลือ 1 ครั้ง และปิดใบเป็น completed ถ้าเป็นครั้งสุดท้าย
func deductSession(tx *gorm.DB, enrollmentID uint) error {
	res := tx.Model(&models.Enrollment{}).
		Where("id = ? AND remaining_sessions > 0", enrollmentID).
		UpdateColumns(map[string]interface{}{
			"remaining_sessions": gorm.Expr("remaining_sessions - 1"),
			// ค่าใน SET อ่านจากแถวก่อนอัปเดตเสมอ จึงต้องลบเองอีกครั้งในเงื่อนไข
			"status": gorm.Expr("CASE WHEN remaining_sessions - 1 = 0 AND status = ? THEN ? ELSE status END",
				models.EnrollmentStatusActive, models.EnrollmentStatusCompleted),
		})
	if res.Error != nil {
		return errors.New("ไม่สามารถหักจำนวนครั้งคงเหลือได้")
	}
	if res.RowsAffected == 0 {
		return ErrNoSessionsLeft
	}
	return nil
}

// refundSession คืนครั้งคงเหลือ 1 ครั้ง และเปิดใบที่ปิดไปเพราะครั้งหมดกลับมา
func refundSession(tx *gorm.DB, enrollmentID uint) error {
	res := tx.Model(&models.Enrollment{}).
		Where("id = ? AND remaining_sessions < total_sessions", enrollmentID).
		UpdateColumns(map[string]interface{}{
			"remaining_sessions": gorm.Expr("remaining_sessions + 1"),
			"status": gorm.Expr("CASE WHEN status = ? THEN ? ELSE status END",
				models.EnrollmentStatusCompleted, models.EnrollmentStatusActive),
		})
	if res.Error != nil {
		return errors.New("ไม่สามารถคืนจำนวนครั้งคงเหลือได้")
	}

	expireStaleEnrollments(tx)
	return nil
}
