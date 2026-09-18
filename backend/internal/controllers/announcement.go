package controllers

import (
	"errors"
	"net/http"
	"strconv"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/services"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type AnnouncementController struct {
	service services.AnnouncementService
}

func NewAnnouncementController(s services.AnnouncementService) *AnnouncementController {
	return &AnnouncementController{service: s}
}

// announcementErrorStatus map error จาก service เป็น HTTP status code ที่ถูกต้อง
// แทนการเหมาเป็น 500 ทั้งหมด เพื่อให้หน้าเว็บแยกแยะสาเหตุได้
func announcementErrorStatus(err error) int {
	switch {
	case errors.Is(err, gorm.ErrRecordNotFound):
		return http.StatusNotFound
	case errors.Is(err, services.ErrInvalidDateRange),
		errors.Is(err, services.ErrUserNotFound),
		errors.Is(err, services.ErrCategoryNotFound),
		errors.Is(err, services.ErrInvalidLink),
		errors.Is(err, services.ErrInvalidVisibility):
		return http.StatusBadRequest
	case errors.Is(err, services.ErrCategoryInUse):
		return http.StatusConflict
	default:
		return http.StatusInternalServerError
	}
}

func (ctrl *AnnouncementController) CreateAnnouncement(c *gin.Context) {
	var req dto.CreateAnnouncementReq
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// เจ้าของประกาศมาจาก JWT ของแอดมินที่ล็อกอินอยู่ ไม่รับจาก body
	userID, _, ok := GetAuthContext(c)
	if !ok {
		respondJSON(c, http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้จากโทเคน"})
		return
	}

	res, err := ctrl.service.CreateAnnouncement(userID, &req)
	if err != nil {
		respondJSON(c, announcementErrorStatus(err), gin.H{"error": err.Error()})
		return
	}

	respondJSON(c, http.StatusCreated, gin.H{"data": res})
}

func (ctrl *AnnouncementController) GetAnnouncementByID(c *gin.Context) {
	idParam := c.Param("id")
	id, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "Invalid announcement ID"})
		return
	}

	res, err := ctrl.service.GetAnnouncementByID(uint(id))
	if err != nil {
		respondJSON(c, http.StatusNotFound, gin.H{"error": "Announcement not found"})
		return
	}

	// กันประกาศเฉพาะสมาชิก (visibility=member) รั่วให้ผู้เยี่ยมชมที่เดา ID ตรง ๆ
	// ต้องล็อกอินแล้วเท่านั้น (มี role จาก OptionalAuth) ถึงเปิดดูได้ ไม่งั้นตอบ 404 เหมือนไม่มี
	if res.Visibility == services.VisibilityMember {
		if _, authed := c.Get("role"); !authed {
			respondJSON(c, http.StatusNotFound, gin.H{"error": "Announcement not found"})
			return
		}
	}

	respondJSON(c, http.StatusOK, gin.H{"data": res})
}

// GetAllAnnouncements คืนประกาศทั้งหมด (รวมที่หมดอายุ/ยังไม่เริ่ม) — สำหรับแอดมิน
func (ctrl *AnnouncementController) GetAllAnnouncements(c *gin.Context) {
	res, err := ctrl.service.GetAllAnnouncements()
	if err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	respondJSON(c, http.StatusOK, gin.H{"data": res})
}

