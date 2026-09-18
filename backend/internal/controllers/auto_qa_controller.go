package controllers

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/services"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// chatTokenFrom ดึงกุญแจลับของห้องแชทจากคำขอ — รองรับทั้ง header (คำขอทั่วไป)
// และ query string (สำหรับ SSE ผ่าน EventSource ที่แนบ custom header ไม่ได้)
func chatTokenFrom(c *gin.Context) string {
	if t := strings.TrimSpace(c.GetHeader("X-Chat-Token")); t != "" {
		return t
	}
	return strings.TrimSpace(c.Query("token"))
}

// publicChatBaseURL คืน base URL สำหรับสร้างลิงก์ไฟล์แนบที่เก็บในเครื่อง (fallback เมื่อไม่มี Cloudinary)
// อ่านจาก env PUBLIC_BASE_URL ก่อน ถ้าไม่ตั้งค่าไว้จึงประกอบจาก host ของคำขอจริง
// (เดิม hardcode http://localhost:8000 ทำให้ไฟล์แนบเปิดไม่ได้เมื่อ deploy จริง)
func publicChatBaseURL(c *gin.Context) string {
	if base := strings.TrimSpace(os.Getenv("PUBLIC_BASE_URL")); base != "" {
		return strings.TrimRight(base, "/")
	}
	scheme := "http"
	if c.Request.TLS != nil || strings.EqualFold(c.GetHeader("X-Forwarded-Proto"), "https") {
		scheme = "https"
	}
	host := c.Request.Host
	if host == "" {
		host = "localhost:8000"
	}
	return scheme + "://" + host
}

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
		URL:  publicChatBaseURL(c) + "/uploads/chat/" + filename,
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
	case errors.Is(err, services.ErrMessageNotFound):
		return http.StatusNotFound
	case errors.Is(err, services.ErrCannotModifyMessage):
		return http.StatusForbidden
	case errors.Is(err, services.ErrUserNotFoundForChat), errors.Is(err, services.ErrEmptyMessage),
		errors.Is(err, services.ErrInvalidAttachment):
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

	// ต้องมี token ของห้องที่ถูกต้องเท่านั้นถึงเข้าถึงได้ (กัน IDOR — ID เดาง่าย)
	if err := ctrl.service.AuthorizeSession(uint(id), chatTokenFrom(c)); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Chat Session not found"})
		return
	}

	res, err := ctrl.service.GetChatSessionByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Chat Session not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": res})
}

// AdminGetChatSessionByID — แอดมินเปิดดูห้องแชทได้โดยไม่ต้องมี token ของห้อง
// (ยืนยันสิทธิ์ด้วย JWT + role admin ที่ระดับ route แทน) ใช้กับหน้าจัดการแชทฝั่งแอดมิน
func (ctrl *AutoQAController) AdminGetChatSessionByID(c *gin.Context) {
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

// StreamChatSession เปิด SSE ส่งสัญญาณ "มีข้อความใหม่ในห้องนี้" แบบเรียลไทม์ — สาธารณะ ไม่ต้องล็อกอิน
// (ผู้เยี่ยมชมไม่มี JWT จึงใช้ /notifications/stream เดิมไม่ได้ ต้องแยก stream ผูกกับ session ID แทน)
//
// [GET] /api/chat-sessions/:id/stream
// ส่งแค่สัญญาณ (event: notify) — client รับแล้วไปเรียก GET /chat-sessions/:id เองเหมือน poll เดิม
// รูปแบบเดียวกับ NotificationController.Stream แต่คีย์ด้วย session ID แทน user ID
func (ctrl *AutoQAController) StreamChatSession(c *gin.Context) {
	idParam := c.Param("id")
	id, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid Chat Session ID"})
		return
	}
	sessionID := uint(id)

	// ต้องมี token ที่ถูกต้องถึงเปิด stream ได้ (กัน IDOR + กันเปิด goroutine ทิ้งไว้กับ id มั่ว)
	// EventSource แนบ header ไม่ได้ จึงรับ token ผ่าน query string (?token=)
	if err := ctrl.service.AuthorizeSession(sessionID, chatTokenFrom(c)); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Chat Session not found"})
		return
	}

	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "เซิร์ฟเวอร์ไม่รองรับ streaming"})
		return
	}

	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("X-Accel-Buffering", "no") // กัน nginx buffer response

	ch := services.ChatHub.Subscribe(sessionID)
	defer services.ChatHub.Unsubscribe(sessionID, ch)

	fmt.Fprint(c.Writer, ": connected\n\n")
	flusher.Flush()

	// keepalive กัน proxy/บาง network ปิด connection ที่เงียบนานเกินไป
	ticker := time.NewTicker(25 * time.Second)
	defer ticker.Stop()

	done := c.Request.Context().Done()
	for {
		select {
		case <-done:
			return
		case <-ch:
			fmt.Fprint(c.Writer, "event: notify\ndata: 1\n\n")
			flusher.Flush()
		case <-ticker.C:
			fmt.Fprint(c.Writer, ": keepalive\n\n")
			flusher.Flush()
		}
	}
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

	// ต้องเป็นเจ้าของห้อง (มี token ถูกต้อง) เท่านั้นถึงส่งข้อความเข้าห้องนี้ได้
	if err := ctrl.service.AuthorizeSession(uint(sessionID), chatTokenFrom(c)); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Chat Session not found"})
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

// EditMessage — ลูกค้าแก้ไขข้อความของตัวเองในห้องแชท
func (ctrl *AutoQAController) EditMessage(c *gin.Context) {
	sessionID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid Chat Session ID"})
		return
	}
	msgID, err := strconv.ParseUint(c.Param("msgId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid Message ID"})
		return
	}

	// ต้องเป็นเจ้าของห้อง (มี token ถูกต้อง) เท่านั้นถึงแก้ไขข้อความในห้องนี้ได้
	if err := ctrl.service.AuthorizeSession(uint(sessionID), chatTokenFrom(c)); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Chat Session not found"})
		return
	}

	var req dto.EditMessageReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	res, err := ctrl.service.EditUserMessage(uint(sessionID), uint(msgID), &req)
	if err != nil {
		c.JSON(autoQAErrorStatus(err), gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}

// DeleteMessage — ลูกค้าลบข้อความของตัวเองในห้องแชท
func (ctrl *AutoQAController) DeleteMessage(c *gin.Context) {
	sessionID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid Chat Session ID"})
		return
	}
	msgID, err := strconv.ParseUint(c.Param("msgId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid Message ID"})
		return
	}

	// ต้องเป็นเจ้าของห้อง (มี token ถูกต้อง) เท่านั้นถึงลบข้อความในห้องนี้ได้
	if err := ctrl.service.AuthorizeSession(uint(sessionID), chatTokenFrom(c)); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Chat Session not found"})
		return
	}

	if err := ctrl.service.DeleteUserMessage(uint(sessionID), uint(msgID)); err != nil {
		c.JSON(autoQAErrorStatus(err), gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "ลบข้อความสำเร็จ"})
}
