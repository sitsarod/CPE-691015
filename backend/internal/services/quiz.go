package services

import (
	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
	"errors"

	"gorm.io/gorm"
)

type QuizService struct {
	db *gorm.DB
}

func NewQuizService(db *gorm.DB) *QuizService {
	return &QuizService{db: db}
}

// Admin: Get all questions (including inactive)
func (s *QuizService) GetAllQuestions() ([]dto.QuizQuestionResponse, error) {
	var questions []models.QuizQuestion
	err := s.db.Preload("Options").Order("sequence ASC").Find(&questions).Error
	if err != nil {
		return nil, err
	}
	return s.mapToResponses(questions), nil
}

// Public/Customer: Get active questions
func (s *QuizService) GetActiveQuestions() ([]dto.QuizQuestionResponse, error) {
	var questions []models.QuizQuestion
	err := s.db.Preload("Options").Where("is_active = ?", true).Order("sequence ASC").Find(&questions).Error
	if err != nil {
		return nil, err
	}
	return s.mapToResponses(questions), nil
}

func (s *QuizService) CreateQuestion(req dto.CreateQuizQuestionReq) (*models.QuizQuestion, error) {
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	q := models.QuizQuestion{
		Text:     req.Text,
		Sequence: req.Sequence,
		IsActive: isActive,
	}

	if err := s.db.Create(&q).Error; err != nil {
		return nil, errors.New("ไม่สามารถสร้างคำถามได้")
	}
	return &q, nil
}

func (s *QuizService) UpdateQuestion(id uint, req dto.UpdateQuizQuestionReq) (*models.QuizQuestion, error) {
	var q models.QuizQuestion
	if err := s.db.First(&q, id).Error; err != nil {
		return nil, errors.New("ไม่พบคำถาม")
	}

	if req.Text != nil {
		q.Text = *req.Text
	}
	if req.Sequence != nil {
		q.Sequence = *req.Sequence
	}
	if req.IsActive != nil {
		q.IsActive = *req.IsActive
	}

	if err := s.db.Save(&q).Error; err != nil {
		return nil, errors.New("อัปเดตคำถามไม่สำเร็จ")
	}
	return &q, nil
}

func (s *QuizService) DeleteQuestion(id uint) error {
	return s.db.Delete(&models.QuizQuestion{}, id).Error
}

func (s *QuizService) AddOption(questionID uint, req dto.CreateQuizOptionReq) (*models.QuizOption, error) {
	var q models.QuizQuestion
	if err := s.db.First(&q, questionID).Error; err != nil {
		return nil, errors.New("ไม่พบคำถาม")
	}

	opt := models.QuizOption{
		QuestionID:          questionID,
		Text:                req.Text,
		RecommendedCourseID: req.RecommendedCourseID,
	}

	if err := s.db.Create(&opt).Error; err != nil {
		return nil, errors.New("ไม่สามารถสร้างตัวเลือกได้")
	}
	return &opt, nil
}

func (s *QuizService) DeleteOption(optionID uint) error {
	return s.db.Delete(&models.QuizOption{}, optionID).Error
}

func (s *QuizService) mapToResponses(questions []models.QuizQuestion) []dto.QuizQuestionResponse {
	var res []dto.QuizQuestionResponse
	for _, q := range questions {
		var opts []dto.QuizOptionResponse
		for _, o := range q.Options {
			opts = append(opts, dto.QuizOptionResponse{
				ID:                  o.ID,
				Text:                o.Text,
				RecommendedCourseID: o.RecommendedCourseID,
			})
		}
		res = append(res, dto.QuizQuestionResponse{
			ID:       q.ID,
			Text:     q.Text,
			Sequence: q.Sequence,
			IsActive: q.IsActive,
			Options:  opts,
		})
	}
	return res
}
