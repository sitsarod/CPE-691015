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
		errors.Is(err, services.ErrCategoryNotFound):
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
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// เจ้าของประกาศมาจาก JWT ของแอดมินที่ล็อกอินอยู่ ไม่รับจาก body
	userID, _, ok := GetAuthContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้จากโทเคน"})
		return
	}

	res, err := ctrl.service.CreateAnnouncement(userID, &req)
	if err != nil {
		c.JSON(announcementErrorStatus(err), gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": res})
}

func (ctrl *AnnouncementController) GetAnnouncementByID(c *gin.Context) {
	idParam := c.Param("id")
	id, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid announcement ID"})
		return
	}

	res, err := ctrl.service.GetAnnouncementByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Announcement not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": res})
}

// GetAllAnnouncements คืนประกาศทั้งหมด (รวมที่หมดอายุ/ยังไม่เริ่ม) — สำหรับแอดมิน
func (ctrl *AnnouncementController) GetAllAnnouncements(c *gin.Context) {
	res, err := ctrl.service.GetAllAnnouncements()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": res})
}

// GetActiveAnnouncements คืนเฉพาะประกาศที่กำลังแสดงผล — สำหรับหน้าเว็บสาธารณะ
func (ctrl *AnnouncementController) GetActiveAnnouncements(c *gin.Context) {
	res, err := ctrl.service.GetActiveAnnouncements()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (ctrl *AnnouncementController) UpdateAnnouncement(c *gin.Context) {
	idParam := c.Param("id")
	id, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid announcement ID"})
		return
	}

	var req dto.UpdateAnnouncementReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	res, err := ctrl.service.UpdateAnnouncement(uint(id), &req)
	if err != nil {
		c.JSON(announcementErrorStatus(err), gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (ctrl *AnnouncementController) DeleteAnnouncement(c *gin.Context) {
	idParam := c.Param("id")
	id, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid announcement ID"})
		return
	}

	err = ctrl.service.DeleteAnnouncement(uint(id))
	if err != nil {
		c.JSON(announcementErrorStatus(err), gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Announcement deleted successfully"})
}

func (ctrl *AnnouncementController) IncrementViewCount(c *gin.Context) {
	idParam := c.Param("id")
	id, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid announcement ID"})
		return
	}

	err = ctrl.service.IncrementViewCount(uint(id))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "View count incremented successfully"})
}

func (ctrl *AnnouncementController) CreateCategory(c *gin.Context) {
	var req dto.CreateCategoryReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	res, err := ctrl.service.CreateCategory(&req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": res})
}

func (ctrl *AnnouncementController) UpdateCategory(c *gin.Context) {
	idParam := c.Param("id")
	id, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid category ID"})
		return
	}

	var req dto.UpdateCategoryReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	res, err := ctrl.service.UpdateCategory(uint(id), &req)
	if err != nil {
		c.JSON(announcementErrorStatus(err), gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (ctrl *AnnouncementController) DeleteCategory(c *gin.Context) {
	idParam := c.Param("id")
	id, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid category ID"})
		return
	}

	err = ctrl.service.DeleteCategory(uint(id))
	if err != nil {
		c.JSON(announcementErrorStatus(err), gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Category deleted successfully"})
}

func (ctrl *AnnouncementController) GetAllCategories(c *gin.Context) {
	res, err := ctrl.service.GetAllCategories()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": res})

}
