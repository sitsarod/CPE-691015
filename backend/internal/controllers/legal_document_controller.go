package controllers

import (
	"errors"
	"net/http"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/services"

	"github.com/gin-gonic/gin"
)

type LegalDocumentController struct {
	service *services.LegalDocumentService
}

func NewLegalDocumentController(service *services.LegalDocumentService) *LegalDocumentController {
	return &LegalDocumentController{service: service}
}

// List [GET] /api/admin/legal-documents — เอกสารที่ผู้ใช้ต้องกดยอมรับ ฉบับล่าสุดทุกชนิด
func (ctrl *LegalDocumentController) List(c *gin.Context) {
	docs, err := ctrl.service.List()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": docs})
}

// Update [PUT] /api/admin/legal-documents/:key — บันทึกฉบับใหม่ (ไม่เขียนทับฉบับเดิม)
func (ctrl *LegalDocumentController) Update(c *gin.Context) {
	adminID, _, ok := GetAuthContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่"})
		return
	}

	var req dto.UpdateLegalDocumentReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ครบถ้วน หรือรูปแบบไม่ถูกต้อง"})
		return
	}

	doc, err := ctrl.service.Update(c.Param("key"), req, adminID)
	if err != nil {
		var be *services.BusinessError
		switch {
		case errors.Is(err, services.ErrLegalDocUnknown):
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		case errors.Is(err, services.ErrLegalDocInvalid):
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		case errors.As(err, &be):
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}

	message := "บันทึกเอกสารแล้ว"
	if req.RequiresReconsent {
		message = "บันทึกเอกสารเป็นเวอร์ชันใหม่แล้ว — ผู้ใช้ต้องยอมรับฉบับใหม่"
	}
	c.JSON(http.StatusOK, gin.H{"data": doc, "message": message})
}
