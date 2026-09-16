package controllers

import (
	"errors"
	"log"
	"net/http"
	"strconv"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/services"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
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
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	respondJSON(c, http.StatusOK, gin.H{"data": res})
}

// GetHomeContent (admin) — เฉพาะส่วน content
func (ctrl *HomeContentController) GetHomeContent(c *gin.Context) {
	res, err := ctrl.service.GetHomeContent()
	if err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	respondJSON(c, http.StatusOK, gin.H{"data": res})
}

func (ctrl *HomeContentController) UpdateHomeContent(c *gin.Context) {
	var req dto.UpdateHomeContentReq
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	res, err := ctrl.service.UpdateHomeContent(&req)
	if err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	respondJSON(c, http.StatusOK, gin.H{"data": res})
}

// --- Hero slides ---

func (ctrl *HomeContentController) GetSlides(c *gin.Context) {
	activeOnly := c.Query("active") == "true"
	res, err := ctrl.service.ListSlides(activeOnly)
	if err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	respondJSON(c, http.StatusOK, gin.H{"data": res})
}

func (ctrl *HomeContentController) CreateSlide(c *gin.Context) {
	var req dto.CreateHeroSlideReq
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	res, err := ctrl.service.CreateSlide(&req)
	if err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	respondJSON(c, http.StatusCreated, gin.H{"data": res})
}

func (ctrl *HomeContentController) UpdateSlide(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "Invalid slide ID"})
		return
	}
	var req dto.UpdateHeroSlideReq
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	res, err := ctrl.service.UpdateSlide(uint(id), &req)
	if err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	respondJSON(c, http.StatusOK, gin.H{"data": res})
}

func (ctrl *HomeContentController) DeleteSlide(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "Invalid slide ID"})
		return
	}
	if err := ctrl.service.DeleteSlide(uint(id)); err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	respondJSON(c, http.StatusOK, gin.H{"message": "Slide deleted successfully"})
}

func (ctrl *HomeContentController) ReorderSlides(c *gin.Context) {
	var req dto.ReorderHeroSlidesReq
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := ctrl.service.ReorderSlides(req.OrderedIDs); err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	respondJSON(c, http.StatusOK, gin.H{"message": "Slides reordered successfully"})
}

// --- Coaches (สำหรับส่วนบุคลากรหน้าแรก) ---

// GetPublicCoaches (public) — โค้ชที่ถูกเลือกให้แสดงหน้าแรก
func (ctrl *HomeContentController) GetPublicCoaches(c *gin.Context) {
	res, err := ctrl.service.ListCoaches(true)
	if err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	respondJSON(c, http.StatusOK, gin.H{"data": res})
}

// GetAllCoachesForHome (admin) — โค้ชทั้งหมด พร้อมสถานะ feature_on_home ให้แอดมินเลือก
func (ctrl *HomeContentController) GetAllCoachesForHome(c *gin.Context) {
	res, err := ctrl.service.ListCoaches(false)
	if err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	respondJSON(c, http.StatusOK, gin.H{"data": res})
}

func (ctrl *HomeContentController) SetCoachFeature(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "Invalid coach ID"})
		return
	}
	var req dto.FeatureCoachReq
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	res, err := ctrl.service.SetCoachFeature(uint(id), req.FeatureOnHome)
	if err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	respondJSON(c, http.StatusOK, gin.H{"data": res})
}

// SetHeadCoach ตั้ง/ยกเลิกหัวหน้าผู้ฝึกสอน — ตั้งคนใหม่จะปลดคนเดิมให้เอง
func (ctrl *HomeContentController) SetHeadCoach(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "รหัสโค้ชไม่ถูกต้อง"})
		return
	}
	var req dto.HeadCoachReq
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "ข้อมูลที่ส่งมาไม่ถูกต้อง"})
		return
	}
	res, err := ctrl.service.SetHeadCoach(uint(id), req.IsHeadCoach)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			respondJSON(c, http.StatusNotFound, gin.H{"error": "ไม่พบข้อมูลโค้ชที่ระบุ"})
			return
		}
		log.Printf("[api] ตั้งหัวหน้าผู้ฝึกสอนไม่สำเร็จ: %v", err)
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": "ไม่สามารถบันทึกได้ กรุณาลองใหม่"})
		return
	}
	respondJSON(c, http.StatusOK, gin.H{"data": res})
}
