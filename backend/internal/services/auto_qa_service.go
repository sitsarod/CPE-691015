package services

import (
	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"net/url"
	"os"
	"path/filepath"
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
	ErrMessageNotFound     = errors.New("message not found")
	ErrCannotModifyMessage = errors.New("this message cannot be edited or deleted")
	// ErrInvalidAttachment กันแนบ URL ไฟล์จากภายนอกระบบ (เช่น tracking pixel/ลิงก์ปลอม)
	// อนุญาตเฉพาะไฟล์ที่อัปโหลดผ่าน endpoint ของเราเท่านั้น
	ErrInvalidAttachment = errors.New("attachment url is not allowed")
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
	// AuthorizeSession ตรวจว่า token ที่แนบมาตรงกับกุญแจลับของห้องนี้จริง (กัน IDOR)
	// คืน ErrChatSessionNotFound เมื่อไม่ตรง/ไม่มีห้อง โดยไม่บอกว่าห้องมีอยู่จริงหรือไม่
	AuthorizeSession(sessionID uint, token string) error
	GetAllChatSessions() ([]dto.ChatSessionDTO, error)
	UpdateChatSession(id uint, req *dto.UpdateChatSessionReq) (*dto.ChatSessionDTO, error)
	DeleteChatSession(id uint) error
	// DeleteOldSessions ลบห้องแชทที่สร้างมานานเกิน olderThan (ทุกสถานะ) พร้อม log ข้อความ
	DeleteOldSessions(olderThan time.Duration) (int64, error)

	// Q&A logic
	AskQuestion(sessionID uint, req *dto.AskQuestionReq) (*dto.AskQuestionResponse, error)
	AdminReply(sessionID uint, req *dto.AdminReplyReq) (*dto.AutoQADTO, error)

	// แก้ไข/ลบข้อความของลูกค้าในห้องแชท (เฉพาะข้อความของลูกค้าเอง ไม่ใช่ของแอดมิน)
	EditUserMessage(sessionID, msgID uint, req *dto.EditMessageReq) (*dto.AutoQADTO, error)
	DeleteUserMessage(sessionID, msgID uint) error
}

type autoQAService struct {
	db *gorm.DB
	// cloud อาจเป็น nil ได้ (ไม่ได้ตั้งค่า Cloudinary) — ตอนนั้นไฟล์แนบเก็บในเครื่องแทน
	cloud *CloudinaryService
}

func NewAutoQAService(db *gorm.DB, cloud *CloudinaryService) AutoQAService {
	return &autoQAService{db: db, cloud: cloud}
}

// validateChatAttachmentURL ตรวจว่า URL ไฟล์แนบมาจากระบบเราจริง (กันแนบลิงก์ภายนอก)
// อนุญาต 2 แบบ: Cloudinary บัญชีเดียวกับที่ตั้งค่าไว้ หรือไฟล์ในเครื่องบนโฮสต์ของเราเอง
// ค่าว่าง = ไม่มีไฟล์แนบ ถือว่าผ่าน
func (s *autoQAService) validateChatAttachmentURL(rawURL string) error {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return nil
	}

	u, err := url.Parse(rawURL)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return ErrInvalidAttachment
	}

	// 1) Cloudinary ของเรา — ต้อง parse เป็น asset ได้ และเป็น cloud เดียวกับที่ตั้งค่า
	if strings.EqualFold(u.Host, "res.cloudinary.com") {
		if _, _, ok := CloudinaryAssetFromURL(rawURL); !ok {
			return ErrInvalidAttachment
		}
		if s.cloud != nil {
			if name := s.cloud.CloudName(); name != "" && !strings.HasPrefix(u.Path, "/"+name+"/") {
				return ErrInvalidAttachment
			}
		}
		return nil
	}

	// 2) ไฟล์ในเครื่อง: path ต้องขึ้นต้น /uploads/chat/ และต้องเป็นโฮสต์ของเราเอง
	// (กันกรณี evil.com/uploads/chat/x.jpg ที่ path คล้ายแต่คนละโฮสต์)
	if strings.HasPrefix(u.Path, "/uploads/chat/") && isOwnHost(u.Host) {
		return nil
	}
	return ErrInvalidAttachment
}

