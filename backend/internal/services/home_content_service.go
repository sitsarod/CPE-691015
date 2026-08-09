package services

import (
	"errors"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"

	"gorm.io/gorm"
)

type HomeContentService interface {
	// content (singleton)
	GetHomeContent() (*dto.HomeContentDTO, error)
	UpdateHomeContent(req *dto.UpdateHomeContentReq) (*dto.HomeContentDTO, error)

	// ก้อนรวมสำหรับหน้าแรกสาธารณะ
	GetPublicHome() (*dto.PublicHomeDTO, error)

	// hero slides
	ListSlides(activeOnly bool) ([]dto.HeroSlideDTO, error)
	CreateSlide(req *dto.CreateHeroSlideReq) (*dto.HeroSlideDTO, error)
	UpdateSlide(id uint, req *dto.UpdateHeroSlideReq) (*dto.HeroSlideDTO, error)
	DeleteSlide(id uint) error
	ReorderSlides(orderedIDs []uint) error

	// coaches
	ListCoaches(featuredOnly bool) ([]dto.PublicCoachDTO, error)
	SetCoachFeature(coachID uint, feature bool) (*dto.PublicCoachDTO, error)
}

type homeContentService struct {
	db *gorm.DB
}

func NewHomeContentService(db *gorm.DB) HomeContentService {
	return &homeContentService{db: db}
}

// getOrCreateContent คืนแถว HomeContent เดียว ถ้ายังไม่มีให้สร้าง default (first-run)
func (s *homeContentService) getOrCreateContent() (*models.HomeContent, error) {
	var content models.HomeContent
	err := s.db.Order("id ASC").First(&content).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		content = models.HomeContent{
			AboutTitle:      "เกี่ยวกับเรา",
			CoachesTitle:    "บุคลากร",
			CoursesTitle:    "คอร์สเรียน",
			ReviewsTitle:    "เสียงจากผู้เรียน",
			CoursesSubtitle: "",
		}
		if err := s.db.Create(&content).Error; err != nil {
			return nil, err
		}
		return &content, nil
	}
	if err != nil {
		return nil, err
	}
	return &content, nil
}

func (s *homeContentService) GetHomeContent() (*dto.HomeContentDTO, error) {
	content, err := s.getOrCreateContent()
	if err != nil {
		return nil, err
	}
	d := mapToHomeContentDTO(content)
	return &d, nil
}

func (s *homeContentService) UpdateHomeContent(req *dto.UpdateHomeContentReq) (*dto.HomeContentDTO, error) {
	content, err := s.getOrCreateContent()
	if err != nil {
		return nil, err
	}

	if req.AboutTitle != nil {
		content.AboutTitle = *req.AboutTitle
	}
	if req.AboutContent != nil {
		content.AboutContent = *req.AboutContent
	}
	if req.AboutImageURL != nil {
		content.AboutImageURL = *req.AboutImageURL
	}
	if req.CoachesTitle != nil {
		content.CoachesTitle = *req.CoachesTitle
	}
	if req.CoachesSubtitle != nil {
		content.CoachesSubtitle = *req.CoachesSubtitle
	}
	if req.CoursesTitle != nil {
		content.CoursesTitle = *req.CoursesTitle
	}
	if req.CoursesSubtitle != nil {
		content.CoursesSubtitle = *req.CoursesSubtitle
	}
	if req.ShowFeaturedReviews != nil {
		content.ShowFeaturedReviews = *req.ShowFeaturedReviews
	}
	if req.ReviewsTitle != nil {
		content.ReviewsTitle = *req.ReviewsTitle
	}
	if req.ReviewsSubtitle != nil {
		content.ReviewsSubtitle = *req.ReviewsSubtitle
	}

	if err := s.db.Save(content).Error; err != nil {
		return nil, err
	}
	d := mapToHomeContentDTO(content)
	return &d, nil
}

func (s *homeContentService) GetPublicHome() (*dto.PublicHomeDTO, error) {
	content, err := s.GetHomeContent()
	if err != nil {
		return nil, err
	}
	slides, err := s.ListSlides(true)
	if err != nil {
		return nil, err
	}
	coaches, err := s.ListCoaches(true)
	if err != nil {
		return nil, err
	}
	return &dto.PublicHomeDTO{
		Content:         *content,
		Slides:          slides,
		FeaturedCoaches: coaches,
	}, nil
}

func (s *homeContentService) ListSlides(activeOnly bool) ([]dto.HeroSlideDTO, error) {
	var slides []models.HeroSlide
	q := s.db.Order("sort_order ASC").Order("id ASC")
	if activeOnly {
		q = q.Where("is_active = ?", true)
	}
	if err := q.Find(&slides).Error; err != nil {
		return nil, err
	}
	dtos := make([]dto.HeroSlideDTO, 0, len(slides))
	for i := range slides {
		dtos = append(dtos, mapToHeroSlideDTO(&slides[i]))
	}
	return dtos, nil
}

