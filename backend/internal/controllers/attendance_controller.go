package controllers

import (
	"errors"
	"net/http"
	"strconv"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/services"

	"github.com/gin-gonic/gin"
)

type AttendanceController struct {
	service *services.AttendanceService
}

func NewAttendanceController(service *services.AttendanceService) *AttendanceController {
	return &AttendanceController{service: service}
}

func mapAttendanceError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, services.ErrSessionNotFound),
		errors.Is(err, services.ErrAttendanceNotFound),
		errors.Is(err, services.ErrQRNotFound),
		errors.Is(err, services.ErrCoachQRScanned):
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})

	// ไม่ได้ลงทะเบียนแพ็กเกจนี้ = ไม่มีสิทธิ์ ไม่ใช่ข้อมูลผิด
	case errors.Is(err, services.ErrNotInPackage):
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})

	case errors.Is(err, services.ErrInvalidStatus):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})

	// สถานะไม่เอื้อให้ทำตอนนี้
	case errors.Is(err, services.ErrSessionClosed),
		errors.Is(err, services.ErrSessionExists),
		errors.Is(err, services.ErrNotInClassTime),
		errors.Is(err, services.ErrNoSessionsLeft),
		errors.Is(err, services.ErrAlreadyCheckedIn),
		errors.Is(err, services.ErrAttendanceExpired):
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})

	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
	}
}

func uintParam(c *gin.Context, name, label string) (uint, bool) {
	id, err := strconv.ParseUint(c.Param(name), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": label + "ไม่ถูกต้อง"})
		return 0, false
	}
	return uint(id), true
}

// GetOpenablePackages [GET] /api/attendance/openable
func (ctrl *AttendanceController) GetOpenablePackages(c *gin.Context) {
	items, err := ctrl.service.GetOpenablePackages()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": items})
}

// OpenSession [POST] /api/attendance/sessions
func (ctrl *AttendanceController) OpenSession(c *gin.Context) {
	adminID, _, ok := GetAuthContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งาน"})
		return
	}

	var req dto.OpenSessionReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาระบุแพ็กเกจที่ต้องการเปิดรอบเช็คชื่อ"})
		return
	}

	session, err := ctrl.service.OpenSession(req.PackageID, adminID)
	if err != nil {
		mapAttendanceError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"message": "เปิดรอบเช็คชื่อเรียบร้อยแล้ว", "data": session})
}

// GetSession [GET] /api/attendance/sessions/:id
func (ctrl *AttendanceController) GetSession(c *gin.Context) {
	id, ok := uintParam(c, "id", "รหัสรอบเช็คชื่อ")
	if !ok {
		return
	}

	session, err := ctrl.service.GetSession(id)
	if err != nil {
		mapAttendanceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": session})
}

// Lookup [POST] /api/attendance/sessions/:id/lookup — จังหวะที่ 1 ยังไม่บันทึกอะไร
func (ctrl *AttendanceController) Lookup(c *gin.Context) {
	id, ok := uintParam(c, "id", "รหัสรอบเช็คชื่อ")
	if !ok {
		return
	}

	var req dto.ScanReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาส่งรหัส QR"})
		return
	}

	result, err := ctrl.service.LookupByQR(id, req.QRCode)
	if err != nil {
		mapAttendanceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": result})
}

// CheckIn [POST] /api/attendance/sessions/:id/check-in — จังหวะที่ 2 บันทึกจริง
func (ctrl *AttendanceController) CheckIn(c *gin.Context) {
	id, ok := uintParam(c, "id", "รหัสรอบเช็คชื่อ")
	if !ok {
		return
	}

	var req dto.ScanReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาส่งรหัส QR"})
		return
	}

	result, err := ctrl.service.CheckInByQR(id, req.QRCode)
	if err != nil {
		mapAttendanceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "เช็คชื่อสำเร็จ", "data": result})
}

// ManualCheckIn [POST] /api/attendance/sessions/:id/manual
func (ctrl *AttendanceController) ManualCheckIn(c *gin.Context) {
	id, ok := uintParam(c, "id", "รหัสรอบเช็คชื่อ")
	if !ok {
		return
	}

	adminID, _, authOK := GetAuthContext(c)
	if !authOK {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งาน"})
		return
	}

	var req dto.ManualCheckInReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาเลือกนักเรียนที่ต้องการเช็คชื่อให้"})
		return
	}

	result, err := ctrl.service.ManualCheckIn(id, req.EnrollmentID, adminID, req.Remarks)
	if err != nil {
		mapAttendanceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "เช็คชื่อสำเร็จ", "data": result})
}

// CloseSession [PATCH] /api/attendance/sessions/:id/close
func (ctrl *AttendanceController) CloseSession(c *gin.Context) {
	id, ok := uintParam(c, "id", "รหัสรอบเช็คชื่อ")
	if !ok {
		return
	}

	adminID, _, authOK := GetAuthContext(c)
	if !authOK {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งาน"})
		return
	}

	session, err := ctrl.service.CloseSession(id, adminID)
	if err != nil {
		mapAttendanceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"message": "ปิดรอบเรียบร้อย — คนที่ไม่ได้เช็คชื่อถูกบันทึกเป็นขาดเรียน",
		"data":    session,
	})
}

// UpdateStatus [PATCH] /api/attendance/records/:id
//
// ใช้ตอนนักเรียนแจ้งลาแล้วแอดมินมาปรับสถานะให้ทีหลัง
func (ctrl *AttendanceController) UpdateStatus(c *gin.Context) {
	id, ok := uintParam(c, "id", "รหัสบันทึกการเช็คชื่อ")
	if !ok {
		return
	}

	adminID, _, authOK := GetAuthContext(c)
	if !authOK {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งาน"})
		return
	}

	var req dto.UpdateAttendanceStatusReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "สถานะต้องเป็น present, absent หรือ leave"})
		return
	}

	result, err := ctrl.service.UpdateAttendanceStatus(id, adminID, req)
	if err != nil {
		mapAttendanceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "แก้ไขสถานะเรียบร้อยแล้ว", "data": result})
}

// GetHistory [GET] /api/attendance/history?course_id=&date=YYYY-MM-DD
func (ctrl *AttendanceController) GetHistory(c *gin.Context) {
	var courseID uint
	if raw := c.Query("course_id"); raw != "" {
		parsed, err := strconv.ParseUint(raw, 10, 32)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "รหัสคอร์สไม่ถูกต้อง"})
			return
		}
		courseID = uint(parsed)
	}

	items, err := ctrl.service.GetHistory(courseID, c.Query("date"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": items})
}
