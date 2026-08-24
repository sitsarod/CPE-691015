package controllers

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/services"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type AutoQAController struct {
	service    services.AutoQAService
	cloudinary *services.CloudinaryService // nil = ไม่ได้ตั้งค่า จะ fallback เก็บไฟล์ในเครื่อง
}

func NewAutoQAController(s services.AutoQAService, cloud *services.CloudinaryService) *AutoQAController {
	return &AutoQAController{service: s, cloudinary: cloud}
}

// UploadChatAttachment รับไฟล์แนบในแชท (รูป/PDF) — ใช้ได้ทั้งลูกค้า (guest) และแอดมิน
// endpoint สาธารณะ (มี rate limit) เพราะผู้ที่ไม่ได้ล็อกอินก็ต้องแนบไฟล์ได้
func (ctrl *AutoQAController) UploadChatAttachment(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาแนบไฟล์ที่ต้องการส่ง"})
		return
	}

	ext, kind, err := ValidateChatAttachment(file)
	if err != nil {
		c.JSON(UploadErrorStatus(err), gin.H{"error": err.Error()})
		return
	}

	// ชื่อไฟล์เดิมใช้เพื่อ "แสดงผล" เท่านั้น (React escape ให้อยู่แล้ว) ไม่เอาไปตั้งชื่อไฟล์จริง
	displayName := filepath.Base(file.Filename)
	if len(displayName) > 120 {
		displayName = displayName[:120]
	}

	// เก็บบน Cloudinary เมื่อถูกตั้งค่า
	if ctrl.cloudinary != nil {
		src, err := file.Open()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "เปิดไฟล์ที่อัปโหลดไม่สำเร็จ"})
			return
		}
		defer src.Close()

		url, err := ctrl.cloudinary.UploadFileToFolder(c.Request.Context(), src, "chat")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "อัปโหลดไฟล์ไม่สำเร็จ: " + err.Error()})
			return
		}
		c.JSON(http.StatusOK, dto.ChatUploadResponse{URL: url, Type: kind, Name: displayName})
		return
	}

	// fallback เก็บไฟล์ในเครื่อง (โฟลเดอร์ ./uploads/chat) — ตั้งชื่อไฟล์เองทั้งหมด
	uploadDir := filepath.Join("./uploads", "chat")
	if err := os.MkdirAll(uploadDir, os.ModePerm); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถสร้างโฟลเดอร์สำหรับอัปโหลดได้"})
		return
	}
	filename := fmt.Sprintf("%d%s", time.Now().UnixNano(), ext)
	if err := c.SaveUploadedFile(file, filepath.Join(uploadDir, filename)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "บันทึกไฟล์อัปโหลดไม่สำเร็จ"})
		return
	}
	c.JSON(http.StatusOK, dto.ChatUploadResponse{
		URL:  "http://localhost:8000/uploads/chat/" + filename,
		Type: kind,
		Name: displayName,
	})
}

// autoQAErrorStatus map error จาก service เป็น HTTP status code ที่ถูกต้อง
func autoQAErrorStatus(err error) int {
	switch {
	case errors.Is(err, services.ErrChatSessionNotFound), errors.Is(err, gorm.ErrRecordNotFound):
		return http.StatusNotFound
	case errors.Is(err, services.ErrChatSessionClosed):
		return http.StatusConflict
	case errors.Is(err, services.ErrUserNotFoundForChat), errors.Is(err, services.ErrEmptyMessage):
		return http.StatusBadRequest
	default:
		return http.StatusInternalServerError
	}
}

// GetPublicAutoQAs — endpoint สาธารณะ คืนรูปแบบย่อ (ไม่มีคีย์เวิร์ด/mode)
func (ctrl *AutoQAController) GetPublicAutoQAs(c *gin.Context) {
	res, err := ctrl.service.GetPublicAutoQAs()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
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
		c.JSON(autoQAErrorStatus(err), gin.H{"error": err.Error()})
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
		c.JSON(autoQAErrorStatus(err), gin.H{"error": err.Error()})
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
		c.JSON(autoQAErrorStatus(err), gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": res})
}

func (ctrl *AutoQAController) AdminReply(c *gin.Context) {
	idParam := c.Param("id")
	sessionID, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid Chat Session ID"})
		return
	}

	var req dto.AdminReplyReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	res, err := ctrl.service.AdminReply(uint(sessionID), &req)
	if err != nil {
		c.JSON(autoQAErrorStatus(err), gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": res})
}
