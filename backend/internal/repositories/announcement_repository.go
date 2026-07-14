package repositories

import (
	"CPE-691015/internal/models"
	"gorm.io/gorm"
)

type AnnouncementRepository interface {
	Create(announcement *models.Announcement) error
	GetByID(id uint) (*models.Announcement, error)
	GetAll() ([]models.Announcement, error)
	Update(announcement *models.Announcement) error
	Delete(id uint) error
	IncrementViewCount(id uint) error
	
	CreateCategory(category *models.Category) error
	GetCategoryByID(id uint) (*models.Category, error)
	GetAllCategories() ([]models.Category, error)
	DeleteCategory(id uint) error
}

type gormAnnouncementRepository struct {
	db *gorm.DB
}

func NewAnnouncementRepository(db *gorm.DB) AnnouncementRepository {
	return &gormAnnouncementRepository{db: db}
}

func (r *gormAnnouncementRepository) Create(announcement *models.Announcement) error {
	return r.db.Create(announcement).Error
}

func (r *gormAnnouncementRepository) GetByID(id uint) (*models.Announcement, error) {
	var announcement models.Announcement
	err := r.db.Preload("User").Preload("Category").First(&announcement, id).Error
	if err != nil {
		return nil, err
	}
	return &announcement, nil
}

func (r *gormAnnouncementRepository) GetAll() ([]models.Announcement, error) {
	var announcements []models.Announcement
	err := r.db.Preload("User").Preload("Category").Order("created_at DESC").Find(&announcements).Error
	return announcements, err
}

func (r *gormAnnouncementRepository) Update(announcement *models.Announcement) error {
	return r.db.Save(announcement).Error
}

func (r *gormAnnouncementRepository) Delete(id uint) error {
	return r.db.Delete(&models.Announcement{}, id).Error
}

func (r *gormAnnouncementRepository) IncrementViewCount(id uint) error {
	return r.db.Model(&models.Announcement{}).Where("id = ?", id).UpdateColumn("view_count", gorm.Expr("view_count + ?", 1)).Error
}

func (r *gormAnnouncementRepository) CreateCategory(category *models.Category) error {
	return r.db.Create(category).Error
}

func (r *gormAnnouncementRepository) GetCategoryByID(id uint) (*models.Category, error) {
	var category models.Category
	err := r.db.First(&category, id).Error
	if err != nil {
		return nil, err
	}
	return &category, nil
}

func (r *gormAnnouncementRepository) GetAllCategories() ([]models.Category, error) {
	var categories []models.Category
	err := r.db.Order("name ASC").Find(&categories).Error
	return categories, err
}

func (r *gormAnnouncementRepository) DeleteCategory(id uint) error {
	return r.db.Delete(&models.Category{}, id).Error
}
