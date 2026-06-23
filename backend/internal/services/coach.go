package services

import (
	"CPE-691015/internal/config"
	"CPE-691015/internal/models"
)

type CoachService struct{}

// NewCoachService creates a new instance of CoachService
func NewCoachService() *CoachService {
	return &CoachService{}
}

// GetAll retrieves all coaches from the database
func (s *CoachService) GetAll() ([]models.Coach, error) {
	var coaches []models.Coach
	err := config.DB.Find(&coaches).Error
	return coaches, err
}

// Create inserts a new coach into the database
func (s *CoachService) Create(coach *models.Coach) error {
	return config.DB.Create(coach).Error
}
