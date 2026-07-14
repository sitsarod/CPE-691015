package controllers

import (
	"net/http"
	"strconv"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/services"
	"github.com/gin-gonic/gin"
)

type AutoQAController struct {
	service services.AutoQAService
}

func NewAutoQAController(s services.AutoQAService) *AutoQAController {
	return &AutoQAController{service: s}
}

// === Knowledge Base Handlers ===

func (ctrl *AutoQAController) CreateAutoQA(c *gin.Context) {
	var req dto.CreateAutoQAReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	res, err := ctrl.service.CreateAutoQA(&req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": res})
}

func (ctrl *AutoQAController) GetAutoQAByID(c *gin.Context) {
	idParam := c.Param("id")
	id, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid AutoQA ID"})
		return
	}

	res, err := ctrl.service.GetAutoQAByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "AutoQA not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (ctrl *AutoQAController) GetAllAutoQAs(c *gin.Context) {
	res, err := ctrl.service.GetAllAutoQAs()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (ctrl *AutoQAController) UpdateAutoQA(c *gin.Context) {
	idParam := c.Param("id")
	id, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid AutoQA ID"})
		return
	}

	var req dto.UpdateAutoQAReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	res, err := ctrl.service.UpdateAutoQA(uint(id), &req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (ctrl *AutoQAController) DeleteAutoQA(c *gin.Context) {
	idParam := c.Param("id")
	id, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid AutoQA ID"})
		return
	}

	err = ctrl.service.DeleteAutoQA(uint(id))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "AutoQA deleted successfully"})
}

// === Chat Session Handlers ===

func (ctrl *AutoQAController) CreateChatSession(c *gin.Context) {
	var req dto.CreateChatSessionReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	res, err := ctrl.service.CreateChatSession(&req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": res})
}

func (ctrl *AutoQAController) GetChatSessionByID(c *gin.Context) {
	idParam := c.Param("id")
	id, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid Chat Session ID"})
		return
	}

	res, err := ctrl.service.GetChatSessionByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Chat Session not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (ctrl *AutoQAController) GetAllChatSessions(c *gin.Context) {
	res, err := ctrl.service.GetAllChatSessions()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (ctrl *AutoQAController) UpdateChatSession(c *gin.Context) {
	idParam := c.Param("id")
	id, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid Chat Session ID"})
		return
	}

	var req dto.UpdateChatSessionReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	res, err := ctrl.service.UpdateChatSession(uint(id), &req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (ctrl *AutoQAController) DeleteChatSession(c *gin.Context) {
	idParam := c.Param("id")
	id, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid Chat Session ID"})
		return
	}

	err = ctrl.service.DeleteChatSession(uint(id))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Chat Session deleted successfully"})
}

// === Interaction (Asking Questions) ===

func (ctrl *AutoQAController) AskQuestion(c *gin.Context) {
	idParam := c.Param("id")
	sessionID, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid Chat Session ID"})
		return
	}

	var req dto.AskQuestionReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	res, err := ctrl.service.AskQuestion(uint(sessionID), &req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": res})
}
