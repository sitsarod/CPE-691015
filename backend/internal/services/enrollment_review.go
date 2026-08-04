package services

import (
	"time"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
)

// GetEnrollmentReview รวบรวมข้อมูลทั้งหมดที่แอดมินต้องใช้ตรวจสอบก่อนอนุมัติคำขอหนึ่งใบ
//
// แยกเป็น method ของตัวเองแทนที่จะยัดเข้า GetAllEnrollments เพราะต้อง query เพิ่มหลายรอบ
// ถ้ารวมไว้กับรายการทั้งหมดจะกลายเป็น N+1 query ทุกครั้งที่เปิดหน้าแอดมิน
func (s *EnrollmentService) GetEnrollmentReview(enrollmentID uint) (*dto.EnrollmentReviewDTO, error) {
	var enrollment models.Enrollment
	err := s.db.
		Preload("Customer").
		Preload("Customer.User").
		Preload("Package").
		Preload("Package.Course").
		Preload("Package.Schedules").
		First(&enrollment, enrollmentID).Error
	if err != nil {
		return nil, ErrEnrollmentNotFound
	}

	result := &dto.EnrollmentReviewDTO{
		Enrollment: dto.ReviewEnrollmentInfo{
			ID:                enrollment.ID,
			Status:            string(enrollment.Status),
			EnrollmentDate:    enrollment.EnrollmentDate,
			TotalSessions:     enrollment.TotalSessions,
			RemainingSessions: enrollment.RemainingSessions,
			BillingID:         enrollment.BillingID,
			WaitingDays:       daysSince(enrollment.EnrollmentDate),
		},
		OtherEnrollments: []dto.ReviewOtherEnrollment{},
	}

	// ─── ข้อมูลผู้สมัคร ───
	//
	// แมปทีละฟิลด์ ไม่ส่ง models.User/models.Customer ดิบ เพราะ User.Password
	// ยังใช้ tag json:"password" อยู่ ถ้าส่งดิบ bcrypt hash จะหลุดไปที่ browser แอดมิน
	var customerUserID uint
	if enrollment.Customer != nil {
		c := enrollment.Customer
		customerUserID = c.UserID

		info := dto.ReviewCustomerInfo{
			UserID:            c.UserID,
			CustomerID:        c.ID,
			Nickname:          c.Nickname,
			Phone:             c.PhoneNumber,
			Gender:            string(c.Gender),
			ParentEmail:       c.ParentEmail,
			ParentPhone:       c.ParentPhoneNumber,
			Status:            string(c.Status),
			FaceConsentStatus: string(c.FaceConsentStatus),
			MemberSince:       c.CreatedAt,
		}
		if info.FaceConsentStatus == "" {
			// แถวที่สร้างก่อน migration จะไม่มีค่าในคอลัมน์นี้ ถือว่ายังไม่เคยถาม
			info.FaceConsentStatus = string(models.FaceConsentUnknown)
		}
		if !c.BirthDate.IsZero() {
			birth := c.BirthDate
			info.BirthDate = &birth
			if age := ageAt(birth, time.Now()); age >= 0 {
				info.Age = &age
			}
		}
		if c.User != nil {
			info.FirstName = c.User.FirstName
			info.LastName = c.User.LastName
			info.Email = c.User.Email
		}
		result.Customer = info
	}

	// ─── ข้อมูลแพ็กเกจและที่นั่ง ───
	if enrollment.Package != nil {
		pkg := enrollment.Package

		schedules := make([]dto.PackageScheduleInfoDTO, 0, len(pkg.Schedules))
		for _, sch := range pkg.Schedules {
			schedules = append(schedules, dto.PackageScheduleInfoDTO{
				DayOfWeek: string(sch.DayOfWeek),
				StartTime: sch.StartTime,
				EndTime:   sch.EndTime,
			})
		}

		var activeCount, pendingCount int64
		s.db.Model(&models.Enrollment{}).
			Where("package_id = ? AND status = ?", pkg.ID, models.EnrollmentStatusActive).
			Count(&activeCount)
		s.db.Model(&models.Enrollment{}).
			Where("package_id = ? AND status = ?", pkg.ID, models.EnrollmentStatusPending).
			Count(&pendingCount)

		pkgInfo := dto.ReviewPackageInfo{
			ID:            pkg.ID,
			SessionsCount: pkg.SessionsCount,
			HoursCount:    pkg.HoursCount,
			Price:         pkg.Price,
			MaxSeats:      pkg.MaxSeats,
			ActiveCount:   uint(activeCount),
			PendingCount:  uint(pendingCount),
			// ตรงกับเงื่อนไขที่ ApproveEnrollment ใช้จริง (นับเฉพาะ active)
			SeatsLeft: int(pkg.MaxSeats) - int(activeCount),
			// เตือนล่วงหน้าว่าถ้าอนุมัติคำขอที่ค้างอยู่ทั้งหมดจะเกินที่นั่ง
			WouldExceedIfAllApproved: activeCount+pendingCount > int64(pkg.MaxSeats),
			Schedules:                schedules,
		}
		if pkg.Course != nil {
			pkgInfo.CourseID = pkg.Course.ID
			pkgInfo.CourseName = pkg.Course.CourseName
			pkgInfo.CourseStatus = string(pkg.Course.Status)
		}
		result.Package = pkgInfo
	}

	// ─── สถานะการเงิน ───
	//
	// billings.customer_id อ้าง users.id (ไม่ใช่ customers.id) จึงต้องใช้ค่าที่แปลงแล้ว
	if customerUserID != 0 {
		finance, err := s.summarizeBillings(customerUserID)
		if err != nil {
			return nil, err
		}
		result.Finance = *finance
	}

	// ─── ประวัติการสมัครคอร์สอื่น ───
	if enrollment.CustomerID != 0 {
		others, err := s.otherEnrollments(enrollment.CustomerID, enrollment.ID)
		if err != nil {
			return nil, err
		}
		result.OtherEnrollments = others
	}

	return result, nil
}

