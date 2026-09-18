package services

import (
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"CPE-691015/internal/models"
)

// confirmReminderHour = เวลาส่งเตือนยืนยันมาเรียนของทุกวัน (เตือนคาบของวันพรุ่งนี้)
const confirmReminderHour = 18

const notifTypeClassConfirmReminder = "class_confirm_reminder"

var thaiWeekdays = [...]string{"อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"}

// NextConfirmReminderAt คืนเวลาส่งเตือนรอบถัดไปหลังจาก now
func NextConfirmReminderAt(now time.Time) time.Time {
	local := now.In(appLocation())
	next := time.Date(local.Year(), local.Month(), local.Day(), confirmReminderHour, 0, 0, 0, local.Location())
	if !next.After(local) {
		next = next.AddDate(0, 0, 1)
	}
	return next
}

// ConfirmReminderPassedToday บอกว่าเลยเวลาส่งเตือนของวันนี้แล้วหรือยัง
func ConfirmReminderPassedToday(now time.Time) bool {
	return now.In(appLocation()).Hour() >= confirmReminderHour
}

// NotifyPendingConfirmations เตือนนักเรียนที่ยังไม่ยืนยันคาบของวันพรุ่งนี้ · รวมเป็นแจ้งเตือนเดียวต่อคนต่อวัน
func (s *ClassConfirmationService) NotifyPendingConfirmations() error {
	var enrollments []models.Enrollment
	if err := s.db.
		Preload("Customer").
		Preload("Package").
		Preload("Package.Course").
		Preload("Package.Schedules").
		Where("status = ?", models.EnrollmentStatusActive).
		Find(&enrollments).Error; err != nil {
		return errors.New("ไม่สามารถดึงใบลงทะเบียนที่กำลังเรียนได้")
	}
	if len(enrollments) == 0 {
		return nil
	}

	now := nowLocal()
	tomorrow := horizonDates(now, 2)[1]
	weekday := tomorrow.Weekday().String()

	ids := make([]uint, 0, len(enrollments))
	for i := range enrollments {
		ids = append(ids, enrollments[i].ID)
	}
	answered, err := s.loadAnswers(ids, tomorrow, tomorrow)
	if err != nil {
		return err
	}

	// นักเรียนหนึ่งคนอาจมีหลายใบในคาบเดียวกัน — รวมเป็นคาบเดียว ยืนยันใบไหนก็นับว่ายืนยันแล้ว
	type classKey struct {
		customerID uint
		courseID   uint
		start, end string
	}
	type upcomingClass struct {
		userID     uint
		courseName string
		start, end string
		deadline   time.Time
		confirmed  bool
	}

	classes := make(map[classKey]*upcomingClass)
	for i := range enrollments {
		e := &enrollments[i]
		if e.Package == nil || e.Customer == nil || !canAttend(e, tomorrow) {
			continue
		}

		for _, sch := range e.Package.Schedules {
			if string(sch.DayOfWeek) != weekday {
				continue
			}

			key := classKey{customerID: e.CustomerID, courseID: e.Package.CourseID, start: sch.StartTime, end: sch.EndTime}
			c, ok := classes[key]
			if !ok {
				c = &upcomingClass{
					userID:   e.Customer.UserID,
					start:    sch.StartTime,
					end:      sch.EndTime,
					deadline: classConfirmDeadline(tomorrow, sch.StartTime),
				}
				if e.Package.Course != nil {
					c.courseName = e.Package.Course.CourseName
				}
				classes[key] = c
			}

			if st, ok := answered[keyOf(e.ID, tomorrow, sch.StartTime)]; ok && st == models.ClassConfirmationGoing {
				c.confirmed = true
			}
		}
	}

	pendingByCustomer := make(map[uint][]*upcomingClass)
	for key, c := range classes {
		if c.confirmed || !now.Before(c.deadline) {
			continue
		}
		pendingByCustomer[key.customerID] = append(pendingByCustomer[key.customerID], c)
	}

	dateLabel := fmt.Sprintf("วัน%s ที่ %s", thaiWeekdays[tomorrow.Weekday()], tomorrow.Format("02/01"))

	for customerID, pending := range pendingByCustomer {
		sort.Slice(pending, func(a, b int) bool { return pending[a].start < pending[b].start })

		parts := make([]string, 0, len(pending))
		for _, c := range pending {
			parts = append(parts, fmt.Sprintf("%s %s-%s", c.courseName, c.start, c.end))
		}

		// คาบแรกของวันปิดรับก่อนเสมอ ใช้เป็นเส้นตายที่บอกนักเรียน
		body := fmt.Sprintf("พรุ่งนี้ %s มีคาบที่ยังไม่ได้ยืนยัน: %s • กดยืนยันก่อน %s น. เพื่อให้โรงเรียนจองสนาม",
			dateLabel, strings.Join(parts, ", "), pending[0].deadline.Format("15:04"))

		CreateNotification(s.db, pending[0].userID,
			notifTypeClassConfirmReminder,
			fmt.Sprintf("class-confirm-%d-%s", customerID, tomorrow.Format("2006-01-02")),
			"อย่าลืมยืนยันการมาเรียนพรุ่งนี้",
			body,
			"/customer/enrollment",
			"warning",
		)
	}
	return nil
}
