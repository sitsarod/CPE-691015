package controllers

import (
	"errors"
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

// GetAllAvailabilities handles GET /api/coach-availabilities (admin)
// คืนเวลาว่างของโค้ชทุกคนในครั้งเดียว (query เดียว) สำหรับหน้าจัดตารางสอน — เลี่ยง N+1
func (ctrl *CoachAvailabilityController) GetAllAvailabilities(c *gin.Context) {
	all, err := ctrl.service.GetAll()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve availabilities: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, all)
}

// GetAvailability handles GET /api/coaches/:id/availability
// ใช้ทั้งฝั่ง coach ดูตารางว่างของตัวเอง และฝั่ง admin/frontend ดูตอน filter freetime
func (ctrl *CoachAvailabilityController) GetAvailability(c *gin.Context) {
	coachID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid coach id"})
		return
	}

	// ตรวจสิทธิ์: coach ดูได้เฉพาะของตัวเอง, admin ดูได้ทุกคน
	userID, role, ok := GetAuthContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่"})
		return
	}

	availabilities, err := ctrl.service.GetByCoachID(uint(coachID), userID, role)
	if err != nil {
		if errors.Is(err, services.ErrCoachForbidden) {
			c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
			return
		}
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

	// ดึงตัวตนผู้เรียกจาก JWT เพื่อตรวจสิทธิ์ความเป็นเจ้าของ (กัน IDOR)
	userID, role, ok := GetAuthContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่"})
		return
	}

	availabilities, err := ctrl.service.UpdateAvailability(uint(coachID), userID, role, req)
	if err != nil {
		// ErrCoachForbidden = coach คนอื่น, ErrCoachSelfOnly = admin (ห้ามแก้เวลาว่างของโค้ช) — ทั้งคู่ตอบ 403
		if errors.Is(err, services.ErrCoachForbidden) || errors.Is(err, services.ErrCoachSelfOnly) {
			c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
			return
		}
		// ErrInvalidAvailability = client ส่งเวลา/วันไม่ถูกต้อง — ตอบ 400
		if errors.Is(err, services.ErrInvalidAvailability) {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		// ErrAvailabilityConflictsSchedule = เวลาว่างใหม่ชนกับคาบที่ assign ไว้แล้ว — ตอบ 409
		if errors.Is(err, services.ErrAvailabilityConflictsSchedule) {
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update availability: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, availabilities)
}