// summarizeBillings สรุปยอดบิลของผู้ใช้รายนี้ตามสถานะ
func (s *EnrollmentService) summarizeBillings(userID uint) (*dto.ReviewFinanceInfo, error) {
	var billings []models.Billing
	if err := s.db.Where("customer_id = ?", userID).Find(&billings).Error; err != nil {
		return nil, err
	}

	info := &dto.ReviewFinanceInfo{}
	now := time.Now()

	for _, b := range billings {
		switch b.Status {
		case models.StatusPaid:
			info.PaidCount++
			info.PaidAmount += b.Amount

		case models.StatusWaitCheck:
			info.WaitCheckCount++
			info.WaitCheckAmount += b.Amount

		default:
			// unfunded และ overdue นับรวมเป็น "ยังไม่ชำระ"
			info.UnpaidCount++
			info.UnpaidAmount += b.Amount

			// เช็คเกินกำหนดจาก due_date จริง ไม่ใช้คอลัมน์ status
			// เพราะระบบยังไม่มีงานที่คอยเลื่อน unfunded → overdue เมื่อเลยกำหนด
			if !b.DueDate.IsZero() && b.DueDate.Before(now) {
				info.OverdueCount++
				info.OverdueAmount += b.Amount
			}
		}
	}

	return info, nil
}

// otherEnrollments ดึงคำขอ/คอร์สอื่นของลูกค้าคนเดียวกัน (ไม่รวมใบที่กำลังตรวจ)
//
// customerID ที่รับเข้ามาคือ customers.id ตรงกับคอลัมน์ enrollments.customer_id
func (s *EnrollmentService) otherEnrollments(customerID uint, excludeID uint) ([]dto.ReviewOtherEnrollment, error) {
	var enrollments []models.Enrollment
	err := s.db.
		Preload("Package").
		Preload("Package.Course").
		Where("customer_id = ? AND id <> ?", customerID, excludeID).
		Order("enrollment_date DESC").
		Find(&enrollments).Error
	if err != nil {
		return nil, err
	}

	items := make([]dto.ReviewOtherEnrollment, 0, len(enrollments))
	for _, e := range enrollments {
		item := dto.ReviewOtherEnrollment{
			ID:                e.ID,
			SessionsCount:     e.TotalSessions,
			RemainingSessions: e.RemainingSessions,
			Status:            string(e.Status),
			EnrollmentDate:    e.EnrollmentDate,
		}
		if e.Package != nil && e.Package.Course != nil {
			item.CourseName = e.Package.Course.CourseName
		}
		items = append(items, item)
	}
	return items, nil
}

// ageAt คำนวณอายุเต็มปี ณ วันที่กำหนด
//
// เทียบเดือน/วันตรง ๆ ไม่ใช้ YearDay เพราะปีอธิกสุรทินทำให้ YearDay ของวันเดียวกัน
// ต่างกันหนึ่งวัน ซึ่งจะทำให้อายุคลาดเคลื่อนรอบวันเกิดพอดี
func ageAt(birth time.Time, at time.Time) int {
	age := at.Year() - birth.Year()

	// ยังไม่ถึงวันเกิดของปีนี้ → ลบออกหนึ่งปี
	if at.Month() < birth.Month() ||
		(at.Month() == birth.Month() && at.Day() < birth.Day()) {
		age--
	}
	return age
}

// daysSince จำนวนวันเต็มนับจากเวลาที่กำหนดถึงตอนนี้
func daysSince(t time.Time) int {
	if t.IsZero() {
		return 0
	}
	d := int(time.Since(t).Hours() / 24)
	if d < 0 {
		return 0
	}
	return d
}
