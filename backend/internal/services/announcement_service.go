package services

import (
	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
	"errors"
	"strconv"
	"strings"
	"sync"
	"time"

	"gorm.io/gorm"
)

// Sentinel errors — ให้ controller map เป็น HTTP status code ที่ถูกต้อง
// (400/404/409) แทนที่จะเหมารวมเป็น 500 ทั้งหมด
var (
	ErrInvalidDateRange = errors.New("start date cannot be after end date")
	ErrUserNotFound     = errors.New("user not found")
	ErrCategoryNotFound = errors.New("category not found")
	ErrCategoryInUse    = errors.New("cannot delete category that is currently in use by announcements")
	// ErrInvalidLink กันลิงก์ประเภท javascript:/data: ฯลฯ ที่อาจใช้ทำ XSS ผ่านการกดลิงก์ในหน้าประกาศ
	ErrInvalidLink = errors.New("link must start with http:// or https://")
	// ErrInvalidVisibility: visibility ต้องเป็นหนึ่งใน all/guest/member เท่านั้น
	ErrInvalidVisibility = errors.New("visibility must be one of: all, guest, member")
)

// ค่าที่ยอมรับได้ของ Announcement.Visibility
const (
	VisibilityAll    = "all"
	VisibilityGuest  = "guest"
	VisibilityMember = "member"
)

type AnnouncementService interface {
	// userID มาจาก JWT ของแอดมินที่ล็อกอิน ไม่ใช่จาก body ของ client
	CreateAnnouncement(userID uint, req *dto.CreateAnnouncementReq) (*dto.AnnouncementDTO, error)
	GetAnnouncementByID(id uint) (*dto.AnnouncementDTO, error)
	GetAllAnnouncements() ([]dto.AnnouncementDTO, error)
	// GetActiveAnnouncements คืนเฉพาะประกาศที่อยู่ในช่วงเวลาแสดงผล (สำหรับหน้าเว็บสาธารณะ)
	// audience: "guest" = เฉพาะที่ visibility เป็น all/guest, "member" = เฉพาะที่ visibility เป็น all/member
	// audience ว่าง = ไม่กรอง visibility (คืนทุกค่าที่ active ตามช่วงเวลา)
	GetActiveAnnouncements(audience string) ([]dto.AnnouncementDTO, error)
	// GetGuestGalleryAnnouncements คืนประกาศที่ visibility เป็น all/guest "ทั้งหมด" ไม่กรองตามช่วงวันที่
	// (รวมประกาศเก่าที่หมดอายุไปแล้วด้วย) — ใช้กับปุ่ม "ดูรูปทั้งหมด" บนหน้าแรกสาธารณะ
	GetGuestGalleryAnnouncements() ([]dto.AnnouncementDTO, error)
	UpdateAnnouncement(id uint, req *dto.UpdateAnnouncementReq) (*dto.AnnouncementDTO, error)
	DeleteAnnouncement(id uint) error
	// DeleteExpiredAnnouncements ลบประกาศที่พ้นวันสิ้นสุดแล้วอัตโนมัติ (คืนจำนวนที่ลบ)
	DeleteExpiredAnnouncements() (int64, error)
	// IncrementViewCount เพิ่มยอดวิว — viewerKey (เช่น IP) ใช้กันการปั่นยอดซ้ำ ๆ จากคนเดิม
	IncrementViewCount(id uint, viewerKey string) error
	// SetAnnouncementPinned ปักหมุด/ยกเลิกปักหมุดประกาศ (แอดมิน)
	SetAnnouncementPinned(id uint, pinned bool) (*dto.AnnouncementDTO, error)

	// === Bookmark (ผู้ใช้ที่ล็อกอินบันทึกประกาศไว้อ่านทีหลัง) ===
	AddBookmark(userID, announcementID uint) error
	RemoveBookmark(userID, announcementID uint) error
	// GetBookmarkedAnnouncements คืนประกาศที่ผู้ใช้บันทึกไว้ (รวมที่หมดอายุแล้ว) เรียงตามเวลาที่บันทึกล่าสุด
	GetBookmarkedAnnouncements(userID uint) ([]dto.AnnouncementDTO, error)
	// GetBookmarkedIDs คืนเฉพาะ id ของประกาศที่ผู้ใช้บันทึกไว้ (ให้ฝั่งหน้าเว็บไว้ไฮไลต์ปุ่มหัวใจ)
	GetBookmarkedIDs(userID uint) ([]uint, error)

	CreateCategory(req *dto.CreateCategoryReq) (*dto.CategoryDTO, error)
	UpdateCategory(id uint, req *dto.UpdateCategoryReq) (*dto.CategoryDTO, error)
	DeleteCategory(id uint) error
	GetAllCategories() ([]dto.CategoryDTO, error)
}

