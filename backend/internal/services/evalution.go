package services

import (
	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
	"errors"
	"gorm.io/gorm"
)

type EvaluationService struct {
	db *gorm.DB
}

func NewEvaluationService(db *gorm.DB) *EvaluationService {
	return &EvaluationService{db: db}
}

// ErrCustomerNotEnrolledWithCoach ใช้เมื่อโค้ชพยายามประเมิน/ดูข้อมูลนักเรียนที่ไม่ได้ลงทะเบียน
// เรียนกับคอร์สของโค้ชคนนี้ — กันโค้ชคนหนึ่งยุ่งกับนักเรียนของโค้ชคนอื่น
var ErrCustomerNotEnrolledWithCoach = errors.New("นักเรียนคนนี้ยังไม่ได้ลงทะเบียนเรียนกับโค้ชคนนี้ จึงยังทำรายการนี้ไม่ได้")

// enrolledEvaluableStatuses = สถานะ enrollment ที่นับว่า "ลงทะเบียนแล้ว" สำหรับการประเมิน
//
// ไม่รวม awaiting_payment เพราะนักเรียนยังไม่เริ่มเรียนจริง ไม่มีอะไรให้ประเมิน
var enrolledEvaluableStatuses = []models.EnrollmentStatus{
	models.EnrollmentStatusActive,
	models.EnrollmentStatusCompleted,
}

// customerEnrolledWithCoachID ตรวจว่านักเรียน (customerID) เคยลงทะเบียนเรียนคอร์สที่โค้ชคนนี้สอนจริง
// ไล่ผ่าน Enrollment -> Package -> Course -> WorkSchedule.CoachID
//
// ⚠️ Course.UserID คือแอดมินที่สร้างคอร์ส "ไม่ใช่" โค้ชที่สอน (ดูคอมเมนต์ (C2) ใน
// controllers/course.go) ความเชื่อมโยงคอร์ส -> โค้ชตัวจริงมาจากตาราง work_schedules
// เท่านั้น — รูปแบบเดียวกับที่ใช้ใน reviewService.GetCourseCoaches
//
// coachID ที่รับเข้ามาคือ coaches.id (ไม่ใช่ users.id) ผู้เรียกต้อง resolve มาก่อน
func (s *EvaluationService) customerEnrolledWithCoachID(coachID, customerID uint) error {
	var count int64
	err := s.db.Model(&models.Enrollment{}).
		Joins("JOIN packages ON packages.id = enrollments.package_id").
		Joins("JOIN work_schedules ON work_schedules.course_id = packages.course_id AND work_schedules.deleted_at IS NULL").
		Where("enrollments.customer_id = ?", customerID).
		Where("work_schedules.coach_id = ?", coachID).
		Where("enrollments.status IN ?", enrolledEvaluableStatuses).
		Count(&count).Error
	if err != nil {
		return err
	}
	if count == 0 {
		return ErrCustomerNotEnrolledWithCoach
	}
	return nil
}

// VerifyCoachCanAccessStudent ตรวจว่าโค้ชคนนี้ (userID จาก JWT) มีสิทธิ์เข้าถึงประวัติการประเมินของนักเรียนคนนี้
// (ต้องเป็นนักเรียนที่ลงทะเบียนเรียนคอร์สที่โค้ชคนนี้สอนจริง)
func (s *EvaluationService) VerifyCoachCanAccessStudent(coachUserID, customerID uint) error {
	coachID, err := resolveCoachIDByUser(s.db, coachUserID)
	if err != nil {
		return ErrCustomerNotEnrolledWithCoach
	}
	return s.customerEnrolledWithCoachID(coachID, customerID)
}

// CreateEvaluation บันทึกการประเมินนักเรียนโดยโค้ช
func (s *EvaluationService) CreateEvaluation(coachUserID uint, req dto.CreateEvaluationRequest) (*models.Evaluation, error) {
	// 1. ตรวจสอบว่าโค้ชมีจริงหรือไม่
	var coach models.Coach
	if err := s.db.Where("user_id = ?", coachUserID).First(&coach).Error; err != nil {
		return nil, errors.New("ไม่พบข้อมูลโค้ชผู้ทำการประเมิน")
	}

	// 2. ตรวจสอบว่านักเรียน (Customer) มีจริงหรือไม่
	var customer models.Customer
	if err := s.db.First(&customer, req.CustomerID).Error; err != nil {
		return nil, errors.New("ไม่พบข้อมูลนักเรียนที่ต้องการประเมิน")
	}

	// 3. ตรวจสอบว่านักเรียนคนนี้ลงทะเบียนเรียนกับโค้ชคนนี้จริง (กันโค้ชประเมินนักเรียนที่ไม่ใช่ลูกศิษย์ตัวเอง)
	if err := s.customerEnrolledWithCoachID(coach.ID, req.CustomerID); err != nil {
		return nil, err
	}

	evaluation := models.Evaluation{
		CustomerID: req.CustomerID,
		CoachID:    coach.ID,
		Assessment: req.Assessment,
		VideoURL:   req.VideoURL,
	}

	if err := s.db.Create(&evaluation).Error; err != nil {
		return nil, errors.New("ไม่สามารถบันทึกข้อมูลการประเมินได้")
	}

	// Preload ความสัมพันธ์
	if err := s.db.Preload("Customer").Preload("Customer.User").Preload("Coach").Preload("Coach.User").First(&evaluation, evaluation.ID).Error; err != nil {
		return nil, err
	}

	return &evaluation, nil
}

