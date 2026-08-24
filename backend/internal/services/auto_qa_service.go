package services

import (
	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"
)

// Sentinel errors — ให้ controller map เป็น HTTP status code ที่ถูกต้อง
var (
	ErrChatSessionNotFound = errors.New("chat session not found")
	ErrChatSessionClosed   = errors.New("cannot send messages to a closed session")
	ErrUserNotFoundForChat = errors.New("user not found")
	ErrEmptyMessage        = errors.New("message must contain text or an attachment")
)

type AutoQAService interface {
	// Knowledge Base (AutoQA templates where SessionID is nil)
	CreateAutoQA(req *dto.CreateAutoQAReq) (*dto.AutoQADTO, error)
	GetAutoQAByID(id uint) (*dto.AutoQADTO, error)
	GetAllAutoQAs() ([]dto.AutoQADTO, error)
	// GetPublicAutoQAs คืนรูปแบบย่อ (ไม่มีคีย์เวิร์ด/mode) สำหรับหน้าเว็บสาธารณะ
	GetPublicAutoQAs() ([]dto.PublicAutoQADTO, error)
	UpdateAutoQA(id uint, req *dto.UpdateAutoQAReq) (*dto.AutoQADTO, error)
	DeleteAutoQA(id uint) error

	// Chat Sessions
	CreateChatSession(req *dto.CreateChatSessionReq) (*dto.ChatSessionDTO, error)
	GetChatSessionByID(id uint) (*dto.ChatSessionDTO, error)
	GetAllChatSessions() ([]dto.ChatSessionDTO, error)
	UpdateChatSession(id uint, req *dto.UpdateChatSessionReq) (*dto.ChatSessionDTO, error)
	DeleteChatSession(id uint) error
	// DeleteOldSessions ลบห้องแชทที่สร้างมานานเกิน olderThan (ทุกสถานะ) พร้อม log ข้อความ
	DeleteOldSessions(olderThan time.Duration) (int64, error)

	// Q&A logic
	AskQuestion(sessionID uint, req *dto.AskQuestionReq) (*dto.AskQuestionResponse, error)
	AdminReply(sessionID uint, req *dto.AdminReplyReq) (*dto.AutoQADTO, error)
}

type autoQAService struct {
	db *gorm.DB
}

func NewAutoQAService(db *gorm.DB) AutoQAService {
	return &autoQAService{db: db}
}

// === Knowledge Base CRUD ===

func (s *autoQAService) CreateAutoQA(req *dto.CreateAutoQAReq) (*dto.AutoQADTO, error) {
	qa := models.AutoQA{
		Mode:            models.AutoQAMode(req.Mode),
		Question:        req.Question,
		SimilarQuestion: req.SimilarQuestion,
		Answer:          req.Answer,
		SessionID:       nil, // templates are not tied to any session
	}

	if err := s.db.Create(&qa).Error; err != nil {
		return nil, err
	}

	dtoRes := mapToAutoQADTO(&qa)
	return &dtoRes, nil
}

func (s *autoQAService) GetAutoQAByID(id uint) (*dto.AutoQADTO, error) {
	var qa models.AutoQA
	if err := s.db.First(&qa, id).Error; err != nil {
		return nil, err
	}
	dtoRes := mapToAutoQADTO(&qa)
	return &dtoRes, nil
}

func (s *autoQAService) GetAllAutoQAs() ([]dto.AutoQADTO, error) {
	var qas []models.AutoQA
	// Retrieve only knowledge base templates (where session_id is null)
	if err := s.db.Where("session_id IS NULL").Order("id ASC").Find(&qas).Error; err != nil {
		return nil, err
	}

	var dtos []dto.AutoQADTO
	for _, q := range qas {
		dtos = append(dtos, mapToAutoQADTO(&q))
	}
	return dtos, nil
}

