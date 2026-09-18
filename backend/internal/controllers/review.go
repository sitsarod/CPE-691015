package controllers

import (
	"net/http"
	"strconv"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/services"

	"github.com/gin-gonic/gin"
)

type ReviewController struct {
	service services.ReviewService
}

func NewReviewController(s services.ReviewService) *ReviewController {
	return &ReviewController{service: s}
}

// CreateReview — ลูกค้าส่งรีวิว (customer_id ดึงจาก JWT เพื่อกันการรีวิวแทนคนอื่น)
func (ctrl *ReviewController) CreateReview(c *gin.Context) {
	userID, _, ok := GetAuthContext(c)
	if !ok {
		respondJSON(c, http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var req dto.CreateReviewReq
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	res, err := ctrl.service.CreateReview(userID, &req)
	if err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	respondJSON(c, http.StatusCreated, gin.H{"data": res})
}

// GetMyReviews — รีวิวทั้งหมดของลูกค้าที่ล็อกอินอยู่
func (ctrl *ReviewController) GetMyReviews(c *gin.Context) {
	userID, _, ok := GetAuthContext(c)
	if !ok {
		respondJSON(c, http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	res, err := ctrl.service.GetMyReviews(userID)
	if err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	respondJSON(c, http.StatusOK, gin.H{"data": res})
}

// GetCoachReviews — รีวิวที่ลูกค้ารีวิวถึงโค้ชที่ล็อกอินอยู่ (resolve coach_id จาก JWT)
func (ctrl *ReviewController) GetCoachReviews(c *gin.Context) {
	userID, _, ok := GetAuthContext(c)
	if !ok {
		respondJSON(c, http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	res, err := ctrl.service.GetCoachReviews(userID)
	if err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	respondJSON(c, http.StatusOK, gin.H{"data": res})
}

// GetFeaturedReviews — รีวิวที่แอดมินเลือกไว้แสดงหน้าแรก (public)
func (ctrl *ReviewController) GetFeaturedReviews(c *gin.Context) {
	res, err := ctrl.service.GetFeaturedReviews()
	if err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	respondJSON(c, http.StatusOK, gin.H{"data": res})
}

// GetCourseCoaches — รายชื่อโค้ชที่สอนในคอร์ส (ให้ลูกค้าเลือกรีวิวโค้ช)
func (ctrl *ReviewController) GetCourseCoaches(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("course_id"), 10, 32)
	if err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "Invalid course ID"})
		return
	}

	res, err := ctrl.service.GetCourseCoaches(uint(id))
	if err != nil {
		respondJSON(c, http.StatusNotFound, gin.H{"error": "ไม่พบคอร์สที่ต้องการ"})
		return
	}

	respondJSON(c, http.StatusOK, gin.H{"data": res})
}

// GetAllReviews — รายการรีวิวทั้งหมด (admin)
func (ctrl *ReviewController) GetAllReviews(c *gin.Context) {
	res, err := ctrl.service.GetAllReviews()
	if err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	respondJSON(c, http.StatusOK, gin.H{"data": res})
}

// UpdateReview — admin แก้ไขคะแนน/ข้อความรีวิว
func (ctrl *ReviewController) UpdateReview(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "Invalid review ID"})
		return
	}

	var req dto.UpdateReviewReq
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	res, err := ctrl.service.UpdateReview(uint(id), &req)
	if err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	respondJSON(c, http.StatusOK, gin.H{"data": res})
}

// FeatureReview — admin เลือก/ยกเลิกการแสดงรีวิวในหน้าแรก
func (ctrl *ReviewController) FeatureReview(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "Invalid review ID"})
		return
	}

	var req dto.FeatureReviewReq
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	res, err := ctrl.service.SetFeatured(uint(id), req.IsFeatured)
	if err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	respondJSON(c, http.StatusOK, gin.H{"data": res})
}

// DeleteReview — admin ลบรีวิว
func (ctrl *ReviewController) DeleteReview(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "Invalid review ID"})
		return
	}

	if err := ctrl.service.DeleteReview(uint(id)); err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	respondJSON(c, http.StatusOK, gin.H{"message": "Review deleted successfully"})
}