// isOwnHost ตรวจว่า host เป็นของเซิร์ฟเวอร์เราเอง — localhost หรือโฮสต์ที่ตั้งใน PUBLIC_BASE_URL
func isOwnHost(host string) bool {
	strip := func(h string) string {
		h = strings.ToLower(h)
		if i := strings.IndexByte(h, ':'); i >= 0 {
			h = h[:i]
		}
		return h
	}
	h := strip(host)
	if h == "localhost" || h == "127.0.0.1" {
		return true
	}
	if base := strings.TrimSpace(os.Getenv("PUBLIC_BASE_URL")); base != "" {
		if bu, err := url.Parse(base); err == nil && bu.Host != "" {
			return strip(bu.Host) == h
		}
	}
	return false
}

// generateChatToken สร้างกุญแจลับสุ่ม 256 บิต (hex 64 ตัวอักษร) ประจำห้องแชท
func generateChatToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
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

	// mode/question/answer เป็นฟิลด์บังคับ — อัปเดตเมื่อส่งมาและไม่ว่างเท่านั้น
	if req.Mode != nil && *req.Mode != "" {
		qa.Mode = models.AutoQAMode(*req.Mode)
	}
	if req.Question != nil && *req.Question != "" {
		qa.Question = *req.Question
	}
	if req.Answer != nil && *req.Answer != "" {
		qa.Answer = *req.Answer
	}
	// similar_question ไม่บังคับ — ส่ง "" มาได้เพื่อ "ล้างคีย์เวิร์ดทั้งหมด" (nil = ไม่แตะ)
	if req.SimilarQuestion != nil {
		qa.SimilarQuestion = *req.SimilarQuestion
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

	// กุญแจลับประจำห้อง — ใช้ยืนยันสิทธิ์เข้าถึงแทนการเดา ID (กัน IDOR)
	accessToken, err := generateChatToken()
	if err != nil {
		return nil, err
	}

	session := models.ChatSession{
		GuestName:   guestName,
		GuestEmail:  req.GuestEmail,
		GuestPhone:  req.GuestPhone,
		Status:      models.ChatSessionStatusActive,
		UserID:      req.UserID,
		AccessToken: accessToken,
	}

	if err := s.db.Create(&session).Error; err != nil {
		return nil, err
	}

	res, err := s.GetChatSessionByID(session.ID)
	if err != nil {
		return nil, err
	}
	// ส่ง token กลับให้เจ้าของห้องเก็บไว้ "เฉพาะตอนสร้าง" เท่านั้น (ครั้งเดียว)
	res.AccessToken = accessToken
	return res, nil
}

func (s *autoQAService) AuthorizeSession(sessionID uint, token string) error {
	token = strings.TrimSpace(token)
	if token == "" {
		return ErrChatSessionNotFound
	}

	var session models.ChatSession
	if err := s.db.Select("id", "access_token").First(&session, sessionID).Error; err != nil {
		return ErrChatSessionNotFound
	}
	// ห้องเก่าก่อนมีระบบ token (access_token ว่าง) เข้าผ่านช่องสาธารณะไม่ได้อีก
	// กันเคสส่ง token ว่างมาแล้วบังเอิญตรงกับค่าว่างในฐาน
	if session.AccessToken == "" {
		return ErrChatSessionNotFound
	}
	// เทียบแบบ constant-time กัน timing attack เดา token ทีละไบต์
	if subtle.ConstantTimeCompare([]byte(session.AccessToken), []byte(token)) != 1 {
		return ErrChatSessionNotFound
	}
	return nil
}

