package controllers

import (
	"errors"
	"net/http"
	"strconv"

	"CPE-691015/internal/services"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type CourtController struct {
	service *services.CourtService
}

func NewCourtController(s *services.CourtService) *CourtController {
	return &CourtController{service: s}
}

// GetCourts handles GET /api/courts — รายการสนามทั้งหมด (admin)
func (ctrl *CourtController) GetCourts(c *gin.Context) {
	courts, err := ctrl.service.GetAll()
	if err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": "Failed to retrieve courts: " + err.Error()})
		return
	}
	respondJSON(c, http.StatusOK, courts)
}

// courtErrorStatus แยก error ที่ผู้ใช้แก้ได้ออกจาก error ของระบบ
func courtErrorStatus(err error) (int, bool) {
	switch {
	case errors.Is(err, services.ErrCourtNameRequired), errors.Is(err, services.ErrCourtNameTooLong):
		return http.StatusBadRequest, true
	case errors.Is(err, services.ErrCourtNameDuplicate), errors.Is(err, services.ErrCourtInUse):
		return http.StatusConflict, true
	case errors.Is(err, gorm.ErrRecordNotFound):
		return http.StatusNotFound, true
	}
	return http.StatusInternalServerError, false
}

type courtBody struct {
	Name     *string `json:"name"`
	IsActive *bool   `json:"is_active"`
}

// CreateCourt handles POST /api/courts
func (ctrl *CourtController) CreateCourt(c *gin.Context) {
	var req courtBody
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Name == nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "ต้องระบุชื่อสนาม"})
		return
	}
	court, err := ctrl.service.Create(*req.Name)
	if err != nil {
		if status, ok := courtErrorStatus(err); ok {
			respondJSON(c, status, gin.H{"error": err.Error()})
			return
		}
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": "Failed to create court: " + err.Error()})
		return
	}
	respondJSON(c, http.StatusCreated, court)
}

// UpdateCourt handles PATCH /api/courts/:id
func (ctrl *CourtController) UpdateCourt(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "invalid court id"})
		return
	}
	var req courtBody
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	court, err := ctrl.service.Update(uint(id), req.Name, req.IsActive)
	if err != nil {
		if status, ok := courtErrorStatus(err); ok {
			respondJSON(c, status, gin.H{"error": err.Error()})
			return
		}
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": "Failed to update court: " + err.Error()})
		return
	}
	respondJSON(c, http.StatusOK, court)
}

// DeleteCourt handles DELETE /api/courts/:id
func (ctrl *CourtController) DeleteCourt(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "invalid court id"})
		return
	}
	if err := ctrl.service.Delete(uint(id)); err != nil {
		if status, ok := courtErrorStatus(err); ok {
			respondJSON(c, status, gin.H{"error": err.Error()})
			return
		}
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": "Failed to delete court: " + err.Error()})
		return
	}
	respondJSON(c, http.StatusOK, gin.H{"message": "court deleted"})
}
