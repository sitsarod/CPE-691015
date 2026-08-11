package controllers

import (
	"errors"
	"net/http"
	"strconv"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
	"CPE-691015/internal/services"

	"github.com/gin-gonic/gin"
)

type ConsentController struct {
	service *services.ConsentService
}

func NewConsentController(service *services.ConsentService) *ConsentController {
	return &ConsentController{service: service}
}

// GetPolicy คืนเนื้อหาประกาศการเก็บข้อมูลใบหน้าฉบับปัจจุบัน
//
// เปิดเป็น public โดยตั้งใจ — ผู้ใช้ต้องอ่านได้ว่าระบบจะเก็บอะไรไปทำอะไร
// ก่อนตัดสินใจ ไม่ควรต้องล็อกอินก่อนถึงจะอ่านประกาศได้
//
// [GET] /api/consents/face/policy
func (ctrl *ConsentController) GetPolicy(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"data": ctrl.service.GetPolicy()})
}

// GetMyConsent ดูสถานะความยินยอมของตัวเอง
//
// [GET] /api/consents/face/me
func (ctrl *ConsentController) GetMyConsent(c *gin.Context) {
	userID, _, ok := GetAuthContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่"})
		return
	}

	status, err := ctrl.service.GetStatus(userID)
	if err != nil {
		ctrl.respondError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": status})
}

// RecordConsent บันทึกการยินยอม/ปฏิเสธ
//
// ไม่มี path param และไม่รับ customer_id จาก body — ตัวตนมาจาก JWT อย่างเดียว
// จึงบันทึกความยินยอมแทนคนอื่นไม่ได้ (ไม่ต้องใช้ CheckIDOR)
//
// [POST] /api/consents/face
func (ctrl *ConsentController) RecordConsent(c *gin.Context) {
	userID, _, ok := GetAuthContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่"})
		return
	}

	var input dto.RecordFaceConsentReq
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาระบุการตัดสินใจให้ถูกต้อง (granted หรือ declined)"})
		return
	}

	status, err := ctrl.service.Record(userID, models.ConsentAction(input.Action), ctrl.metaFrom(c))
	if err != nil {
		ctrl.respondError(c, err)
		return
	}

	message := "บันทึกความยินยอมเรียบร้อยแล้ว ท่านจะเช็คชื่อเข้าเรียนได้ทั้งการสแกนใบหน้าและ QR code ส่วนบุคคล"
	if models.ConsentAction(input.Action) == models.ConsentDeclined {
		message = "รับทราบแล้ว ระบบจะไม่เก็บข้อมูลใบหน้าของท่าน และจะใช้ QR code ส่วนบุคคลในการเช็คชื่อ"
	}

	c.JSON(http.StatusOK, gin.H{"message": message, "data": status})
}

// WithdrawConsent ถอนความยินยอมและลบข้อมูลใบหน้าที่เก็บไว้
//
// [DELETE] /api/consents/face
func (ctrl *ConsentController) WithdrawConsent(c *gin.Context) {
	userID, _, ok := GetAuthContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่"})
		return
	}

	status, err := ctrl.service.Withdraw(userID, ctrl.metaFrom(c))
	if err != nil {
		ctrl.respondError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "ถอนความยินยอมเรียบร้อยแล้ว ระบบจะใช้ QR code ส่วนบุคคลในการเช็คชื่อแทน",
		"data":    status,
	})
}

// GetConsentHistory ดึงประวัติความยินยอมสำหรับแอดมินตรวจสอบย้อนหลัง
//
// รับ query param `user_id` (users.id) เพื่อกรองเฉพาะคนเดียว ถ้าไม่ส่งมาคือดึงทั้งหมด
//
// [GET] /api/admin/consents/face
func (ctrl *ConsentController) GetConsentHistory(c *gin.Context) {
	var targetUserID uint
	if raw := c.Query("user_id"); raw != "" {
		parsed, err := strconv.ParseUint(raw, 10, 32)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "user_id ต้องเป็นตัวเลขเท่านั้น"})
			return
		}
		targetUserID = uint(parsed)
	}

	items, err := ctrl.service.GetHistory(targetUserID)
	if err != nil {
		ctrl.respondError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": items})
}

// metaFrom เก็บ IP และ User-Agent ไว้เป็นหลักฐานประกอบการให้ความยินยอม
// ค่าเหล่านี้ดึงจาก request จริง ไม่รับจาก body ที่ผู้ใช้แก้ได้
func (ctrl *ConsentController) metaFrom(c *gin.Context) services.ConsentMeta {
	return services.ConsentMeta{
		IPAddress: c.ClientIP(),
		UserAgent: c.Request.UserAgent(),
	}
}

// respondError แมป error จาก service เป็น HTTP status ที่ตรงความหมาย
// (ไม่ตอบ 500 กับทุกกรณีแบบที่โมดูล payment/billing ยังเป็นอยู่)
func (ctrl *ConsentController) respondError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, services.ErrCustomerProfileNotFound), errors.Is(err, services.ErrCustomerNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
	case errors.Is(err, services.ErrInvalidConsentAction):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	case errors.Is(err, services.ErrNothingToWithdraw):
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "เกิดข้อผิดพลาดในการดำเนินการเกี่ยวกับความยินยอม"})
	}
}
