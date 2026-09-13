package services

import (
	"errors"
	"fmt"
	"time"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
	"gorm.io/gorm"
)

const (
	notifTypeAttendanceCheckedIn     = "attendance_checked_in"
	notifTypeAttendanceStatusChanged = "attendance_status_changed"

	myAttendanceHref = "/customer/attendance"
)

// notifyCheckedIn แจ้งนักเรียนว่าเช็คชื่อสำเร็จ · เรียกหลัง commit เท่านั้น
func notifyCheckedIn(db *gorm.DB, userID uint, r *dto.CheckInResultDTO, courseName string) {
	body := fmt.Sprintf("%s • %s น. • เหลือ %d ครั้ง",
		courseName, r.CheckInTime.Format("02/01/2006 15:04"), r.RemainingSessions)

	CreateNotification(db, userID,
		notifTypeAttendanceCheckedIn,
		fmt.Sprintf("attendance-%d", r.AttendanceID),
		"เช็คชื่อเข้าเรียนสำเร็จ",
		body,
		myAttendanceHref,
		"success",
	)
}

// notifyAttendanceStatusChanged แจ้งนักเรียนเมื่อแอดมินแก้สถานะการเข้าเรียนย้อนหลัง · เรียกหลัง commit เท่านั้น
func notifyAttendanceStatusChanged(db *gorm.DB, attendanceID uint, status models.AttendanceStatus, remaining uint) {
	var record models.StudentAttendance
	if err := db.
		Preload("Enrollment", withDeleted).
		Preload("Enrollment.Package", withDeleted).
		Preload("Enrollment.Package.Course", withDeleted).
		Preload("AttendanceSession").
		First(&record, attendanceID).Error; err != nil || record.Enrollment == nil {
		return
	}

	var userID uint
	if record.UserID != nil {
		userID = *record.UserID
	} else if uid, err := ResolveUserID(db, record.Enrollment.CustomerID); err == nil {
		userID = uid
	}

	courseName := "คอร์สเรียน"
	if p := record.Enrollment.Package; p != nil && p.Course != nil {
		courseName = p.Course.CourseName
	}

	classDate := record.CheckInTime
	if record.AttendanceSession != nil {
		classDate = record.AttendanceSession.SessionDate
	}

	label, tone := "มาเรียน", "success"
	if status == models.AttendanceStatusAbsent {
		label, tone = "ขาดเรียน", "warning"
	}

	CreateNotification(db, userID,
		notifTypeAttendanceStatusChanged,
		// แก้กลับไปกลับมาได้หลายครั้ง ต้องแจ้งทุกครั้ง จึงใส่เวลาในลายเซ็น
		fmt.Sprintf("attendance-%d-%s-%d", attendanceID, status, time.Now().UnixNano()),
		"แก้ไขสถานะการเข้าเรียน",
		fmt.Sprintf("%s วันที่ %s • เปลี่ยนเป็น \"%s\" • เหลือ %d ครั้ง",
			courseName, classDate.Format("02/01/2006"), label, remaining),
		myAttendanceHref,
		tone,
	)
}

// GetMyHistory คืนประวัติการเข้าเรียนของนักเรียนเจ้าของ token พร้อมยอดสรุปทั้งหมด
func (s *AttendanceService) GetMyHistory(userID uint, limit, offset int) (*dto.MyAttendanceHistoryDTO, error) {
	customerID, err := ResolveCustomerID(s.db, userID)
	if err != nil {
		return nil, err
	}

	items, total, err := s.GetHistory(HistoryFilter{CustomerID: customerID, Limit: limit, Offset: offset})
	if err != nil {
		return nil, err
	}

	result := &dto.MyAttendanceHistoryDTO{
		Items: make([]dto.MyAttendanceItemDTO, 0, len(items)),
		Total: total,
	}
	for i := range items {
		it := &items[i]
		item := dto.MyAttendanceItemDTO{
			AttendanceID:      it.AttendanceID,
			CourseName:        it.CourseName,
			ScheduleStartTime: it.ScheduleStartTime,
			ScheduleEndTime:   it.ScheduleEndTime,
			Status:            it.Status,
			CheckInMethod:     it.CheckInMethod,
			CheckInTime:       it.CheckInTime,
			IsOffSchedule:     it.IsOffSchedule,
		}
		if it.SessionID != nil {
			date := it.SessionDate
			item.SessionDate = &date
		}
		result.Items = append(result.Items, item)
	}

	base, err := s.historyBaseQuery(HistoryFilter{CustomerID: customerID})
	if err != nil {
		return nil, err
	}
	var counts []struct {
		Status string
		Count  int64
	}
	if err := base.
		Select("student_attendances.status AS status, COUNT(*) AS count").
		Group("student_attendances.status").
		Scan(&counts).Error; err != nil {
		return nil, errors.New("ไม่สามารถสรุปประวัติการเข้าเรียนได้")
	}
	for _, c := range counts {
		switch models.AttendanceStatus(c.Status) {
		case models.AttendanceStatusPresent:
			result.PresentCount = c.Count
		case models.AttendanceStatusAbsent:
			result.AbsentCount = c.Count
		}
	}

	return result, nil
}
