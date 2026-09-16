package controllers

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/services"
	"CPE-691015/internal/token"

	"github.com/gin-gonic/gin"
)

type NotificationController struct {
	service *services.NotificationService
}

func NewNotificationController(service *services.NotificationService) *NotificationController {
	return &NotificationController{service: service}
}

// List ดึงแจ้งเตือน + จำนวนที่ยังไม่อ่านของผู้ใช้ปัจจุบัน
//
// [GET] /api/notifications
func (ctrl *NotificationController) List(c *gin.Context) {
	userID, _, ok := GetAuthContext(c)
	if !ok {
		respondJSON(c, http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่"})
		return
	}

	list, err := ctrl.service.List(userID)
	if err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": "ดึงการแจ้งเตือนไม่สำเร็จ"})
		return
	}
	unread, err := ctrl.service.UnreadCount(userID)
	if err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": "นับการแจ้งเตือนไม่สำเร็จ"})
		return
	}

	respondJSON(c, http.StatusOK, gin.H{
		"data":   dto.ToNotificationDTOs(list),
		"unread": unread,
	})
}

// Sync รับแจ้งเตือนที่หน้าเว็บ derive มาเก็บ (เพิ่มเฉพาะที่ยังไม่มี)
//
// [POST] /api/notifications/sync
//
// ⚠️ ยังไม่มีการเรียกใช้จากหน้าเว็บ ณ ตอนนี้ (ระบบเป็น event-driven แล้ว)
// เก็บไว้ใช้อนาคตสำหรับแจ้งเตือนที่ต้องพึ่ง state ฝั่ง client — ดูรายละเอียดเต็ม
// ที่คอมเมนต์ของ services.NotificationService.Sync
func (ctrl *NotificationController) Sync(c *gin.Context) {
	userID, _, ok := GetAuthContext(c)
	if !ok {
		respondJSON(c, http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่"})
		return
	}

	var req dto.SyncNotificationsReq
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "รูปแบบข้อมูลไม่ถูกต้อง"})
		return
	}

	if err := ctrl.service.Sync(userID, req.Items); err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": "บันทึกการแจ้งเตือนไม่สำเร็จ"})
		return
	}

	respondJSON(c, http.StatusOK, gin.H{"message": "sync สำเร็จ"})
}

// MarkRead ทำเครื่องหมายว่าอ่านแล้วรายการเดียว
//
// [PATCH] /api/notifications/:id/read
func (ctrl *NotificationController) MarkRead(c *gin.Context) {
	userID, _, ok := GetAuthContext(c)
	if !ok {
		respondJSON(c, http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่"})
		return
	}

	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "รหัสการแจ้งเตือนไม่ถูกต้อง"})
		return
	}

	if err := ctrl.service.MarkRead(userID, uint(id)); err != nil {
		respondJSON(c, http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	respondJSON(c, http.StatusOK, gin.H{"message": "อ่านแล้ว"})
}

// MarkAllRead ทำเครื่องหมายว่าอ่านทั้งหมด
//
// [POST] /api/notifications/read-all
func (ctrl *NotificationController) MarkAllRead(c *gin.Context) {
	userID, _, ok := GetAuthContext(c)
	if !ok {
		respondJSON(c, http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่"})
		return
	}

	if err := ctrl.service.MarkAllRead(userID); err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": "อัปเดตสถานะอ่านไม่สำเร็จ"})
		return
	}

	respondJSON(c, http.StatusOK, gin.H{"message": "อ่านทั้งหมดแล้ว"})
}

// streamUserID อ่าน token จาก query (?token=) หรือ Authorization header แล้วคืน users.id
//
// EventSource ฝั่งเบราว์เซอร์ตั้ง custom header ไม่ได้ จึงต้องรับ token ผ่าน query param
// (จึงแยก auth เองที่นี่ ไม่ผ่าน AuthMiddleware ปกติ)
func streamUserID(c *gin.Context) (uint, bool) {
	tok := c.Query("token")
	if tok == "" {
		if auth := c.GetHeader("Authorization"); strings.HasPrefix(auth, "Bearer ") {
			tok = strings.TrimPrefix(auth, "Bearer ")
		}
	}
	if tok == "" {
		return 0, false
	}
	claims, err := token.Parse(tok)
	if err != nil {
		return 0, false
	}
	if t, _ := claims["type"].(string); t != token.TypeAccess {
		return 0, false
	}
	uid, err := token.UserID(claims)
	if err != nil {
		return 0, false
	}
	return uid, true
}

// Stream เปิด SSE ส่งสัญญาณ "มีแจ้งเตือนใหม่" แบบเรียลไทม์
//
// [GET] /api/notifications/stream?token=<access_token>
// ส่งแค่สัญญาณ (event: notify) — client รับแล้วไปเรียก GET /notifications เอง
func (ctrl *NotificationController) Stream(c *gin.Context) {
	userID, ok := streamUserID(c)
	if !ok {
		respondJSON(c, http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่"})
		return
	}

	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": "เซิร์ฟเวอร์ไม่รองรับ streaming"})
		return
	}

	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("X-Accel-Buffering", "no") // กัน nginx buffer response

	ch := services.NotifHub.Subscribe(userID)
	defer services.NotifHub.Unsubscribe(userID, ch)

	// เปิด stream ด้วย comment เพื่อให้ client รู้ว่าเชื่อมต่อแล้ว
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

// Clear ลบประวัติแจ้งเตือนทั้งหมดของผู้ใช้
//
// [DELETE] /api/notifications
func (ctrl *NotificationController) Clear(c *gin.Context) {
	userID, _, ok := GetAuthContext(c)
	if !ok {
		respondJSON(c, http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่"})
		return
	}

	if err := ctrl.service.Clear(userID); err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": "ล้างประวัติไม่สำเร็จ"})
		return
	}

	respondJSON(c, http.StatusOK, gin.H{"message": "ล้างประวัติแล้ว"})
}
