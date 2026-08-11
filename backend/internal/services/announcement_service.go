package services

import (
	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
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
	UpdateCategory(id uint, req *dto.UpdateCategoryReq) (*dto.CategoryDTO, error)
	DeleteCategory(id uint) error
	GetAllCategories() ([]dto.CategoryDTO, error)
}

type announcementService struct {
	db   *gorm.DB
}

func NewAnnouncementService(db *gorm.DB) AnnouncementService {
	return &announcementService{db: db}
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
	var category models.Category
	if err := s.db.First(&category, req.CategoryID).Error; err != nil {
		return nil, errors.New("category not found")
	}

	announcement := models.Announcement{
		Title:      req.Title,
		Content:    req.Content,
		ImageURL:   req.ImageURL,
		UserID:     req.UserID,
		CategoryID: req.CategoryID,
		StartDate:  req.StartDate,
		EndDate:    req.EndDate,
		ViewCount:  0,
	}

	if err := s.db.Create(&announcement).Error; err != nil {
		return nil, err
	}

	return s.GetAnnouncementByID(announcement.ID)
}

func (s *announcementService) GetAnnouncementByID(id uint) (*dto.AnnouncementDTO, error) {
	var announcement models.Announcement
	err := s.db.Preload("User").Preload("Category").First(&announcement, id).Error
	if err != nil {
		return nil, err
	}
	dtoRes := mapToAnnouncementDTO(&announcement)
	return &dtoRes, nil
}

func (s *announcementService) GetAllAnnouncements() ([]dto.AnnouncementDTO, error) {
	var announcements []models.Announcement
	err := s.db.Preload("User").Preload("Category").Order("created_at DESC").Find(&announcements).Error
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
	var announcement models.Announcement
	if err := s.db.First(&announcement, id).Error; err != nil {
		return nil, err
	}

	if req.Title != "" {
		announcement.Title = req.Title
	}
	if req.Content != "" {
		announcement.Content = req.Content
	}
	if req.ImageURL != "" {
		announcement.ImageURL = req.ImageURL
	}
	if req.UserID != 0 {
		var user models.User
		if err := s.db.First(&user, req.UserID).Error; err != nil {
			return nil, errors.New("user not found")
		}
		announcement.UserID = req.UserID
	}
	if req.CategoryID != 0 {
		var category models.Category
		if err := s.db.First(&category, req.CategoryID).Error; err != nil {
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

	if err := s.db.Save(&announcement).Error; err != nil {
		return nil, err
	}

	return s.GetAnnouncementByID(id)
}

func (s *announcementService) DeleteAnnouncement(id uint) error {
	var announcement models.Announcement
	if err := s.db.First(&announcement, id).Error; err != nil {
		return err
	}
	return s.db.Delete(&models.Announcement{}, id).Error
}

func (s *announcementService) IncrementViewCount(id uint) error {
	var announcement models.Announcement
	if err := s.db.First(&announcement, id).Error; err != nil {
		return err
	}
	return s.db.Model(&models.Announcement{}).Where("id = ?", id).UpdateColumn("view_count", gorm.Expr("view_count + ?", 1)).Error
}

func (s *announcementService) CreateCategory(req *dto.CreateCategoryReq) (*dto.CategoryDTO, error) {
	category := models.Category{
		Name: req.Name,
	}
	if err := s.db.Create(&category).Error; err != nil {
		return nil, err
	}
	dtoRes := mapToCategoryDTO(&category)
	return &dtoRes, nil
}

func (s *announcementService) UpdateCategory(id uint, req *dto.UpdateCategoryReq) (*dto.CategoryDTO, error) {
	var category models.Category
	if err := s.db.First(&category, id).Error; err != nil {
		return nil, errors.New("category not found")
	}

	if req.Name != "" {
		category.Name = req.Name
	}

	if err := s.db.Save(&category).Error; err != nil {
		return nil, err
	}

	dtoRes := mapToCategoryDTO(&category)
	return &dtoRes, nil
}

func (s *announcementService) DeleteCategory(id uint) error {
	var category models.Category
	if err := s.db.First(&category, id).Error; err != nil {
		return errors.New("category not found")
	}
	// Check if categories are in use by announcements
	var count int64
	s.db.Model(&models.Announcement{}).Where("category_id = ?", id).Count(&count)
	if count > 0 {
		return errors.New("cannot delete category that is currently in use by announcements")
	}

	return s.db.Delete(&category).Error
}

func (s *announcementService) GetAllCategories() ([]dto.CategoryDTO, error) {
	var categories []models.Category
	err := s.db.Order("name ASC").Find(&categories).Error
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
		ImageURL:    m.ImageURL,
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
