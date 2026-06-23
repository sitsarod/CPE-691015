package controllers

import (
	"net/http"

	"CPE-691015/internal/models"
	"CPE-691015/internal/services"
	"github.com/gin-gonic/gin"
)

type CoachController struct {
	service *services.CoachService
}

// NewCoachController creates a new instance of CoachController
func NewCoachController(s *services.CoachService) *CoachController {
	return &CoachController{service: s}
}

// GetCoaches handles GET /api/coaches request
func (ctrl *CoachController) GetCoaches(c *gin.Context) {
	coaches, err := ctrl.service.GetAll()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve coaches: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, coaches)
}

// CreateCoach handles POST /api/coaches request
func (ctrl *CoachController) CreateCoach(c *gin.Context) {
	var coach models.Coach
	if err := c.ShouldBindJSON(&coach); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := ctrl.service.Create(&coach); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create coach: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, coach)
}
