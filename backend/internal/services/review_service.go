package services

import (
	"errors"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"

	"gorm.io/gorm"
)

type ReviewService interface {
	// ฝั่งลูกค้า
	CreateReview(userID uint, req *dto.CreateReviewReq) (*dto.ReviewDTO, error)
	GetMyReviews(userID uint) ([]dto.ReviewDTO, error)

	// ฝั่งโค้ช — รีวิวที่ลูกค้ารีวิวถึงโค้ชคนที่ล็อกอินอยู่
	GetCoachReviews(userID uint) ([]dto.ReviewDTO, error)

	// ฝั่งสาธารณะ (หน้าแรกของระบบ)
	GetFeaturedReviews() ([]dto.ReviewDTO, error)

	// รายชื่อโค้ชที่สอนในคอร์ส — ใช้ให้ลูกค้าเลือกรีวิวโค้ช
	GetCourseCoaches(courseID uint) ([]dto.CourseCoachDTO, error)

	// ฝั่งแอดมิน
	GetAllReviews() ([]dto.ReviewDTO, error)
	UpdateReview(id uint, req *dto.UpdateReviewReq) (*dto.ReviewDTO, error)
	SetFeatured(id uint, featured bool) (*dto.ReviewDTO, error)
	DeleteReview(id uint) error
}

type reviewService struct {
	db *gorm.DB
}

func NewReviewService(db *gorm.DB) ReviewService {
	return &reviewService{db: db}
}

// preloads โหลดความสัมพันธ์ที่ใช้ประกอบ DTO ทุกครั้งให้เหมือนกัน
func (s *reviewService) preloads() *gorm.DB {
	return s.db.
		Preload("Customer").
		Preload("Customer.User").
		Preload("Course").
		Preload("Coach")
}

func (s *reviewService) CreateReview(userID uint, req *dto.CreateReviewReq) (*dto.ReviewDTO, error) {
	if req.CourseID == nil && req.CoachID == nil {
		return nil, errors.New("ต้องระบุคอร์สหรือโค้ชอย่างน้อยหนึ่งอย่าง")
	}
	if req.Rating < 1 || req.Rating > 5 {
		return nil, errors.New("คะแนนต้องอยู่ระหว่าง 1 ถึง 5")
	}

	customerID, err := ResolveCustomerID(s.db, userID)
	if err != nil {
		return nil, err
	}

	// ตรวจสอบว่าคอร์ส/โค้ชที่รีวิวมีอยู่จริง
	if req.CourseID != nil {
		if err := s.db.First(&models.Course{}, *req.CourseID).Error; err != nil {
			return nil, errors.New("ไม่พบคอร์สที่ต้องการรีวิว")
		}
	}
	if req.CoachID != nil {
		if err := s.db.First(&models.Coach{}, *req.CoachID).Error; err != nil {
			return nil, errors.New("ไม่พบโค้ชที่ต้องการรีวิว")
		}
	}

	review := models.Review{
		CustomerID: customerID,
		CourseID:   req.CourseID,
		CoachID:    req.CoachID,
		Rating:     req.Rating,
		Comment:    req.Comment,
	}

	if err := s.db.Create(&review).Error; err != nil {
		return nil, err
	}

	return s.getByID(review.ID)
}

func (s *reviewService) GetMyReviews(userID uint) ([]dto.ReviewDTO, error) {
	customerID, err := ResolveCustomerID(s.db, userID)
	if err != nil {
		return nil, err
	}

	var reviews []models.Review
	if err := s.preloads().Where("customer_id = ?", customerID).Order("created_at DESC").Find(&reviews).Error; err != nil {
		return nil, err
	}
	return mapReviewList(reviews), nil
}

// GetCoachReviews คืนรีวิวทั้งหมดที่ลูกค้ารีวิวถึงโค้ชคนที่ล็อกอินอยู่
// resolve coach_id จาก JWT เอง (เหมือน /coaches/me) เพื่อกันโค้ชแอบดูรีวิวของโค้ชคนอื่น
func (s *reviewService) GetCoachReviews(userID uint) ([]dto.ReviewDTO, error) {
	var coach models.Coach
	if err := s.db.Where("user_id = ?", userID).First(&coach).Error; err != nil {
		return nil, errors.New("ไม่พบข้อมูลโค้ชสำหรับผู้ใช้งานนี้")
	}

	var reviews []models.Review
	if err := s.preloads().Where("coach_id = ?", coach.ID).Order("created_at DESC").Find(&reviews).Error; err != nil {
		return nil, err
	}
	return mapReviewList(reviews), nil
}

func (s *reviewService) GetFeaturedReviews() ([]dto.ReviewDTO, error) {
	var reviews []models.Review
	if err := s.preloads().Where("is_featured = ?", true).Order("updated_at DESC").Find(&reviews).Error; err != nil {
		return nil, err
	}
	return mapReviewList(reviews), nil
}