// viewDedupTTL คือช่วงเวลาที่นับวิวจากผู้ชมคนเดิม (IP เดิม) ต่อประกาศเดิมได้แค่ครั้งเดียว
const viewDedupTTL = 1 * time.Hour

type announcementService struct {
	db *gorm.DB

	// กันปั่นยอดวิว — จำ (viewerKey|announcementID) ล่าสุดในหน่วยความจำ
	viewMu        sync.Mutex
	viewSeen      map[string]time.Time
	viewLastClean time.Time
}

func NewAnnouncementService(db *gorm.DB) AnnouncementService {
	return &announcementService{
		db:            db,
		viewSeen:      make(map[string]time.Time),
		viewLastClean: time.Now(),
	}
}

// shouldCountView คืน true ถ้าควรนับวิวครั้งนี้ (ยังไม่เคยนับจาก viewerKey นี้ในช่วง TTL)
// viewerKey ว่าง (ไม่รู้ IP) ให้นับปกติ — ดีกว่าไม่นับเลย
func (s *announcementService) shouldCountView(viewerKey string, id uint) bool {
	if viewerKey == "" {
		return true
	}
	key := viewerKey + "|" + strconv.FormatUint(uint64(id), 10)
	now := time.Now()

	s.viewMu.Lock()
	defer s.viewMu.Unlock()

	// เก็บกวาด key ที่หมดอายุเป็นระยะ กันแมพโตไม่จำกัด
	if now.Sub(s.viewLastClean) > viewDedupTTL {
		for k, t := range s.viewSeen {
			if now.Sub(t) > viewDedupTTL {
				delete(s.viewSeen, k)
			}
		}
		s.viewLastClean = now
	}

	if last, ok := s.viewSeen[key]; ok && now.Sub(last) < viewDedupTTL {
		return false
	}
	s.viewSeen[key] = now
	return true
}

// bangkokLocation คืนโซนเวลาไทย (Asia/Bangkok, UTC+7) เสมอ ไม่ว่า timezone ของเซิร์ฟเวอร์
// ที่รันจริงจะตั้งเป็นอะไร — กัน bug วันที่เริ่ม/สิ้นสุดประกาศคลาดเคลื่อนถ้าเซิร์ฟเวอร์รันที่ timezone อื่น (เช่น UTC)
// FixedZone เป็น fallback กรณีระบบไม่มีข้อมูล tzdata (เช่น container ที่ไม่มี tzdata ติดตั้ง)
func bangkokLocation() *time.Location {
	loc, err := time.LoadLocation("Asia/Bangkok")
	if err != nil {
		return time.FixedZone("ICT", 7*60*60)
	}
	return loc
}

// startOfDay / endOfDay ปรับ "วันที่" ที่ผู้ใช้เลือกให้ครอบคลุมทั้งวัน (อิงเวลาไทยเสมอ)
// เพื่อให้ประกาศแสดงตลอดวันที่เลือกเป็นวันสิ้นสุด แล้วค่อยหมดอายุ/ถูกลบ "เมื่อสิ้นสุดวัน"
func startOfDay(t time.Time) time.Time {
	loc := bangkokLocation()
	y, m, d := t.In(loc).Date()
	return time.Date(y, m, d, 0, 0, 0, 0, loc)
}