func (s *autoQAService) GetPublicAutoQAs() ([]dto.PublicAutoQADTO, error) {
	var qas []models.AutoQA
	// เฉพาะ template ในคลังความรู้ (session_id IS NULL) เท่านั้น
	if err := s.db.Where("session_id IS NULL").Order("id ASC").Find(&qas).Error; err != nil {
		return nil, err
	}

	dtos := make([]dto.PublicAutoQADTO, 0, len(qas))
	for _, q := range qas {
		dtos = append(dtos, dto.PublicAutoQADTO{
			ID:       q.ID,
			Question: q.Question,
			Answer:   q.Answer,
		})
	}
	return dtos, nil
}

func (s *autoQAService) UpdateAutoQA(id uint, req *dto.UpdateAutoQAReq) (*dto.AutoQADTO, error) {
	var qa models.AutoQA
	if err := s.db.First(&qa, id).Error; err != nil {
		return nil, err
	}

	if req.Mode != "" {
		qa.Mode = models.AutoQAMode(req.Mode)
	}
	if req.Question != "" {
		qa.Question = req.Question
	}
	if req.SimilarQuestion != "" {
		qa.SimilarQuestion = req.SimilarQuestion
	}
	if req.Answer != "" {
		qa.Answer = req.Answer
	}

	if err := s.db.Save(&qa).Error; err != nil {
		return nil, err
	}

	dtoRes := mapToAutoQADTO(&qa)
	return &dtoRes, nil
}

func (s *autoQAService) DeleteAutoQA(id uint) error {
	var qa models.AutoQA
	if err := s.db.First(&qa, id).Error; err != nil {
		return err
	}
	return s.db.Delete(&models.AutoQA{}, id).Error
}

// === Chat Sessions CRUD ===

func (s *autoQAService) CreateChatSession(req *dto.CreateChatSessionReq) (*dto.ChatSessionDTO, error) {
	// If UserID is provided, validate user exists
	if req.UserID != nil {
		var user models.User
		if err := s.db.First(&user, *req.UserID).Error; err != nil {
			return nil, ErrUserNotFoundForChat
		}
	}

	// ผู้ใช้ที่ไม่ได้ล็อกอิน = ไม่ระบุตัวตน ไม่มีชื่อ → ตั้งชื่อแสดงเป็น "ผู้เยี่ยมชม"
	guestName := strings.TrimSpace(req.GuestName)
	if guestName == "" {
		guestName = "ผู้เยี่ยมชม"
	}

	session := models.ChatSession{
		GuestName:  guestName,
		GuestEmail: req.GuestEmail,
		GuestPhone: req.GuestPhone,
		Status:     models.ChatSessionStatusActive,
		UserID:     req.UserID,
	}

	if err := s.db.Create(&session).Error; err != nil {
		return nil, err
	}

	return s.GetChatSessionByID(session.ID)
}

func (s *autoQAService) GetChatSessionByID(id uint) (*dto.ChatSessionDTO, error) {
	var session models.ChatSession
	// Preload the User and the logged AutoQAs messages for this session
	err := s.db.Preload("User").Preload("AutoQAs").First(&session, id).Error
	if err != nil {
		return nil, err
	}
	dtoRes := mapToChatSessionDTO(&session)
	return &dtoRes, nil
}

func (s *autoQAService) GetAllChatSessions() ([]dto.ChatSessionDTO, error) {
	var sessions []models.ChatSession
	if err := s.db.Preload("User").Order("created_at DESC").Find(&sessions).Error; err != nil {
		return nil, err
	}

	var dtos []dto.ChatSessionDTO
	for _, sess := range sessions {
		dtos = append(dtos, mapToChatSessionDTO(&sess))
	}
	return dtos, nil
}

func (s *autoQAService) UpdateChatSession(id uint, req *dto.UpdateChatSessionReq) (*dto.ChatSessionDTO, error) {
	var session models.ChatSession
	if err := s.db.First(&session, id).Error; err != nil {
		return nil, err
	}

	if req.Status != "" {
		session.Status = models.ChatSessionStatus(req.Status)
	}

	if err := s.db.Save(&session).Error; err != nil {
		return nil, err
	}

	return s.GetChatSessionByID(id)
}

