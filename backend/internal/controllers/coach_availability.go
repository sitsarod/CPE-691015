package controllers

import (
	"errors"
	"log"
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
		log.Printf("[api] ดึงเวลาว่างทั้งหมด ไม่สำเร็จ: %v", err)
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": "ไม่สามารถดึงเวลาว่างของโค้ชได้"})
		return
	}
	respondJSON(c, http.StatusOK, all)
}

// GetAvailability handles GET /api/coaches/:id/availability
// ใช้ทั้งฝั่ง coach ดูตารางว่างของตัวเอง และฝั่ง admin/frontend ดูตอน filter freetime
func (ctrl *CoachAvailabilityController) GetAvailability(c *gin.Context) {
	coachID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "invalid coach id"})
		return
	}

	// ตรวจสิทธิ์: coach ดูได้เฉพาะของตัวเอง, admin ดูได้ทุกคน
	userID, role, ok := GetAuthContext(c)
	if !ok {
		respondJSON(c, http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่"})
		return
	}

	availabilities, err := ctrl.service.GetByCoachID(uint(coachID), userID, role)
	if err != nil {
		if errors.Is(err, services.ErrCoachForbidden) {
			respondJSON(c, http.StatusForbidden, gin.H{"error": err.Error()})
			return
		}
		log.Printf("[api] ดึงเวลาว่าง ไม่สำเร็จ: %v", err)
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": "ไม่สามารถดึงเวลาว่างของโค้ชได้"})
		return
	}

	respondJSON(c, http.StatusOK, availabilities)
}

// UpdateAvailability handles PUT /api/coaches/:id/availability
// coach กดยืนยันตารางเวลาว่างทั้งหมด (แทนที่ของเก่าทั้งชุด ไม่ใช่เพิ่มทีละรายการ)
func (ctrl *CoachAvailabilityController) UpdateAvailability(c *gin.Context) {
	coachID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "invalid coach id"})
		return
	}

	var req dto.UpdateCoachAvailabilityRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// ⚠️ ตั้งใจไม่บล็อกรายการว่าง
	//
	// เดิมตอบ 400 เมื่อส่ง [] มา ทำให้โค้ชที่จะลาออกหรือพักยาว "ล้างตารางตัวเองไม่ได้"
	// ต้องไปขอแอดมินแก้ให้ ทั้งที่เป็นข้อมูลของตัวเอง
	//
	// การล้างทั้งหมดยังคงเดินผ่านด่านเดิมทุกด่าน — ถ้ายังมีคาบสอนที่ถูกมอบหมายไว้
	// ในอนาคต ensureNoScheduleConflict จะปฏิเสธพร้อมบอกว่าติดคาบไหน
	// (ล้างได้เมื่อไม่มีงานค้าง ซึ่งเป็นเงื่อนไขที่ถูกต้อง)

	// ดึงตัวตนผู้เรียกจาก JWT เพื่อตรวจสิทธิ์ความเป็นเจ้าของ (กัน IDOR)
	userID, role, ok := GetAuthContext(c)
	if !ok {
		respondJSON(c, http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่"})
		return
	}

	availabilities, err := ctrl.service.UpdateAvailability(uint(coachID), userID, role, req)
	if err != nil {
		// ErrCoachForbidden = coach คนอื่น, ErrCoachSelfOnly = admin (ห้ามแก้เวลาว่างของโค้ช) — ทั้งคู่ตอบ 403
		if errors.Is(err, services.ErrCoachForbidden) || errors.Is(err, services.ErrCoachSelfOnly) {
			respondJSON(c, http.StatusForbidden, gin.H{"error": err.Error()})
			return
		}
		// ErrInvalidAvailability = client ส่งเวลา/วันไม่ถูกต้อง — ตอบ 400
		if errors.Is(err, services.ErrInvalidAvailability) {
			respondJSON(c, http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		// ErrAvailabilityConflictsSchedule = เวลาว่างใหม่ชนกับคาบที่ assign ไว้แล้ว — ตอบ 409
		if errors.Is(err, services.ErrAvailabilityConflictsSchedule) {
			respondJSON(c, http.StatusConflict, gin.H{"error": err.Error()})
			return
		}
		log.Printf("[api] บันทึกเวลาว่าง ไม่สำเร็จ: %v", err)
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": "ไม่สามารถบันทึกเวลาว่างได้"})
		return
	}

	respondJSON(c, http.StatusOK, availabilities)
}