func endOfDay(t time.Time) time.Time {
	loc := bangkokLocation()
	y, m, d := t.In(loc).Date()
	return time.Date(y, m, d, 23, 59, 59, 0, loc)
}

// validateAnnouncementLink กันลิงก์ scheme อันตราย (javascript:, data: ฯลฯ) ที่จะถูก render
// เป็น <a href> คลิกได้ตรงๆ ในหน้ารายละเอียดประกาศฝั่งลูกค้า — อนุญาตเฉพาะ http/https หรือค่าว่าง
func validateAnnouncementLink(link string) error {
	if link == "" {
		return nil
	}
	if !strings.HasPrefix(link, "http://") && !strings.HasPrefix(link, "https://") {
		return ErrInvalidLink
	}
	return nil
}

// normalizeVisibility ตรวจและ default visibility ที่รับมาจาก client
// เว้นว่างมา = "all" (ค่าเริ่มต้น แสดงให้ทุกคนเห็น) ตามพฤติกรรมเดิมก่อนมีฟีเจอร์นี้
func normalizeVisibility(v string) (string, error) {
	if v == "" {
		return VisibilityAll, nil
	}
	switch v {
	case VisibilityAll, VisibilityGuest, VisibilityMember:
		return v, nil
	default:
		return "", ErrInvalidVisibility
	}
}

