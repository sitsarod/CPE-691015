package services

import (
	"CPE-691015/internal/config"
	"CPE-691015/internal/models"
)

type UserService struct{}

// NewUserService creates a new instance of UserService
func NewUserService() *UserService {
	return &UserService{}
}

// GetAll retrieves all users from the database
func (s *UserService) GetAll() ([]models.User, error) {
	var users []models.User
	err := config.DB.Find(&users).Error
	return users, err
}

// Create inserts a new user into the database
func (s *UserService) Create(user *models.User) error {
	return config.DB.Create(user).Error
}
