package services

import (
	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
	"CPE-691015/internal/repositories"
	"errors"
	"gorm.io/gorm"
)

type AnnouncementService interface {
	CreateAnnouncement(req *dto.CreateAnnouncementReq) (*dto.AnnouncementDTO, error)
	GetAnnouncementByID(id uint) (*dto.AnnouncementDTO, error)
	GetAllAnnouncements() ([]dto.AnnouncementDTO, error)
	UpdateAnnouncement(id uint, req *dto.UpdateAnnouncementReq) (*dto.AnnouncementDTO, error)
	DeleteAnnouncement(id uint) error
	IncrementViewCount(id uint) error
	
	CreateCategory(req *dto.CreateCategoryReq) (*dto.CategoryDTO, error)
	GetAllCategories() ([]dto.CategoryDTO, error)
}

type announcementService struct {
	repo repositories.AnnouncementRepository
	db   *gorm.DB
}

func NewAnnouncementService(repo repositories.AnnouncementRepository, db *gorm.DB) AnnouncementService {
	return &announcementService{repo: repo, db: db}
}

func (s *announcementService) CreateAnnouncement(req *dto.CreateAnnouncementReq) (*dto.AnnouncementDTO, error) {
	if req.StartDate.After(req.EndDate) {
		return nil, errors.New("start date cannot be after end date")
	}

	// Validate user existence
	var user models.User
	if err := s.db.First(&user, req.UserID).Error; err != nil {
		return nil, errors.New("user not found")
	}

	// Validate category existence
	category, err := s.repo.GetCategoryByID(req.CategoryID)
	if err != nil || category == nil {
		return nil, errors.New("category not found")
	}

	announcement := models.Announcement{
		Title:      req.Title,
		Content:    req.Content,
		UserID:     req.UserID,
		CategoryID: req.CategoryID,
		StartDate:  req.StartDate,
		EndDate:    req.EndDate,
		ViewCount:  0,
	}

	if err := s.repo.Create(&announcement); err != nil {
		return nil, err
	}

	return s.GetAnnouncementByID(announcement.ID)
}

func (s *announcementService) GetAnnouncementByID(id uint) (*dto.AnnouncementDTO, error) {
	announcement, err := s.repo.GetByID(id)
	if err != nil {
		return nil, err
	}
	dtoRes := mapToAnnouncementDTO(announcement)
	return &dtoRes, nil
}

func (s *announcementService) GetAllAnnouncements() ([]dto.AnnouncementDTO, error) {
	announcements, err := s.repo.GetAll()
	if err != nil {
		return nil, err
	}

	var dtos []dto.AnnouncementDTO
	for _, a := range announcements {
		dtos = append(dtos, mapToAnnouncementDTO(&a))
	}
	return dtos, nil
}

func (s *announcementService) UpdateAnnouncement(id uint, req *dto.UpdateAnnouncementReq) (*dto.AnnouncementDTO, error) {
	announcement, err := s.repo.GetByID(id)
	if err != nil {
		return nil, err
	}

	if req.Title != "" {
		announcement.Title = req.Title
	}
	if req.Content != "" {
		announcement.Content = req.Content
	}
	if req.UserID != 0 {
		var user models.User
		if err := s.db.First(&user, req.UserID).Error; err != nil {
			return nil, errors.New("user not found")
		}
		announcement.UserID = req.UserID
	}
	if req.CategoryID != 0 {
		category, err := s.repo.GetCategoryByID(req.CategoryID)
		if err != nil || category == nil {
			return nil, errors.New("category not found")
		}
		announcement.CategoryID = req.CategoryID
	}
	if !req.StartDate.IsZero() {
		announcement.StartDate = req.StartDate
	}
	if !req.EndDate.IsZero() {
		announcement.EndDate = req.EndDate
	}

	if announcement.StartDate.After(announcement.EndDate) {
		return nil, errors.New("start date cannot be after end date")
	}

	if err := s.repo.Update(announcement); err != nil {
		return nil, err
	}

	return s.GetAnnouncementByID(id)
}

func (s *announcementService) DeleteAnnouncement(id uint) error {
	_, err := s.repo.GetByID(id)
	if err != nil {
		return err
	}
	return s.repo.Delete(id)
}

func (s *announcementService) IncrementViewCount(id uint) error {
	_, err := s.repo.GetByID(id)
	if err != nil {
		return err
	}
	return s.repo.IncrementViewCount(id)
}

func (s *announcementService) CreateCategory(req *dto.CreateCategoryReq) (*dto.CategoryDTO, error) {
	category := models.Category{
		Name: req.Name,
	}
	if err := s.repo.CreateCategory(&category); err != nil {
		return nil, err
	}
	dtoRes := mapToCategoryDTO(&category)
	return &dtoRes, nil
}

func (s *announcementService) GetAllCategories() ([]dto.CategoryDTO, error) {
	categories, err := s.repo.GetAllCategories()
	if err != nil {
		return nil, err
	}

	var dtos []dto.CategoryDTO
	for _, c := range categories {
		dtos = append(dtos, mapToCategoryDTO(&c))
	}
	return dtos, nil
}

func mapToAnnouncementDTO(m *models.Announcement) dto.AnnouncementDTO {
	d := dto.AnnouncementDTO{
		ID:          m.ID,
		Title:       m.Title,
		Content:     m.Content,
		UserID:      m.UserID,
		CategoryID:  m.CategoryID,
		StartDate:   m.StartDate,
		EndDate:     m.EndDate,
		ViewCount:   m.ViewCount,
		CreatedAt:   m.CreatedAt,
		UpdatedAt:   m.UpdatedAt,
	}
	if m.User != nil {
		d.User = &dto.UserDTO{
			ID:        m.User.ID,
			FirstName: m.User.FirstName,
			LastName:  m.User.LastName,
			Email:     m.User.Email,
			Role:      string(m.User.Role),
		}
	}
	if m.Category != nil {
		d.Category = &dto.CategoryDTO{
			ID:   m.Category.ID,
			Name: m.Category.Name,
		}
	}
	return d
}

func mapToCategoryDTO(m *models.Category) dto.CategoryDTO {
	return dto.CategoryDTO{
		ID:   m.ID,
		Name: m.Name,
	}
}