func (s *autoQAService) GetChatSessionByID(id uint) (*dto.ChatSessionDTO, error) {
	var session models.ChatSession
	// Preload the User and the logged AutoQAs messages for this session
	// เรียงข้อความตาม id (ลำดับการสร้าง = เรียงตามเวลาจริง) — ถ้าไม่สั่ง ORDER BY
	// Postgres ไม่การันตีลำดับ ทำให้ข้อความสลับตำแหน่ง (เช่นข้อความล่าสุดไปโผล่บนสุด)
	err := s.db.Preload("User").
		Preload("AutoQAs", func(db *gorm.DB) *gorm.DB {
			return db.Order("id ASC")
		}).
		First(&session, id).Error
	if err != nil {
		return nil, err
	}
	dtoRes := mapToChatSessionDTO(&session)
	return &dtoRes, nil
}

func (s *autoQAService) GetAllChatSessions() ([]dto.ChatSessionDTO, error) {
	var sessions []models.ChatSession
	// Preload AutoQAs เพื่อให้หน้าแอดมิน (badge แจ้งเตือนข้อความใหม่) รู้เวลาของข้อความล่าสุดในแต่ละห้อง
	// โดยไม่ต้องยิง API แยกทีละห้อง — เรียงข้อความตาม id เพื่อให้ลำดับคงที่
	if err := s.db.Preload("User").
		Preload("AutoQAs", func(db *gorm.DB) *gorm.DB {
			return db.Order("id ASC")
		}).
		Order("created_at DESC").Find(&sessions).Error; err != nil {
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

	// อัปเดตเฉพาะคอลัมน์ status — ห้ามใช้ Save ทั้ง struct เพราะจะเขียนทับ access_token ด้วย
	// ห้องเก่าที่ access_token เป็น NULL จะถูกเขียนกลับเป็น '' แล้วชน unique index กับห้องเก่าอื่น
	if req.Status != "" {
		if err := s.db.Model(&models.ChatSession{}).
			Where("id = ?", id).
			Update("status", req.Status).Error; err != nil {
			return nil, err
		}
	}

	return s.GetChatSessionByID(id)
}

func (s *autoQAService) DeleteChatSession(id uint) error {
	var session models.ChatSession
	if err := s.db.First(&session, id).Error; err != nil {
		return err
	}

	// ลบไฟล์แนบของทุกข้อความในห้องออกจาก storage ก่อน (กัน orphan/PII ค้าง)
	s.purgeSessionAttachments([]uint{id})

	// hard delete (Unscoped) — ลบถาวรทั้ง log ข้อความและตัวห้อง ไม่เหลือ soft-deleted ค้างในฐาน
	// เพราะเป็นข้อมูลส่วนบุคคล (PII) และไม่มี UI กู้คืน การเก็บ soft delete ไว้จึงมีแต่ข้อเสีย
	if err := s.db.Unscoped().Where("session_id = ?", id).Delete(&models.AutoQA{}).Error; err != nil {
		return err
	}
	return s.db.Unscoped().Delete(&models.ChatSession{}, id).Error
}

// purgeSessionAttachments ลบไฟล์แนบของทุกข้อความในห้องที่ระบุออกจาก storage จริง
// (Cloudinary หรือไฟล์ในเครื่อง) — best-effort เก็บ log ถ้าลบไม่สำเร็จ แต่ไม่ขัดการลบห้อง
func (s *autoQAService) purgeSessionAttachments(sessionIDs []uint) {
	if len(sessionIDs) == 0 {
		return
	}
	var rows []models.AutoQA
	if err := s.db.
		Where("session_id IN ? AND attachment_url <> ''", sessionIDs).
		Find(&rows).Error; err != nil {
		log.Printf("อ่านรายการไฟล์แนบเพื่อลบไม่สำเร็จ: %v", err)
		return
	}
	for i := range rows {
		s.deleteAttachmentFile(rows[i].AttachmentURL)
	}
}

// deleteAttachmentFile ลบไฟล์แนบหนึ่งไฟล์ออกจาก storage ตามชนิดของ URL
//   - URL ของ Cloudinary → เรียก DestroyPublicAsset (ถ้าตั้งค่า Cloudinary ไว้)
//   - URL ไฟล์ในเครื่อง (.../uploads/chat/<file>) → os.Remove
func (s *autoQAService) deleteAttachmentFile(url string) {
	url = strings.TrimSpace(url)
	if url == "" {
		return
	}

	if publicID, resourceType, ok := CloudinaryAssetFromURL(url); ok {
		if s.cloud != nil {
			if err := s.cloud.DestroyPublicAsset(context.Background(), publicID, resourceType); err != nil {
				log.Printf("ลบไฟล์แนบแชทบน Cloudinary ไม่สำเร็จ (%s): %v", publicID, err)
			}
		}
		return
	}

	// ไฟล์ในเครื่อง: ตัดเอาเฉพาะชื่อไฟล์ท้าย path แล้ว os.Remove — filepath.Base กัน path traversal
	if idx := strings.Index(url, "/uploads/chat/"); idx >= 0 {
		name := filepath.Base(url[idx+len("/uploads/chat/"):])
		if name == "" || name == "." || name == string(filepath.Separator) {
			return
		}
		p := filepath.Join("./uploads", "chat", name)
		if err := os.Remove(p); err != nil && !os.IsNotExist(err) {
			log.Printf("ลบไฟล์แนบแชทในเครื่องไม่สำเร็จ (%s): %v", p, err)
		}
	}
}

// DeleteOldSessions ลบเฉพาะห้องแชทของ "ผู้เยี่ยมชม" (guest, user_id IS NULL) ที่สร้างมานานเกิน olderThan
// ห้องแชทของผู้ใช้ที่ล็อกอินแล้วจะไม่ถูกลบอัตโนมัติ เพื่อรักษาประวัติการแชทของลูกค้า
// ตรงกับข้อความต้อนรับที่บอกว่า "แชทนี้จะยังคงอยู่ภายใน 7 วัน" (guest เท่านั้น)
// ลบ log ข้อความ (AutoQA) ของห้องเหล่านั้นก่อน แล้วค่อยลบตัวห้อง — เรียกจาก background job
func (s *autoQAService) DeleteOldSessions(olderThan time.Duration) (int64, error) {
	cutoff := time.Now().Add(-olderThan)

	var sessions []models.ChatSession
	if err := s.db.Where("created_at < ? AND user_id IS NULL", cutoff).
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

	// ลบไฟล์แนบออกจาก storage ก่อน แล้ว hard delete (Unscoped) ทั้ง log ข้อความและตัวห้อง
	// ให้หายถาวรตามคำสัญญา "แชทนี้จะยังคงอยู่ภายใน 7 วัน" และหลัก data minimization (PDPA)
	s.purgeSessionAttachments(ids)
	s.db.Unscoped().Where("session_id IN ?", ids).Delete(&models.AutoQA{})
	res := s.db.Unscoped().Where("id IN ?", ids).Delete(&models.ChatSession{})
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

	// ไฟล์แนบต้องมาจากระบบเราเท่านั้น (กันแนบ URL ภายนอก)
	if err := s.validateChatAttachmentURL(req.AttachmentURL); err != nil {
		return nil, err
	}

	var botAnswer string
	var matchMode models.AutoQAMode = models.AutoQAModeKeywordMatch
	var bestMatch *models.AutoQA

	// บอทตอบอัตโนมัติ "เฉพาะห้องของผู้เยี่ยมชม" (guest, ไม่มี user_id) เท่านั้น
	// ผู้ใช้ที่ล็อกอินแล้ว (มี user_id) ให้คุยกับแอดมินตรง ๆ ไม่มีคำตอบอัตโนมัติแทรก
	// และตอบเฉพาะเมื่อมี "ข้อความ" ให้จับคู่ — ถ้าส่งมาเป็นไฟล์แนบล้วน ๆ ไม่ต้องมีบอทตอบ
	if hasText && session.UserID == nil {
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
			botAnswer = "ระบบได้รับข้อความของคุณแล้ว แอดมินจะรีบเข้ามาตอบกลับโดยเร็วที่สุดค่ะ"
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

	// แจ้งเตือนแอดมินทุกคนแบบเรียลไทม์ผ่าน SSE ที่มีอยู่แล้ว (ระบบ Notification ทั่วไป)
	// แทนที่จะให้หน้าแอดมิน poll ถามเองเป็นระยะ — หน้าเว็บจะได้สัญญาณแล้วค่อยไป fetch ข้อมูลจริง
	// signature ผูกกับ ID ข้อความนี้เจาะจง กันไม่ให้ dedup ทับข้อความอื่นในห้องเดียวกัน
	if hasText || req.AttachmentURL != "" {
		guestLabel := strings.TrimSpace(session.GuestName)
		if guestLabel == "" {
			guestLabel = "ผู้เยี่ยมชม"
		}
		preview := strings.TrimSpace(req.Question)
		if preview == "" && req.AttachmentURL != "" {
			preview = "[ไฟล์แนบ]"
		}
		NotifyAdmins(
			s.db,
			"chat_message",
			fmt.Sprintf("chat-msg-%d", interactionLog.ID),
			fmt.Sprintf("ข้อความใหม่จาก %s", guestLabel),
			preview,
			fmt.Sprintf("/admin/chat-sessions?session=%d", sessionID),
			"info",
		)
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

	// ไฟล์แนบต้องมาจากระบบเราเท่านั้น (กันแนบ URL ภายนอก)
	if err := s.validateChatAttachmentURL(req.AttachmentURL); err != nil {
		return nil, err
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

	// แจ้งเตือนแบบเรียลไทม์ผ่าน SSE ให้ฝั่งลูกค้า/ผู้เยี่ยมชมที่กำลังเปิดกล่องแชทอยู่ — ใช้ ChatHub
	// (ผูกกับ session ID) ครอบคลุมทั้งผู้เยี่ยมชมที่ไม่ได้ล็อกอินและสมาชิกที่ล็อกอิน ต่างจาก NotifHub
	// ด้านล่างที่ต้องมี JWT จึงใช้ได้เฉพาะสมาชิกที่ล็อกอินเท่านั้น
	ChatHub.Publish(sessionID)

	// แจ้งเตือนลูกค้าแบบเรียลไทม์ผ่าน SSE ของระบบ Notification ทั่วไป — เฉพาะกรณีเป็นสมาชิกที่ล็อกอินอยู่
	// (มี user_id ผูกกับห้อง) เพิ่มเติมจาก ChatHub ด้านบน เพื่อให้ badge กระดิ่งแจ้งเตือนทั่วไปเห็นด้วย
	if session.UserID != nil {
		preview := strings.TrimSpace(req.Answer)
		if preview == "" && req.AttachmentURL != "" {
			preview = "[ไฟล์แนบ]"
		}
		CreateNotification(
			s.db,
			*session.UserID,
			"chat_reply",
			fmt.Sprintf("chat-msg-%d", interactionLog.ID),
			"แอดมินตอบกลับข้อความของคุณ",
			preview,
			"", // ไม่มีหน้าแยกสำหรับแชท — กล่องแชทเป็น widget ลอยที่เปิดจากปุ่ม "สอบถาม" เอง ไม่ใช่หน้า route
			"info",
		)
	}

	dtoRes := mapToAutoQADTO(&interactionLog)
	return &dtoRes, nil
}

// loadOwnUserMessage โหลดข้อความในห้องแชทและตรวจว่าเป็น "ข้อความของลูกค้าเอง" ที่แก้/ลบได้
// เงื่อนไข: ต้องอยู่ในห้องนี้จริง และไม่ใช่ข้อความของแอดมิน (mode=admin_reply)
func (s *autoQAService) loadOwnUserMessage(sessionID, msgID uint) (*models.AutoQA, error) {
	var qa models.AutoQA
	if err := s.db.First(&qa, msgID).Error; err != nil {
		return nil, ErrMessageNotFound
	}
	if qa.SessionID == nil || *qa.SessionID != sessionID {
		return nil, ErrMessageNotFound
	}
	if qa.Mode == models.AutoQAModeAdminReply {
		return nil, ErrCannotModifyMessage
	}
	return &qa, nil
}

func (s *autoQAService) EditUserMessage(sessionID, msgID uint, req *dto.EditMessageReq) (*dto.AutoQADTO, error) {
	qa, err := s.loadOwnUserMessage(sessionID, msgID)
	if err != nil {
		return nil, err
	}
	// ต้องเหลือข้อความหรือไฟล์แนบอย่างน้อยอย่างหนึ่ง
	if strings.TrimSpace(req.Question) == "" && qa.AttachmentURL == "" {
		return nil, ErrEmptyMessage
	}
	qa.Question = req.Question
	if err := s.db.Save(qa).Error; err != nil {
		return nil, err
	}
	d := mapToAutoQADTO(qa)
	return &d, nil
}

func (s *autoQAService) DeleteUserMessage(sessionID, msgID uint) error {
	if _, err := s.loadOwnUserMessage(sessionID, msgID); err != nil {
		return err
	}
	return s.db.Delete(&models.AutoQA{}, msgID).Error
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

	// 4. Token overlap match — ได้ผลกับข้อความที่เว้นวรรค (อังกฤษ/ตัวเลข)
	words := strings.Fields(query)
	score := 0
	for _, w := range words {
		// Ignore very short helper tokens
		if len([]rune(w)) < 2 {
			continue
		}
		if strings.Contains(question, w) {
			score += 10
		}
		if len(similarQuestion) > 0 && strings.Contains(similarQuestion, w) {
			score += 8
		}
	}

	// 5. Character n-gram overlap — รองรับ "ภาษาไทยที่เขียนติดกันไม่มีเว้นวรรค"
	// ซึ่งขั้นที่ 4 (แยกคำด้วยช่องว่าง) ทำแทบไม่ได้ผล เทียบ bigram ของตัวอักษร
	// ระหว่าง query กับ (question + คีย์เวิร์ด) แล้วให้คะแนนตามสัดส่วนที่ซ้อนทับ
	// เพดานต่ำกว่า tier ที่แม่นกว่า (สูงสุด ~300) เพื่อไม่ให้ทับการจับคู่ที่ตรงกว่า
	if ng := ngramOverlapScore(query, question+" "+similarQuestion); ng > score {
		score = ng
	}
	return score
}

// ngramOverlapScore ให้คะแนนความคล้ายด้วยสัดส่วน bigram ของตัวอักษรที่ query ไปพบใน target
// (ตัดช่องว่างออกก่อน เพื่อให้ใช้กับภาษาไทยที่ไม่มีการเว้นวรรคได้) — คืน 0 ถ้าซ้อนทับน้อยเกินไป
func ngramOverlapScore(query, target string) int {
	qr := []rune(strings.ReplaceAll(query, " ", ""))
	tr := []rune(strings.ReplaceAll(target, " ", ""))
	// query สั้นเกินไป (น้อยกว่า 2 bigram) ปล่อยให้ tier อื่นตัดสิน กัน noise
	if len(qr) < 3 || len(tr) < 2 {
		return 0
	}

	qset := runeBigrams(qr)
	if len(qset) == 0 {
		return 0
	}
	tset := runeBigrams(tr)

	overlap := 0
	for g := range qset {
		if tset[g] {
			overlap++
		}
	}
	ratio := float64(overlap) / float64(len(qset)) // สัดส่วนของ query ที่พบใน target
	if ratio < 0.5 {
		return 0 // ต้องซ้อนทับเกินครึ่งถึงนับว่าเกี่ยวข้อง
	}
	return int(ratio * 300) // สเกล 0..300 (ต่ำกว่า substring=500 / keyword=400)
}

// runeBigrams คืนเซตของคู่ตัวอักษรติดกัน (bigram) ที่ไม่ซ้ำ
func runeBigrams(rs []rune) map[string]bool {
	set := make(map[string]bool)
	for i := 0; i+1 < len(rs); i++ {
		set[string(rs[i:i+2])] = true
	}
	return set
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
