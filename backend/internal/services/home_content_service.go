package services

import (
	"encoding/json"
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
			SchoolName:      "Koyama Badminton School",
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
	if req.MapEmbedURL != nil {
		content.MapEmbedURL = *req.MapEmbedURL
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
	if req.FacebookURL != nil {
		content.FacebookURL = *req.FacebookURL
	}
	if req.InstagramURL != nil {
		content.InstagramURL = *req.InstagramURL
	}
	if req.TiktokURL != nil {
		content.TiktokURL = *req.TiktokURL
	}
	if req.YoutubeURL != nil {
		content.YoutubeURL = *req.YoutubeURL
	}
	if req.LineURL != nil {
		content.LineURL = *req.LineURL
	}
	if req.SchoolName != nil {
		content.SchoolName = *req.SchoolName
	}
	if req.ContactAddress != nil {
		content.ContactAddress = *req.ContactAddress
	}
	if req.ContactPhone != nil {
		content.ContactPhone = *req.ContactPhone
	}
	if req.ContactEmail != nil {
		content.ContactEmail = *req.ContactEmail
	}
	if req.OpeningHours != nil {
		content.OpeningHours = *req.OpeningHours
	}
	if req.PrivacyPolicy != nil {
		content.PrivacyPolicy = *req.PrivacyPolicy
	}
	if req.TermsOfService != nil {
		content.TermsOfService = *req.TermsOfService
	}

	// ---- เนื้อหาหลักหน้าแรก ----
	if req.HeroEyebrow != nil {
		content.HeroEyebrow = *req.HeroEyebrow
	}
	if req.HeroHeadline != nil {
		content.HeroHeadline = *req.HeroHeadline
	}
	if req.HeroSubtext != nil {
		content.HeroSubtext = *req.HeroSubtext
	}
	if req.CoursesFootnote != nil {
		content.CoursesFootnote = *req.CoursesFootnote
	}
	if req.CoachesNote != nil {
		content.CoachesNote = *req.CoachesNote
	}
	if req.FacilityTitle != nil {
		content.FacilityTitle = *req.FacilityTitle
	}
	if req.FacilitySubtitle != nil {
		content.FacilitySubtitle = *req.FacilitySubtitle
	}
	if req.FooterCtaTitle != nil {
		content.FooterCtaTitle = *req.FooterCtaTitle
	}
	if req.FooterCtaSubtitle != nil {
		content.FooterCtaSubtitle = *req.FooterCtaSubtitle
	}

	// ---- ข้อมูลชุดซ้ำ: marshal เป็น JSON แล้วเก็บลงคอลัมน์ text ----
	if req.HeroStats != nil {
		content.HeroStatsJSON = marshalJSON(*req.HeroStats)
	}
	if req.CoachStats != nil {
		content.CoachStatsJSON = marshalJSON(*req.CoachStats)
	}
	if req.FacilityTiles != nil {
		content.FacilityTilesJSON = marshalJSON(*req.FacilityTiles)
	}
	if req.FaqItems != nil {
		content.FaqItemsJSON = marshalJSON(*req.FaqItems)
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
		MapEmbedURL:         m.MapEmbedURL,
		CoachesTitle:        m.CoachesTitle,
		CoachesSubtitle:     m.CoachesSubtitle,
		CoursesTitle:        m.CoursesTitle,
		CoursesSubtitle:     m.CoursesSubtitle,
		ShowFeaturedReviews: m.ShowFeaturedReviews,
		ReviewsTitle:        m.ReviewsTitle,
		ReviewsSubtitle:     m.ReviewsSubtitle,
		FacebookURL:         m.FacebookURL,
		InstagramURL:        m.InstagramURL,
		TiktokURL:           m.TiktokURL,
		YoutubeURL:          m.YoutubeURL,
		LineURL:             m.LineURL,
		SchoolName:          m.SchoolName,
		ContactAddress:      m.ContactAddress,
		ContactPhone:        m.ContactPhone,
		ContactEmail:        m.ContactEmail,
		OpeningHours:        m.OpeningHours,
		PrivacyPolicy:       m.PrivacyPolicy,
		TermsOfService:      m.TermsOfService,
		HeroEyebrow:         m.HeroEyebrow,
		HeroHeadline:        m.HeroHeadline,
		HeroSubtext:         m.HeroSubtext,
		CoursesFootnote:     m.CoursesFootnote,
		CoachesNote:         m.CoachesNote,
		FacilityTitle:       m.FacilityTitle,
		FacilitySubtitle:    m.FacilitySubtitle,
		FooterCtaTitle:      m.FooterCtaTitle,
		FooterCtaSubtitle:   m.FooterCtaSubtitle,
		HeroStats:           unmarshalStats(m.HeroStatsJSON),
		CoachStats:          unmarshalStats(m.CoachStatsJSON),
		FacilityTiles:       unmarshalTiles(m.FacilityTilesJSON),
		FaqItems:            unmarshalFaq(m.FaqItemsJSON),
		UpdatedAt:           m.UpdatedAt,
	}
}

// ---------- JSON helpers สำหรับข้อมูลชุดซ้ำที่เก็บเป็น text ----------

// marshalJSON แปลง slice เป็นสตริง JSON (error → "" เพื่อไม่ให้พังทั้งคำขอ)
func marshalJSON(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		return ""
	}
	return string(b)
}

// unmarshalStats/Tiles/Faq แปลง JSON กลับเป็น slice (ว่าง/พังรูปแบบ → slice ว่าง)
func unmarshalStats(s string) []dto.StatItem {
	if s == "" {
		return []dto.StatItem{}
	}
	var out []dto.StatItem
	if err := json.Unmarshal([]byte(s), &out); err != nil {
		return []dto.StatItem{}
	}
	return out
}

func unmarshalTiles(s string) []dto.FacilityTileItem {
	if s == "" {
		return []dto.FacilityTileItem{}
	}
	var out []dto.FacilityTileItem
	if err := json.Unmarshal([]byte(s), &out); err != nil {
		return []dto.FacilityTileItem{}
	}
	return out
}

func unmarshalFaq(s string) []dto.FaqItem {
	if s == "" {
		return []dto.FaqItem{}
	}
	var out []dto.FaqItem
	if err := json.Unmarshal([]byte(s), &out); err != nil {
		return []dto.FaqItem{}
	}
	return out
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
		CoachLicense:   m.CoachLicense,
		ProfilePicture: m.ProfilePicture,
		HomeImage:      m.HomeImage,
		Bio:            m.Bio,
		FeatureOnHome:  m.FeatureOnHome,
	}
	if m.User != nil {
		d.FirstName = m.User.FirstName
		d.LastName = m.User.LastName
	}
	return d
}
