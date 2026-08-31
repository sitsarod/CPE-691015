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

type WorkScheduleController struct {
	service services.WorkScheduleService
}

// NewWorkScheduleController creates a new instance of WorkScheduleController
func NewWorkScheduleController(s services.WorkScheduleService) *WorkScheduleController {
	return &WorkScheduleController{service: s}
}

// GetSchedules handles GET /api/work-schedules
// ใช้ในหน้า admin ดูปฏิทินรวมของทุก coach (ตามภาพ "Coach schedule" ที่ admin เห็นทุกแถว)
func (ctrl *WorkScheduleController) GetSchedules(c *gin.Context) {
	schedules, err := ctrl.service.GetAll()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve work schedules: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, schedules)
}

// GetWeekSessions handles GET /api/schedule-sessions?week_start=YYYY-MM-DD
// คืนคาบเรียนของทุก package ในสัปดาห์ (session-centric) เฉพาะ package ที่มี enrollment active
func (ctrl *WorkScheduleController) GetWeekSessions(c *gin.Context) {
	weekStart := c.Query("week_start")
	if weekStart == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ต้องระบุ week_start (YYYY-MM-DD)"})
		return
	}

	sessions, err := ctrl.service.GetWeekSessions(weekStart)
	if err != nil {
		if errors.Is(err, services.ErrScheduleInvalid) {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve sessions: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, sessions)
}

// GetSchedulesByCoach handles GET /api/coaches/:id/work-schedules
// ใช้ในหน้า coach ดูตารางสอนของตัวเอง
func (ctrl *WorkScheduleController) GetSchedulesByCoach(c *gin.Context) {
	coachID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid coach id"})
		return
	}

	// ตรวจสิทธิ์: coach ดูตารางได้เฉพาะของตัวเอง, admin ดูได้ทุกคน
	userID, role, ok := GetAuthContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่"})
		return
	}

	schedules, err := ctrl.service.GetByCoachID(uint(coachID), userID, role)
	if err != nil {
		if errors.Is(err, services.ErrCoachForbidden) {
			c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve work schedules: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, schedules)
}

// GetTaughtSessionCount handles GET /api/coaches/:id/taught-sessions
// คืนจำนวนคาบที่ "สอนจริง" (มีรอบเช็คชื่อปิดแล้ว) ของโค้ช — ใช้คำนวณค่าจ้างค้างจ่าย
func (ctrl *WorkScheduleController) GetTaughtSessionCount(c *gin.Context) {
	coachID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid coach id"})
		return
	}

	userID, role, ok := GetAuthContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่"})
		return
	}

	dates, err := ctrl.service.TaughtSessionDates(uint(coachID), userID, role)
	if err != nil {
		if errors.Is(err, services.ErrCoachForbidden) {
			c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to count taught sessions: " + err.Error()})
		return
	}
	// คืนทั้งจำนวน (แอดมินใช้) และรายวันที่ (หน้าโค้ชใช้จัดกลุ่มรายเดือน) จาก endpoint เดียว
	c.JSON(http.StatusOK, gin.H{"count": len(dates), "dates": dates})
}

// GetScheduleByID handles GET /api/work-schedules/:id
func (ctrl *WorkScheduleController) GetScheduleByID(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid work schedule id"})
		return
	}

	schedule, err := ctrl.service.GetByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "work schedule not found"})
		return
	}
	c.JSON(http.StatusOK, schedule)
}

// CreateSchedule handles POST /api/work-schedules
// admin กด assign งานให้ coach ในช่องปฏิทิน (ตามภาพ modal "Tuesday" ที่กรอกข้อมูลการสอน)
func (ctrl *WorkScheduleController) CreateSchedule(c *gin.Context) {
	var req dto.CreateWorkScheduleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	schedule, err := ctrl.service.AssignWorkSchedule(req)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrScheduleInvalid):
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		case errors.Is(err, services.ErrScheduleConflict):
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create work schedule: " + err.Error()})
		}
		return
	}

	c.JSON(http.StatusCreated, schedule)
}

// UpdateSchedule handles PATCH /api/work-schedules/:id
func (ctrl *WorkScheduleController) UpdateSchedule(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid work schedule id"})
		return
	}

	var req dto.CreateWorkScheduleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	schedule, err := ctrl.service.Update(uint(id), req)
	if err != nil {
		switch {
		case errors.Is(err, gorm.ErrRecordNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": "work schedule not found"})
		case errors.Is(err, services.ErrScheduleInvalid):
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		case errors.Is(err, services.ErrScheduleConflict):
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update work schedule: " + err.Error()})
		}
		return
	}

	c.JSON(http.StatusOK, schedule)
}

// DeleteSchedule handles DELETE /api/work-schedules/:id
func (ctrl *WorkScheduleController) DeleteSchedule(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid work schedule id"})
		return
	}

	if err := ctrl.service.Delete(uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete work schedule: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "work schedule deleted"})
}