// GetMyStudents ดึงรายชื่อนักเรียนที่ลงทะเบียนเรียนกับโค้ชคนนี้อยู่จริง (สำหรับให้เลือกประเมิน)
// ใช้ enrolledEvaluableStatuses ชุดเดียวกับตอนสร้าง/ดูการประเมิน เพื่อให้รายชื่อตรงกับสิทธิ์จริง
//
// courseID = nil คือทุกคอร์สที่โค้ชคนนี้สอนอยู่รวมกัน (พฤติกรรมเดิม) — ระบุมาเพื่อกรองเฉพาะคอร์สเดียว
// เช่นตอนแท็กนักเรียนในรูป/วิดีโอที่ผูกกับคาบเรียนคาบเดียว ไม่อยากให้รายชื่อปนกันทุกคอร์ส
func (s *EvaluationService) GetMyStudents(coachUserID uint, courseID *uint) ([]models.Customer, error) {
	coachID, err := resolveCoachIDByUser(s.db, coachUserID)
	if err != nil {
		return nil, errors.New("ไม่พบข้อมูลโค้ช")
	}

	query := s.db.
		Joins("JOIN enrollments ON enrollments.customer_id = customers.id").
		Joins("JOIN packages ON packages.id = enrollments.package_id").
		Joins("JOIN work_schedules ON work_schedules.course_id = packages.course_id AND work_schedules.deleted_at IS NULL").
		Where("work_schedules.coach_id = ?", coachID).
		Where("enrollments.status IN ?", enrolledEvaluableStatuses)

	if courseID != nil {
		// packages.course_id ต้องตรงกับที่ขอมา "และ" ยังอยู่ในเงื่อนไข work_schedules.coach_id = coachID
		// ด้านบนด้วย จึงขอรายชื่อคอร์สที่ตัวเองไม่ได้สอนไม่ได้ (กัน IDOR โดยตัว query เอง)
		query = query.Where("packages.course_id = ?", *courseID)
	}

	var customers []models.Customer
	if err := query.Group("customers.id").Find(&customers).Error; err != nil {
		return nil, errors.New("ไม่สามารถดึงรายชื่อนักเรียนได้")
	}
	return customers, nil
}

// GetMyCourses คืนคอร์สที่โค้ชคนนี้มีตารางสอนอยู่จริง (ผ่าน work_schedules) — ใช้ให้เลือกก่อนดูรายชื่อ
// นักเรียนแยกตามคอร์ส (เช่นตอนแท็กนักเรียนในรูป/วิดีโอ) กันรายชื่อทุกคอร์สปนกันเป็นก้อนเดียว
func (s *EvaluationService) GetMyCourses(coachUserID uint) ([]models.Course, error) {
	coachID, err := resolveCoachIDByUser(s.db, coachUserID)
	if err != nil {
		return nil, errors.New("ไม่พบข้อมูลโค้ช")
	}

	var courses []models.Course
	err = s.db.
		Joins("JOIN work_schedules ON work_schedules.course_id = courses.id AND work_schedules.deleted_at IS NULL").
		Where("work_schedules.coach_id = ?", coachID).
		Group("courses.id").
		Find(&courses).Error
	if err != nil {
		return nil, errors.New("ไม่สามารถดึงรายชื่อคอร์สได้")
	}
	return courses, nil
}

// GetEvaluationsByStudentID ดึงข้อมูลการประเมินของนักเรียนคนนั้นๆ (CustomerID)
func (s *EvaluationService) GetEvaluationsByStudentID(customerID uint) ([]models.Evaluation, error) {
	var evaluations []models.Evaluation
	if err := s.db.Where("customer_id = ?", customerID).
		Preload("Coach").
		Preload("Coach.User").
		Order("created_at DESC").
		Find(&evaluations).Error; err != nil {
		return nil, errors.New("ไม่สามารถดึงข้อมูลการประเมินได้")
	}
	return evaluations, nil
}

// GetEvaluationsByCoachUserID ดึงข้อมูลการประเมินทั้งหมดที่โค้ชคนนี้เป็นคนทำ
func (s *EvaluationService) GetEvaluationsByCoachUserID(coachUserID uint) ([]models.Evaluation, error) {
	var coach models.Coach
	if err := s.db.Where("user_id = ?", coachUserID).First(&coach).Error; err != nil {
		return nil, errors.New("ไม่พบข้อมูลโค้ช")
	}

	var evaluations []models.Evaluation
	if err := s.db.Where("coach_id = ?", coach.ID).
		Preload("Customer").
		Preload("Customer.User").
		Order("created_at DESC").
		Find(&evaluations).Error; err != nil {
		return nil, errors.New("ไม่สามารถดึงข้อมูลการประเมินได้")
	}
	return evaluations, nil
}

// DeleteEvaluation ลบข้อมูลการประเมิน
func (s *EvaluationService) DeleteEvaluation(id uint) error {
	var evaluation models.Evaluation
	if err := s.db.First(&evaluation, id).Error; err != nil {
		return errors.New("ไม่พบข้อมูลการประเมินที่ต้องการลบ")
	}

	if err := s.db.Delete(&evaluation).Error; err != nil {
		return errors.New("ไม่สามารถลบข้อมูลการประเมินได้")
	}

	return nil
}