// GetCourseCoaches คืนโค้ช (ไม่ซ้ำ) ที่มีตารางสอนอยู่ในคอร์สนั้น
//
// ความเชื่อมโยง course → coach มาจากตาราง work_schedules (คอร์สหนึ่งมีหลายคาบ
// แต่ละคาบมีโค้ชคนเดียว) จึงต้อง DISTINCT กันโค้ชคนเดิมโผล่ซ้ำเมื่อสอนหลายคาบ
func (s *reviewService) GetCourseCoaches(courseID uint) ([]dto.CourseCoachDTO, error) {
	// ตรวจว่ามีคอร์สนี้จริงก่อน เพื่อแยก 404 ออกจาก "คอร์สมีแต่ยังไม่มีโค้ช"
	if err := s.db.First(&models.Course{}, courseID).Error; err != nil {
		return nil, err
	}

	var coaches []models.Coach
	err := s.db.
		Distinct("coaches.*").
		Joins("JOIN work_schedules ws ON ws.coach_id = coaches.id").
		Where("ws.course_id = ? AND ws.deleted_at IS NULL", courseID).
		Order("coaches.nickname ASC").
		Find(&coaches).Error
	if err != nil {
		return nil, err
	}

	dtos := make([]dto.CourseCoachDTO, 0, len(coaches))
	for i := range coaches {
		dtos = append(dtos, dto.CourseCoachDTO{
			ID:             coaches[i].ID,
			Nickname:       coaches[i].Nickname,
			Specialization: coaches[i].Specialization,
			ProfilePicture: coaches[i].ProfilePicture,
		})
	}
	return dtos, nil
}

func (s *reviewService) GetAllReviews() ([]dto.ReviewDTO, error) {
	var reviews []models.Review
	if err := s.preloads().Order("created_at DESC").Find(&reviews).Error; err != nil {
		return nil, err
	}
	return mapReviewList(reviews), nil
}

func (s *reviewService) UpdateReview(id uint, req *dto.UpdateReviewReq) (*dto.ReviewDTO, error) {
	var review models.Review
	if err := s.db.First(&review, id).Error; err != nil {
		return nil, errors.New("ไม่พบรีวิว")
	}

	if req.Rating != 0 {
		if req.Rating < 1 || req.Rating > 5 {
			return nil, errors.New("คะแนนต้องอยู่ระหว่าง 1 ถึง 5")
		}
		review.Rating = req.Rating
	}
	if req.Comment != "" {
		review.Comment = req.Comment
	}

	if err := s.db.Save(&review).Error; err != nil {
		return nil, err
	}
	return s.getByID(id)
}

func (s *reviewService) SetFeatured(id uint, featured bool) (*dto.ReviewDTO, error) {
	var review models.Review
	if err := s.db.First(&review, id).Error; err != nil {
		return nil, errors.New("ไม่พบรีวิว")
	}

	if err := s.db.Model(&review).Update("is_featured", featured).Error; err != nil {
		return nil, err
	}
	return s.getByID(id)
}

func (s *reviewService) DeleteReview(id uint) error {
	var review models.Review
	if err := s.db.First(&review, id).Error; err != nil {
		return errors.New("ไม่พบรีวิว")
	}
	return s.db.Delete(&models.Review{}, id).Error
}

func (s *reviewService) getByID(id uint) (*dto.ReviewDTO, error) {
	var review models.Review
	if err := s.preloads().First(&review, id).Error; err != nil {
		return nil, err
	}
	res := mapToReviewDTO(&review)
	return &res, nil
}

func mapReviewList(reviews []models.Review) []dto.ReviewDTO {
	dtos := make([]dto.ReviewDTO, 0, len(reviews))
	for i := range reviews {
		dtos = append(dtos, mapToReviewDTO(&reviews[i]))
	}
	return dtos
}

func mapToReviewDTO(m *models.Review) dto.ReviewDTO {
	d := dto.ReviewDTO{
		ID:         m.ID,
		CustomerID: m.CustomerID,
		CourseID:   m.CourseID,
		CoachID:    m.CoachID,
		Rating:     m.Rating,
		Comment:    m.Comment,
		IsFeatured: m.IsFeatured,
		CreatedAt:  m.CreatedAt,
		UpdatedAt:  m.UpdatedAt,
	}

	if m.Customer != nil {
		c := &dto.ReviewCustomerDTO{
			ID:       m.Customer.ID,
			Nickname: m.Customer.Nickname,
		}
		if m.Customer.User != nil {
			c.FirstName = m.Customer.User.FirstName
			c.LastName = m.Customer.User.LastName
		}
		d.Customer = c
	}

	if m.Course != nil {
		d.Course = &dto.ReviewCourseDTO{
			ID:         m.Course.ID,
			CourseName: m.Course.CourseName,
		}
	}

	if m.Coach != nil {
		d.Coach = &dto.ReviewCoachDTO{
			ID:       m.Coach.ID,
			Nickname: m.Coach.Nickname,
		}
	}

	return d
}
