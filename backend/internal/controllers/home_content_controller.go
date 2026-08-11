package controllers

import (
	"net/http"
	"strconv"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/services"

	"github.com/gin-gonic/gin"
)

type HomeContentController struct {
	service services.HomeContentService
}

func NewHomeContentController(s services.HomeContentService) *HomeContentController {
	return &HomeContentController{service: s}
}

// GetPublicHome (public) — เนื้อหาหน้าแรกทั้งก้อน (content + active slides + featured coaches)
func (ctrl *HomeContentController) GetPublicHome(c *gin.Context) {
	res, err := ctrl.service.GetPublicHome()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

// GetHomeContent (admin) — เฉพาะส่วน content
func (ctrl *HomeContentController) GetHomeContent(c *gin.Context) {
	res, err := ctrl.service.GetHomeContent()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (ctrl *HomeContentController) UpdateHomeContent(c *gin.Context) {
	var req dto.UpdateHomeContentReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	res, err := ctrl.service.UpdateHomeContent(&req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

// --- Hero slides ---

func (ctrl *HomeContentController) GetSlides(c *gin.Context) {
	activeOnly := c.Query("active") == "true"
	res, err := ctrl.service.ListSlides(activeOnly)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (ctrl *HomeContentController) CreateSlide(c *gin.Context) {
	var req dto.CreateHeroSlideReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	res, err := ctrl.service.CreateSlide(&req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": res})
}

func (ctrl *HomeContentController) UpdateSlide(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid slide ID"})
		return
	}
	var req dto.UpdateHeroSlideReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	res, err := ctrl.service.UpdateSlide(uint(id), &req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (ctrl *HomeContentController) DeleteSlide(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid slide ID"})
		return
	}
	if err := ctrl.service.DeleteSlide(uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Slide deleted successfully"})
}

func (ctrl *HomeContentController) ReorderSlides(c *gin.Context) {
	var req dto.ReorderHeroSlidesReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := ctrl.service.ReorderSlides(req.OrderedIDs); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Slides reordered successfully"})
}

// --- Coaches (สำหรับส่วนบุคลากรหน้าแรก) ---

// GetPublicCoaches (public) — โค้ชที่ถูกเลือกให้แสดงหน้าแรก
func (ctrl *HomeContentController) GetPublicCoaches(c *gin.Context) {
	res, err := ctrl.service.ListCoaches(true)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

// GetAllCoachesForHome (admin) — โค้ชทั้งหมด พร้อมสถานะ feature_on_home ให้แอดมินเลือก
func (ctrl *HomeContentController) GetAllCoachesForHome(c *gin.Context) {
	res, err := ctrl.service.ListCoaches(false)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (ctrl *HomeContentController) SetCoachFeature(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid coach ID"})
		return
	}
	var req dto.FeatureCoachReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	res, err := ctrl.service.SetCoachFeature(uint(id), req.FeatureOnHome)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}