func (s *autoQAService) DeleteChatSession(id uint) error {
	var session models.ChatSession
	if err := s.db.First(&session, id).Error; err != nil {
		return err
	}
	// Cascade delete linked AutoQA log records for this session
	s.db.Where("session_id = ?", id).Delete(&models.AutoQA{})

	return s.db.Delete(&models.ChatSession{}, id).Error
}

// DeleteOldSessions ลบห้องแชทที่สร้างมานานเกิน olderThan (ทุกสถานะ)
// ตรงกับข้อความต้อนรับที่บอกว่า "แชทนี้จะยังคงอยู่ภายใน 3 วัน"
// ลบ log ข้อความ (AutoQA) ของห้องเหล่านั้นก่อน แล้วค่อยลบตัวห้อง — เรียกจาก background job
func (s *autoQAService) DeleteOldSessions(olderThan time.Duration) (int64, error) {
	cutoff := time.Now().Add(-olderThan)

	var sessions []models.ChatSession
	if err := s.db.Where("created_at < ?", cutoff).
		Find(&sessions).Error; err != nil {
		return 0, err
	}
	if len(sessions) == 0 {
		return 0, nil
	}

	ids := make([]uint, 0, len(sessions))
	for _, sess := range sessions {
		ids = append(ids, sess.ID)
	}

	// ลบ log ข้อความของห้องเหล่านี้ก่อน (cascade) แล้วค่อยลบตัวห้อง
	s.db.Where("session_id IN ?", ids).Delete(&models.AutoQA{})
	res := s.db.Where("id IN ?", ids).Delete(&models.ChatSession{})
	return res.RowsAffected, res.Error
}

// === Q&A Matching Logic ===

func (s *autoQAService) AskQuestion(sessionID uint, req *dto.AskQuestionReq) (*dto.AskQuestionResponse, error) {
	// Verify session exists and is active
	var session models.ChatSession
	if err := s.db.First(&session, sessionID).Error; err != nil {
		return nil, ErrChatSessionNotFound
	}

	if session.Status == models.ChatSessionStatusClosed {
		return nil, ErrChatSessionClosed
	}

	// ต้องมีอย่างน้อยข้อความหรือไฟล์แนบ
	hasText := strings.TrimSpace(req.Question) != ""
	if !hasText && req.AttachmentURL == "" {
		return nil, ErrEmptyMessage
	}

	var botAnswer string
	var matchMode models.AutoQAMode = models.AutoQAModeKeywordMatch
	var bestMatch *models.AutoQA

	// ตอบอัตโนมัติเฉพาะเมื่อมี "ข้อความ" ให้จับคู่ — ถ้าส่งมาเป็นไฟล์แนบล้วน ๆ ไม่ต้องมีบอทตอบ
	if hasText {
		var templates []models.AutoQA
		if err := s.db.Where("session_id IS NULL").Find(&templates).Error; err != nil {
			return nil, err
		}

		bestScore := 0
		for i := range templates {
			score := calculateMatchScore(req.Question, templates[i].Question, templates[i].SimilarQuestion)
			if score > bestScore {
				bestScore = score
				bestMatch = &templates[i]
			}
		}

		if bestScore > 0 && bestMatch != nil {
			botAnswer = bestMatch.Answer
			matchMode = bestMatch.Mode
		} else {
			// Default fallback response
			botAnswer = "ขออภัยด้วยค่ะ ระบบยังไม่มีข้อมูลคำถามนี้ในขณะนี้ เจ้าหน้าที่จะรีบมาตอบกลับคุณโดยเร็วที่สุดค่ะ"
		}
	}

	// Create and persist the interaction log linked to this chat session
	interactionLog := models.AutoQA{
		Mode:           matchMode,
		Question:       req.Question,
		Answer:         botAnswer,
		AttachmentURL:  req.AttachmentURL,
		AttachmentType: req.AttachmentType,
		AttachmentName: req.AttachmentName,
		SessionID:      &sessionID,
	}

	if err := s.db.Create(&interactionLog).Error; err != nil {
		return nil, err
	}

	var matchDTO *dto.AutoQADTO
	if bestMatch != nil {
		d := mapToAutoQADTO(bestMatch)
		matchDTO = &d
	}

	return &dto.AskQuestionResponse{
		Answer: botAnswer,
		Match:  matchDTO,
	}, nil
}