// resolveAudience กำหนดกลุ่มเป้าหมายของประกาศจาก "สิทธิ์จริง" (JWT ผ่าน OptionalAuth)
// ไม่ใช่เชื่อค่า ?audience= ที่ client ส่งมาล้วน ๆ — กันไม่ให้ผู้เยี่ยมชมขอ ?audience=member
// แล้วเห็นประกาศเฉพาะสมาชิก
//
//	ผู้ล็อกอินแล้ว (มี role) → member (เห็น all/member)
//	ผู้เยี่ยมชม             → guest  (เห็น all/guest)
//
// client ยัง "ขอให้แคบลง" ได้ด้วย ?audience=guest (เช่นหน้าแรกที่สมาชิกเปิดดูก็ให้เห็นแบบ guest)
// แต่ "ขอให้กว้างขึ้น" (guest ขอ member) ไม่ได้ — จะถูกลดเหลือ guest เสมอ
func resolveAudience(c *gin.Context) string {
	_, authed := c.Get("role")
	switch c.Query("audience") {
	case services.VisibilityGuest:
		return services.VisibilityGuest
	case services.VisibilityMember:
		if authed {
			return services.VisibilityMember
		}
		return services.VisibilityGuest
	default:
		if authed {
			return services.VisibilityMember
		}
		return services.VisibilityGuest
	}
}

// GetActiveAnnouncements คืนเฉพาะประกาศที่กำลังแสดงผล — สำหรับหน้าเว็บสาธารณะ
// กลุ่มเป้าหมาย (guest/member) กำหนดจากสิทธิ์จริงใน resolveAudience ไม่เชื่อ query ล้วน ๆ
func (ctrl *AnnouncementController) GetActiveAnnouncements(c *gin.Context) {
	res, err := ctrl.service.GetActiveAnnouncements(resolveAudience(c))
	if err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	respondJSON(c, http.StatusOK, gin.H{"data": res})
}

// SetPinned ปักหมุด/ยกเลิกปักหมุดประกาศ (แอดมิน)
func (ctrl *AnnouncementController) SetPinned(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "Invalid announcement ID"})
		return
	}
	var req dto.PinAnnouncementReq
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	res, err := ctrl.service.SetAnnouncementPinned(uint(id), req.Pinned)
	if err != nil {
		respondJSON(c, announcementErrorStatus(err), gin.H{"error": err.Error()})
		return
	}
	respondJSON(c, http.StatusOK, gin.H{"data": res})
}

// === Bookmark (ผู้ใช้ที่ล็อกอิน) ===

// AddBookmark บันทึกประกาศไว้อ่านทีหลัง
func (ctrl *AnnouncementController) AddBookmark(c *gin.Context) {
	userID, _, ok := GetAuthContext(c)
	if !ok {
		respondJSON(c, http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้จากโทเคน"})
		return
	}
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "Invalid announcement ID"})
		return
	}
	if err := ctrl.service.AddBookmark(userID, uint(id)); err != nil {
		respondJSON(c, announcementErrorStatus(err), gin.H{"error": err.Error()})
		return
	}
	respondJSON(c, http.StatusOK, gin.H{"message": "บันทึกประกาศแล้ว"})
}

// RemoveBookmark ยกเลิกการบันทึกประกาศ
func (ctrl *AnnouncementController) RemoveBookmark(c *gin.Context) {
	userID, _, ok := GetAuthContext(c)
	if !ok {
		respondJSON(c, http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้จากโทเคน"})
		return
	}
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "Invalid announcement ID"})
		return
	}
	if err := ctrl.service.RemoveBookmark(userID, uint(id)); err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	respondJSON(c, http.StatusOK, gin.H{"message": "ยกเลิกการบันทึกแล้ว"})
}