func (s *announcementService) CreateAnnouncement(userID uint, req *dto.CreateAnnouncementReq) (*dto.AnnouncementDTO, error) {
	if req.StartDate.After(req.EndDate) {
		return nil, ErrInvalidDateRange
	}

	if err := validateAnnouncementLink(req.Link); err != nil {
		return nil, err
	}

	visibility, err := normalizeVisibility(req.Visibility)
	if err != nil {
		return nil, err
	}

	// Validate user existence (userID มาจาก JWT ของแอดมินที่ล็อกอิน)
	var user models.User
	if err := s.db.First(&user, userID).Error; err != nil {
		return nil, ErrUserNotFound
	}

	// Validate category existence
	var category models.Category
	if err := s.db.First(&category, req.CategoryID).Error; err != nil {
		return nil, ErrCategoryNotFound
	}

	announcement := models.Announcement{
		Title:      req.Title,
		Content:    req.Content,
		ImageURL:   req.ImageURL,
		Link:       req.Link,
		Visibility: visibility,
		UserID:     userID,
		CategoryID: req.CategoryID,
		StartDate:  startOfDay(req.StartDate),
		EndDate:    endOfDay(req.EndDate), // ครอบคลุมถึงสิ้นวันที่เลือกเป็นวันสิ้นสุด
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
	// ประกาศที่ปักหมุดขึ้นก่อนเสมอ แล้วค่อยเรียงตามวันที่สร้างล่าสุด
	err := s.db.Preload("User").Preload("Category").Order("is_pinned DESC, created_at DESC").Find(&announcements).Error
	if err != nil {
		return nil, err
	}

	var dtos []dto.AnnouncementDTO
	for _, a := range announcements {
		dtos = append(dtos, mapToAnnouncementDTO(&a))
	}
	return dtos, nil
}

// GetActiveAnnouncements คืนเฉพาะประกาศที่ "กำลังแสดงผล" ณ ตอนนี้
// (start_date <= now <= end_date) สำหรับหน้าเว็บสาธารณะ ไม่โชว์ประกาศที่หมดอายุ
// หรือที่ยังไม่ถึงกำหนดเริ่ม
//
// audience = "guest"  → เฉพาะประกาศที่ visibility เป็น "all" หรือ "guest" (หน้าแรกก่อนล็อกอิน)
// audience = "member" → เฉพาะประกาศที่ visibility เป็น "all" หรือ "member" (แดชบอร์ดลูกค้าที่ล็อกอินแล้ว)
// audience = ""        → ไม่กรอง visibility (คืนทุกค่า) — ใช้เมื่อไม่ระบุกลุ่มเป้าหมาย
func (s *announcementService) GetActiveAnnouncements(audience string) ([]dto.AnnouncementDTO, error) {
	var announcements []models.Announcement
	now := time.Now()
	q := s.db.Preload("User").Preload("Category").
		Where("start_date <= ? AND end_date >= ?", now, now)

	switch audience {
	case VisibilityGuest:
		q = q.Where("visibility IN ?", []string{VisibilityAll, VisibilityGuest})
	case VisibilityMember:
		q = q.Where("visibility IN ?", []string{VisibilityAll, VisibilityMember})
	}

	err := q.Order("is_pinned DESC, created_at DESC").Find(&announcements).Error
	if err != nil {
		return nil, err
	}

	dtos := make([]dto.AnnouncementDTO, 0, len(announcements))
	for _, a := range announcements {
		dtos = append(dtos, mapToAnnouncementDTO(&a))
	}
	return dtos, nil
}

// GetGuestGalleryAnnouncements คืนประกาศที่ visibility เป็น "all" หรือ "guest" ทั้งหมด
// โดยไม่กรองตามช่วงวันที่แสดงผล (รวมประกาศเก่าที่หมดอายุไปแล้ว) — ใช้ป้อนแกลเลอรีรูปภาพ
// ทั้งหมดบนหน้าแรกสาธารณะ ที่ผู้เยี่ยมชมกดดูได้โดยไม่ต้องล็อกอิน
func (s *announcementService) GetGuestGalleryAnnouncements() ([]dto.AnnouncementDTO, error) {
	var announcements []models.Announcement
	err := s.db.Preload("User").Preload("Category").
		Where("visibility IN ?", []string{VisibilityAll, VisibilityGuest}).
		Order("is_pinned DESC, start_date DESC").
		Find(&announcements).Error
	if err != nil {
		return nil, err
	}

	dtos := make([]dto.AnnouncementDTO, 0, len(announcements))
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

	// pointer != nil = client ส่ง field นี้มาจริง (รวมค่าว่างเพื่อล้างค่า)
	if req.Title != nil {
		announcement.Title = *req.Title
	}
	if req.Content != nil {
		announcement.Content = *req.Content
	}
	if req.ImageURL != nil {
		announcement.ImageURL = *req.ImageURL
	}
	if req.Link != nil {
		if err := validateAnnouncementLink(*req.Link); err != nil {
			return nil, err
		}
		announcement.Link = *req.Link
	}
	if req.Visibility != nil {
		visibility, err := normalizeVisibility(*req.Visibility)
		if err != nil {
			return nil, err
		}
		announcement.Visibility = visibility
	}
	if req.CategoryID != nil {
		var category models.Category
		if err := s.db.First(&category, *req.CategoryID).Error; err != nil {
			return nil, ErrCategoryNotFound
		}
		announcement.CategoryID = *req.CategoryID
	}
	if req.StartDate != nil {
		announcement.StartDate = startOfDay(*req.StartDate)
	}
	if req.EndDate != nil {
		announcement.EndDate = endOfDay(*req.EndDate) // ครอบคลุมถึงสิ้นวันที่เลือก
	}

	if announcement.StartDate.After(announcement.EndDate) {
		return nil, ErrInvalidDateRange
	}

	if err := s.db.Save(&announcement).Error; err != nil {
		return nil, err
	}

	return s.GetAnnouncementByID(id)
}

// DeleteExpiredAnnouncements ลบประกาศที่พ้นวันสิ้นสุดแล้ว (end_date < now) แบบ soft delete
// เรียกจาก background job เป็นระยะ เพื่อให้ประกาศหายไปเองเมื่อสิ้นสุดวันที่กำหนด
func (s *announcementService) DeleteExpiredAnnouncements() (int64, error) {
	res := s.db.Where("end_date < ?", time.Now()).Delete(&models.Announcement{})
	return res.RowsAffected, res.Error
}

func (s *announcementService) DeleteAnnouncement(id uint) error {
	var announcement models.Announcement
	if err := s.db.First(&announcement, id).Error; err != nil {
		return err
	}
	return s.db.Delete(&models.Announcement{}, id).Error
}

func (s *announcementService) IncrementViewCount(id uint, viewerKey string) error {
	var announcement models.Announcement
	if err := s.db.First(&announcement, id).Error; err != nil {
		return err
	}
	// ผู้ชมคนเดิม (IP เดิม) เปิดประกาศเดิมซ้ำในช่วง TTL ไม่นับเพิ่ม — กันปั่นยอด
	if !s.shouldCountView(viewerKey, id) {
		return nil
	}
	return s.db.Model(&models.Announcement{}).Where("id = ?", id).UpdateColumn("view_count", gorm.Expr("view_count + ?", 1)).Error
}

func (s *announcementService) SetAnnouncementPinned(id uint, pinned bool) (*dto.AnnouncementDTO, error) {
	var announcement models.Announcement
	if err := s.db.First(&announcement, id).Error; err != nil {
		return nil, err
	}
	if err := s.db.Model(&models.Announcement{}).Where("id = ?", id).
		Update("is_pinned", pinned).Error; err != nil {
		return nil, err
	}
	return s.GetAnnouncementByID(id)
}

// === Bookmark ===

func (s *announcementService) AddBookmark(userID, announcementID uint) error {
	// ตรวจว่าประกาศมีอยู่จริงก่อน กันบันทึก id มั่ว
	if err := s.db.First(&models.Announcement{}, announcementID).Error; err != nil {
		return err
	}
	bookmark := models.AnnouncementBookmark{UserID: userID, AnnouncementID: announcementID}
	// ON CONFLICT DO NOTHING — บันทึกซ้ำไม่เป็นไร (idempotent) กันชน unique index
	return s.db.Where(models.AnnouncementBookmark{UserID: userID, AnnouncementID: announcementID}).
		FirstOrCreate(&bookmark).Error
}

func (s *announcementService) RemoveBookmark(userID, announcementID uint) error {
	return s.db.Where("user_id = ? AND announcement_id = ?", userID, announcementID).
		Delete(&models.AnnouncementBookmark{}).Error
}

func (s *announcementService) GetBookmarkedAnnouncements(userID uint) ([]dto.AnnouncementDTO, error) {
	var bookmarks []models.AnnouncementBookmark
	// เรียงตามเวลาที่บันทึกล่าสุด (created_at ของ bookmark) — preload ตัวประกาศ + หมวด/ผู้เขียน
	err := s.db.Where("user_id = ?", userID).
		Preload("Announcement.User").
		Preload("Announcement.Category").
		Order("created_at DESC").
		Find(&bookmarks).Error
	if err != nil {
		return nil, err
	}

	dtos := make([]dto.AnnouncementDTO, 0, len(bookmarks))
	for i := range bookmarks {
		// ประกาศอาจถูกลบไปแล้ว (Announcement เป็น nil) — ข้ามไป ไม่ให้ panic
		if bookmarks[i].Announcement == nil {
			continue
		}
		dtos = append(dtos, mapToAnnouncementDTO(bookmarks[i].Announcement))
	}
	return dtos, nil
}

func (s *announcementService) GetBookmarkedIDs(userID uint) ([]uint, error) {
	var ids []uint
	err := s.db.Model(&models.AnnouncementBookmark{}).
		Where("user_id = ?", userID).
		Pluck("announcement_id", &ids).Error
	if err != nil {
		return nil, err
	}
	return ids, nil
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
		return nil, ErrCategoryNotFound
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
		return ErrCategoryNotFound
	}
	// Check if categories are in use by announcements
	var count int64
	s.db.Model(&models.Announcement{}).Where("category_id = ?", id).Count(&count)
	if count > 0 {
		return ErrCategoryInUse
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
		Link:        m.Link,
		Visibility:  m.Visibility,
		UserID:      m.UserID,
		CategoryID:  m.CategoryID,
		StartDate:   m.StartDate,
		EndDate:     m.EndDate,
		ViewCount:   m.ViewCount,
		IsPinned:    m.IsPinned,
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
