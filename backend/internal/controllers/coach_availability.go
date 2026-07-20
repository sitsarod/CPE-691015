package controllers

import (
	"net/http"
	"strconv"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/services"

	"github.com/gin-gonic/gin"
)

type CoachAvailabilityController struct {
	service *services.CoachAvailabilityService
}

// NewCoachAvailabilityController creates a new instance of CoachAvailabilityController
func NewCoachAvailabilityController(s *services.CoachAvailabilityService) *CoachAvailabilityController {
	return &CoachAvailabilityController{service: s}
}

// GetAvailability handles GET /api/coaches/:id/availability
// ใช้ทั้งฝั่ง coach ดูตารางว่างของตัวเอง และฝั่ง admin/frontend ดูตอน filter freetime
func (ctrl *CoachAvailabilityController) GetAvailability(c *gin.Context) {
	coachID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid coach id"})
		return
	}

	availabilities, err := ctrl.service.GetByCoachID(uint(coachID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve availability: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, availabilities)
}

// UpdateAvailability handles PUT /api/coaches/:id/availability
// coach กดยืนยันตารางเวลาว่างทั้งหมด (แทนที่ของเก่าทั้งชุด ไม่ใช่เพิ่มทีละรายการ)
func (ctrl *CoachAvailabilityController) UpdateAvailability(c *gin.Context) {
	coachID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid coach id"})
		return
	}

	var req dto.UpdateCoachAvailabilityRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if len(req.Availabilities) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "availabilities must not be empty"})
		return
	}

	availabilities, err := ctrl.service.UpdateAvailability(uint(coachID), req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update availability: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, availabilities)
}