// GetMyBookmarks คืนประกาศที่ผู้ใช้บันทึกไว้ (รวมที่หมดอายุแล้ว)
func (ctrl *AnnouncementController) GetMyBookmarks(c *gin.Context) {
	userID, _, ok := GetAuthContext(c)
	if !ok {
		respondJSON(c, http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้จากโทเคน"})
		return
	}
	res, err := ctrl.service.GetBookmarkedAnnouncements(userID)
	if err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	respondJSON(c, http.StatusOK, gin.H{"data": res})
}

// GetMyBookmarkIDs คืนเฉพาะ id ของประกาศที่บันทึกไว้ (ให้หน้าเว็บไฮไลต์ปุ่มหัวใจในฟีด)
func (ctrl *AnnouncementController) GetMyBookmarkIDs(c *gin.Context) {
	userID, _, ok := GetAuthContext(c)
	if !ok {
		respondJSON(c, http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้จากโทเคน"})
		return
	}
	ids, err := ctrl.service.GetBookmarkedIDs(userID)
	if err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	respondJSON(c, http.StatusOK, gin.H{"data": ids})
}

// GetGuestGallery คืนประกาศที่ visibility เป็น all/guest ทั้งหมด (รวมที่หมดอายุแล้ว)
// ใช้กับปุ่ม "ดูรูปทั้งหมด" บนหน้าแรกสาธารณะ — ไม่ต้องล็อกอิน
func (ctrl *AnnouncementController) GetGuestGallery(c *gin.Context) {
	res, err := ctrl.service.GetGuestGalleryAnnouncements()
	if err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	respondJSON(c, http.StatusOK, gin.H{"data": res})
}

func (ctrl *AnnouncementController) UpdateAnnouncement(c *gin.Context) {
	idParam := c.Param("id")
	id, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "Invalid announcement ID"})
		return
	}

	var req dto.UpdateAnnouncementReq
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	res, err := ctrl.service.UpdateAnnouncement(uint(id), &req)
	if err != nil {
		respondJSON(c, announcementErrorStatus(err), gin.H{"error": err.Error()})
		return
	}

	respondJSON(c, http.StatusOK, gin.H{"data": res})
}

func (ctrl *AnnouncementController) DeleteAnnouncement(c *gin.Context) {
	idParam := c.Param("id")
	id, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "Invalid announcement ID"})
		return
	}

	err = ctrl.service.DeleteAnnouncement(uint(id))
	if err != nil {
		respondJSON(c, announcementErrorStatus(err), gin.H{"error": err.Error()})
		return
	}

	respondJSON(c, http.StatusOK, gin.H{"message": "Announcement deleted successfully"})
}

func (ctrl *AnnouncementController) IncrementViewCount(c *gin.Context) {
	idParam := c.Param("id")
	id, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "Invalid announcement ID"})
		return
	}

	// c.ClientIP() เชื่อถือได้เพราะตั้ง SetTrustedProxies(nil) ไว้ (คืน IP จริงของ TCP ปลอมไม่ได้)
	err = ctrl.service.IncrementViewCount(uint(id), c.ClientIP())
	if err != nil {
		respondJSON(c, announcementErrorStatus(err), gin.H{"error": err.Error()})
		return
	}

	respondJSON(c, http.StatusOK, gin.H{"message": "View count incremented successfully"})
}

func (ctrl *AnnouncementController) CreateCategory(c *gin.Context) {
	var req dto.CreateCategoryReq
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	res, err := ctrl.service.CreateCategory(&req)
	if err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	respondJSON(c, http.StatusCreated, gin.H{"data": res})
}

func (ctrl *AnnouncementController) UpdateCategory(c *gin.Context) {
	idParam := c.Param("id")
	id, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "Invalid category ID"})
		return
	}

	var req dto.UpdateCategoryReq
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	res, err := ctrl.service.UpdateCategory(uint(id), &req)
	if err != nil {
		respondJSON(c, announcementErrorStatus(err), gin.H{"error": err.Error()})
		return
	}

	respondJSON(c, http.StatusOK, gin.H{"data": res})
}

func (ctrl *AnnouncementController) DeleteCategory(c *gin.Context) {
	idParam := c.Param("id")
	id, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "Invalid category ID"})
		return
	}

	err = ctrl.service.DeleteCategory(uint(id))
	if err != nil {
		respondJSON(c, announcementErrorStatus(err), gin.H{"error": err.Error()})
		return
	}

	respondJSON(c, http.StatusOK, gin.H{"message": "Category deleted successfully"})
}

func (ctrl *AnnouncementController) GetAllCategories(c *gin.Context) {
	res, err := ctrl.service.GetAllCategories()
	if err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	respondJSON(c, http.StatusOK, gin.H{"data": res})

}