func (s *homeContentService) CreateSlide(req *dto.CreateHeroSlideReq) (*dto.HeroSlideDTO, error) {
	slide := models.HeroSlide{
		ImageURL:  req.ImageURL,
		Caption:   req.Caption,
		LinkURL:   req.LinkURL,
		SortOrder: req.SortOrder,
		IsActive:  true,
	}
	if req.IsActive != nil {
		slide.IsActive = *req.IsActive
	}
	if err := s.db.Create(&slide).Error; err != nil {
		return nil, err
	}
	d := mapToHeroSlideDTO(&slide)
	return &d, nil
}

func (s *homeContentService) UpdateSlide(id uint, req *dto.UpdateHeroSlideReq) (*dto.HeroSlideDTO, error) {
	var slide models.HeroSlide
	if err := s.db.First(&slide, id).Error; err != nil {
		return nil, err
	}
	if req.ImageURL != nil {
		slide.ImageURL = *req.ImageURL
	}
	if req.Caption != nil {
		slide.Caption = *req.Caption
	}
	if req.LinkURL != nil {
		slide.LinkURL = *req.LinkURL
	}
	if req.SortOrder != nil {
		slide.SortOrder = *req.SortOrder
	}
	if req.IsActive != nil {
		slide.IsActive = *req.IsActive
	}
	if err := s.db.Save(&slide).Error; err != nil {
		return nil, err
	}
	d := mapToHeroSlideDTO(&slide)
	return &d, nil
}

func (s *homeContentService) DeleteSlide(id uint) error {
	var slide models.HeroSlide
	if err := s.db.First(&slide, id).Error; err != nil {
		return err
	}
	return s.db.Delete(&models.HeroSlide{}, id).Error
}

func (s *homeContentService) ReorderSlides(orderedIDs []uint) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		for i, id := range orderedIDs {
			if err := tx.Model(&models.HeroSlide{}).Where("id = ?", id).
				UpdateColumn("sort_order", i).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func (s *homeContentService) ListCoaches(featuredOnly bool) ([]dto.PublicCoachDTO, error) {
	var coaches []models.Coach
	q := s.db.Preload("User").Order("id ASC")
	if featuredOnly {
		q = q.Where("feature_on_home = ?", true)
	}
	if err := q.Find(&coaches).Error; err != nil {
		return nil, err
	}
	dtos := make([]dto.PublicCoachDTO, 0, len(coaches))
	for i := range coaches {
		dtos = append(dtos, mapToPublicCoachDTO(&coaches[i]))
	}
	return dtos, nil
}

func (s *homeContentService) SetCoachFeature(coachID uint, feature bool) (*dto.PublicCoachDTO, error) {
	var coach models.Coach
	if err := s.db.Preload("User").First(&coach, coachID).Error; err != nil {
		return nil, err
	}
	coach.FeatureOnHome = feature
	if err := s.db.Model(&coach).UpdateColumn("feature_on_home", feature).Error; err != nil {
		return nil, err
	}
	d := mapToPublicCoachDTO(&coach)
	return &d, nil
}

// ---------- mappers ----------
func mapToHomeContentDTO(m *models.HomeContent) dto.HomeContentDTO {
	return dto.HomeContentDTO{
		ID:                  m.ID,
		AboutTitle:          m.AboutTitle,
		AboutContent:        m.AboutContent,
		AboutImageURL:       m.AboutImageURL,
		CoachesTitle:        m.CoachesTitle,
		CoachesSubtitle:     m.CoachesSubtitle,
		CoursesTitle:        m.CoursesTitle,
		CoursesSubtitle:     m.CoursesSubtitle,
		ShowFeaturedReviews: m.ShowFeaturedReviews,
		ReviewsTitle:        m.ReviewsTitle,
		ReviewsSubtitle:     m.ReviewsSubtitle,
		UpdatedAt:           m.UpdatedAt,
	}
}

func mapToHeroSlideDTO(m *models.HeroSlide) dto.HeroSlideDTO {
	return dto.HeroSlideDTO{
		ID:        m.ID,
		ImageURL:  m.ImageURL,
		Caption:   m.Caption,
		LinkURL:   m.LinkURL,
		SortOrder: m.SortOrder,
		IsActive:  m.IsActive,
	}
}

func mapToPublicCoachDTO(m *models.Coach) dto.PublicCoachDTO {
	d := dto.PublicCoachDTO{
		ID:             m.ID,
		Nickname:       m.Nickname,
		Specialization: m.Specialization,
		ProfilePicture: m.ProfilePicture,
		FeatureOnHome:  m.FeatureOnHome,
	}
	if m.User != nil {
		d.FirstName = m.User.FirstName
		d.LastName = m.User.LastName
	}
	return d
}