func (s *autoQAService) AdminReply(sessionID uint, req *dto.AdminReplyReq) (*dto.AutoQADTO, error) {
	// Verify session exists and is active
	var session models.ChatSession
	if err := s.db.First(&session, sessionID).Error; err != nil {
		return nil, ErrChatSessionNotFound
	}

	if session.Status == models.ChatSessionStatusClosed {
		return nil, ErrChatSessionClosed
	}

	// ต้องมีอย่างน้อยข้อความหรือไฟล์แนบ
	if strings.TrimSpace(req.Answer) == "" && req.AttachmentURL == "" {
		return nil, ErrEmptyMessage
	}

	// Create and persist the interaction log as an admin reply
	interactionLog := models.AutoQA{
		Mode:           models.AutoQAModeAdminReply,
		Question:       "", // Admin replies don't have a user question part
		Answer:         req.Answer,
		AttachmentURL:  req.AttachmentURL,
		AttachmentType: req.AttachmentType,
		AttachmentName: req.AttachmentName,
		SessionID:      &sessionID,
	}

	if err := s.db.Create(&interactionLog).Error; err != nil {
		return nil, err
	}

	dtoRes := mapToAutoQADTO(&interactionLog)
	return &dtoRes, nil
}

// === Helper Functions ===

func calculateMatchScore(query string, question string, similarQuestion string) int {
	query = strings.ToLower(strings.TrimSpace(query))
	question = strings.ToLower(strings.TrimSpace(question))
	similarQuestion = strings.ToLower(strings.TrimSpace(similarQuestion))

	// 1. Exact match (highest priority)
	if query == question {
		return 1000
	}

	// 2. Whole question substring match
	if len(question) > 0 && (strings.Contains(query, question) || strings.Contains(question, query)) {
		return 500
	}

	// 3. Similar question keyword match (fuzzy logic)
	if len(similarQuestion) > 0 {
		keywords := strings.Split(similarQuestion, "|")
		for _, kw := range keywords {
			kw = strings.TrimSpace(kw)
			if len(kw) > 0 && strings.Contains(query, kw) {
				return 400
			}
		}
	}

	// 4. Token overlap match
	words := strings.Fields(query)
	score := 0
	for _, w := range words {
		// Ignore very short helper tokens
		if len(w) < 2 {
			continue
		}
		if strings.Contains(question, w) {
			score += 10
		}
		if len(similarQuestion) > 0 && strings.Contains(similarQuestion, w) {
			score += 8
		}
	}
	return score
}

func mapToAutoQADTO(m *models.AutoQA) dto.AutoQADTO {
	return dto.AutoQADTO{
		ID:              m.ID,
		Mode:            string(m.Mode),
		Question:        m.Question,
		SimilarQuestion: m.SimilarQuestion,
		Answer:          m.Answer,
		AttachmentURL:   m.AttachmentURL,
		AttachmentType:  m.AttachmentType,
		AttachmentName:  m.AttachmentName,
		SessionID:       m.SessionID,
		CreatedAt:       m.CreatedAt,
		UpdatedAt:       m.UpdatedAt,
	}
}

func mapToChatSessionDTO(m *models.ChatSession) dto.ChatSessionDTO {
	d := dto.ChatSessionDTO{
		ID:         m.ID,
		GuestName:  m.GuestName,
		GuestEmail: m.GuestEmail,
		GuestPhone: m.GuestPhone,
		Status:     string(m.Status),
		UserID:     m.UserID,
		CreatedAt:  m.CreatedAt,
		UpdatedAt:  m.UpdatedAt,
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

	if len(m.AutoQAs) > 0 {
		d.AutoQAs = make([]dto.AutoQADTO, len(m.AutoQAs))
		for i, q := range m.AutoQAs {
			d.AutoQAs[i] = mapToAutoQADTO(&q)
		}
	}

	return d
}
