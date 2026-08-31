package controllers

import (
	"errors"
	"net/http"
	"strconv"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/services"

	"github.com/gin-gonic/gin"
)

type ClassConfirmationController struct {
	service *services.ClassConfirmationService
}

func NewClassConfirmationController(service *services.ClassConfirmationService) *ClassConfirmationController {
	return &ClassConfirmationController{service: service}
}

// mapConfirmError แปลง error จาก service เป็น HTTP status ที่ตรงความหมาย
//
// ⚠️ ห้ามตอบ 401 ตอน token ยังดีอยู่ — SessionGuard เด้งผู้ใช้ออกทุกครั้งที่เจอ 401
func mapConfirmError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, services.ErrEnrollmentNotFound),
		errors.Is(err, services.ErrCustomerProfileNotFound),
		errors.Is(err, services.ErrClassNotFound),
		errors.Is(err, services.ErrPackageNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})

	case errors.Is(err, services.ErrClassConfirmForbidden):
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})

	case errors.Is(err, services.ErrClassConfirmBadDate),
		errors.Is(err, services.ErrClassConfirmBadStatus):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})

	// สถานะไม่เอื้อให้ทำตอนนี้ — ยิงซ้ำก็ไม่ช่วย
	case errors.Is(err, services.ErrClassConfirmClosed),
		errors.Is(err, services.ErrClassOutOfRange),
		errors.Is(err, services.ErrEnrollmentNotActive),
		errors.Is(err, services.ErrNoSessionsToConfirm):
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})

	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
	}
}

// GetMyUpcoming คืนคาบเรียนของตัวเองใน 7 วันข้างหน้า พร้อมสถานะการยืนยัน
//
// [GET] /api/class-confirmations/upcoming — อ้างตัวตนจาก JWT ไม่มี path param
func (ctrl *ClassConfirmationController) GetMyUpcoming(c *gin.Context) {
	userID, _, ok := GetAuthContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่"})
		return
	}

	items, err := ctrl.service.GetMyUpcoming(userID)
	if err != nil {
		mapConfirmError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": items})
}

// Confirm ยืนยันว่าจะมาเรียนคาบนั้น
//
// [PUT] /api/class-confirmations — PUT เพราะยิงซ้ำได้ผลเท่าเดิม ไม่ใช่สร้างใหม่ทุกครั้ง
func (ctrl *ClassConfirmationController) Confirm(c *gin.Context) {
	userID, _, ok := GetAuthContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่"})
		return
	}

	var req dto.ConfirmClassReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ครบถ้วน — ต้องระบุคาบเรียนและคำตอบ (มา/ไม่มา)"})
		return
	}

	item, err := ctrl.service.Confirm(userID, req)
	if err != nil {
		mapConfirmError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "บันทึกคำตอบเรียบร้อยแล้ว", "data": item})
}

// Cancel ยกเลิกการยืนยัน — กลับไปเป็น "ยังไม่ตอบ"
//
// [DELETE] /api/class-confirmations — รับ body รูปแบบเดียวกับ PUT
func (ctrl *ClassConfirmationController) Cancel(c *gin.Context) {
	userID, _, ok := GetAuthContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่"})
		return
	}

	var req dto.CancelClassReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ครบถ้วน — ต้องระบุคาบเรียนที่จะยกเลิก"})
		return
	}

	item, err := ctrl.service.CancelConfirmation(userID, req)
	if err != nil {
		mapConfirmError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "ยกเลิกการยืนยันเรียบร้อยแล้ว", "data": item})
}

// GetHeadcounts คืนยอดสรุปรายคาบของวันนี้
//
// [GET] /api/admin/class-confirmations/headcount
func (ctrl *ClassConfirmationController) GetHeadcounts(c *gin.Context) {
	items, err := ctrl.service.GetHeadcounts()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": items})
}

// GetClassRoster คืนรายชื่อนักเรียนของคาบหนึ่ง แบ่งเป็น มา / ยังไม่ตอบ
//
// [GET] /api/admin/class-confirmations/roster?package_id=1&date=2026-08-31
// ใช้ query เพราะคาบระบุด้วยสองค่าคู่กัน ไม่ใช่ทรัพยากรที่มี id เดี่ยว ๆ
func (ctrl *ClassConfirmationController) GetClassRoster(c *gin.Context) {
	packageID, err := strconv.ParseUint(c.Query("package_id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "package_id ต้องเป็นตัวเลข"})
		return
	}

	date := c.Query("date")
	if date == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาระบุวันที่ (date=YYYY-MM-DD)"})
		return
	}

	roster, err := ctrl.service.GetClassRoster(uint(packageID), date)
	if err != nil {
		mapConfirmError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": roster})
}
