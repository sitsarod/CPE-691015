package controllers

import (
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

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
		errors.Is(err, services.ErrCoachQRScanned),
		errors.Is(err, services.ErrCoachNotFound),
		errors.Is(err, services.ErrMissedClassNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})

	case errors.Is(err, services.ErrNotInPackage),
		errors.Is(err, services.ErrCoachInactive):
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})

	case errors.Is(err, services.ErrInvalidStatus),
		errors.Is(err, services.ErrInvalidDateFormat),
		errors.Is(err, services.ErrMissedClassCoachSet),
		errors.Is(err, services.ErrMissedClassLegacy),
		errors.Is(err, services.ErrScheduleInvalid),
		errors.Is(err, services.ErrCourtFeeTotalInvalid):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})

	case errors.Is(err, services.ErrNoFaceInImage),
		errors.Is(err, services.ErrMultipleFaces),
		errors.Is(err, services.ErrFaceTooBlurry),
		errors.Is(err, services.ErrFaceNotRecognized),
		errors.Is(err, services.ErrFaceAmbiguous):
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})

	case errors.Is(err, services.ErrFaceEngineUnavailable):
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})

	case errors.Is(err, services.ErrSessionClosed),
		errors.Is(err, services.ErrSessionExists),
		errors.Is(err, services.ErrNotInClassTime),
		errors.Is(err, services.ErrNoSessionsLeft),
		errors.Is(err, services.ErrAlreadyCheckedIn),
		errors.Is(err, services.ErrCoachAlreadyWorkedIn),
		errors.Is(err, services.ErrAttendanceExpired),
		errors.Is(err, services.ErrMissedClassResolved),
		errors.Is(err, services.ErrMissedClassOpen),
		errors.Is(err, services.ErrMissedClassNotDue),
		errors.Is(err, services.ErrCourtFeeBilled),
		errors.Is(err, services.ErrCourtFeeNotClosed),
		errors.Is(err, services.ErrCourtFeeNotBilled),
		errors.Is(err, services.ErrCourtFeePaid),
		errors.Is(err, services.ErrCourtFeeNoPayers):
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

// GetOpenSessions [GET] /api/attendance/sessions — รอบที่ยังเปิดค้างอยู่
func (ctrl *AttendanceController) GetOpenSessions(c *gin.Context) {
	items, err := ctrl.service.GetOpenSessions()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": items})
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

	message := "เช็คชื่อสำเร็จ"
	if result.Kind == dto.ScanKindCoach {
		message = "เช็คชื่อเข้าสอนสำเร็จ"
	}
	c.JSON(http.StatusOK, gin.H{"message": message, "data": result})
}

// readFacePhoto อ่านรูปจาก multipart พร้อมตรวจขนาดและชนิดไฟล์
func readFacePhoto(c *gin.Context) ([]byte, bool) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, MaxImageUploadBytes+(1<<20))

	fh, err := c.FormFile("photo")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาแนบภาพจากกล้อง (ฟิลด์ 'photo')"})
		return nil, false
	}
	if _, err := ValidateFaceImageUpload(fh); err != nil {
		status := UploadErrorStatus(err)
		if errors.Is(err, ErrUploadBadType) {
			status = http.StatusUnsupportedMediaType
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return nil, false
	}

	file, err := fh.Open()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": ErrUploadUnreadable.Error()})
		return nil, false
	}
	defer file.Close()

	raw, err := io.ReadAll(file)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": ErrUploadUnreadable.Error()})
		return nil, false
	}
	return raw, true
}

// FaceLookup [POST] /api/attendance/sessions/:id/face-lookup — จังหวะ 1 ไม่เขียนอะไร
func (ctrl *AttendanceController) FaceLookup(c *gin.Context) {
	id, ok := uintParam(c, "id", "รหัสรอบเช็คชื่อ")
	if !ok {
		return
	}
	raw, ok := readFacePhoto(c)
	if !ok {
		return
	}

	result, err := ctrl.service.LookupByFace(id, raw)
	if err != nil {
		mapAttendanceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": result})
}

// FaceCheckIn [POST] /api/attendance/sessions/:id/face-check-in — จังหวะ 2 บันทึกจริง
func (ctrl *AttendanceController) FaceCheckIn(c *gin.Context) {
	id, ok := uintParam(c, "id", "รหัสรอบเช็คชื่อ")
	if !ok {
		return
	}
	adminUserID, _, authOK := GetAuthContext(c)
	if !authOK {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "กรุณาเข้าสู่ระบบ"})
		return
	}
	raw, ok := readFacePhoto(c)
	if !ok {
		return
	}

	result, err := ctrl.service.CheckInByFace(id, raw, adminUserID)
	if err != nil {
		mapAttendanceError(c, err)
		return
	}

	message := "เช็คชื่อสำเร็จ"
	if result.Kind == dto.ScanKindCoach {
		message = "เช็คชื่อเข้าสอนสำเร็จ"
	}
	c.JSON(http.StatusOK, gin.H{"message": message, "data": result})
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

// ManualCoachCheckIn [POST] /api/attendance/sessions/:id/coach-manual
func (ctrl *AttendanceController) ManualCoachCheckIn(c *gin.Context) {
	id, ok := uintParam(c, "id", "รหัสรอบเช็คชื่อ")
	if !ok {
		return
	}

	adminID, _, authOK := GetAuthContext(c)
	if !authOK {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งาน"})
		return
	}

	var req dto.ManualCoachCheckInReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาเลือกโค้ชที่ต้องการเช็คชื่อให้"})
		return
	}

	result, err := ctrl.service.ManualCoachCheckIn(id, req.CoachID, adminID, req.Remarks)
	if err != nil {
		mapAttendanceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "เช็คชื่อเข้าสอนสำเร็จ", "data": result})
}

// UpdateCoachAttendanceStatus [PATCH] /api/attendance/coach-records/:id
func (ctrl *AttendanceController) UpdateCoachAttendanceStatus(c *gin.Context) {
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
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาระบุสถานะที่ต้องการแก้เป็น"})
		return
	}

	result, err := ctrl.service.UpdateCoachAttendanceStatus(id, adminID, req)
	if err != nil {
		mapAttendanceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "แก้สถานะเรียบร้อยแล้ว", "data": result})
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

	var req dto.CloseSessionReq
	if err := c.ShouldBindJSON(&req); err != nil && !errors.Is(err, io.EOF) {
		c.JSON(http.StatusBadRequest, gin.H{"error": services.ErrCourtFeeTotalInvalid.Error()})
		return
	}

	session, err := ctrl.service.CloseSession(id, adminID, req.CourtFeeTotal)
	if err != nil {
		mapAttendanceError(c, err)
		return
	}

	message := "ปิดรอบเรียบร้อย — คนที่ยืนยันว่าจะมาแล้วไม่มา ถูกบันทึกเป็นขาดเรียน"
	if req.CourtFeeTotal != nil {
		message = "ปิดรอบและออกบิลค่าสนามเรียบร้อย"
	}
	c.JSON(http.StatusOK, gin.H{
		"message": message,
		"data":    session,
	})
}

// BillCourtFee [POST] /api/attendance/sessions/:id/court-fee
func (ctrl *AttendanceController) BillCourtFee(c *gin.Context) {
	id, ok := uintParam(c, "id", "รหัสรอบเช็คชื่อ")
	if !ok {
		return
	}

	adminID, _, authOK := GetAuthContext(c)
	if !authOK {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งาน"})
		return
	}

	var req dto.BillCourtFeeReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": services.ErrCourtFeeTotalInvalid.Error()})
		return
	}

	session, err := ctrl.service.BillCourtFee(id, adminID, req.CourtFeeTotal)
	if err != nil {
		mapAttendanceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"message": "ออกบิลค่าสนามเรียบร้อย",
		"data":    session,
	})
}

// CancelCourtFee [DELETE] /api/attendance/sessions/:id/court-fee
func (ctrl *AttendanceController) CancelCourtFee(c *gin.Context) {
	id, ok := uintParam(c, "id", "รหัสรอบเช็คชื่อ")
	if !ok {
		return
	}

	adminID, _, authOK := GetAuthContext(c)
	if !authOK {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งาน"})
		return
	}

	session, err := ctrl.service.CancelCourtFee(id, adminID)
	if err != nil {
		mapAttendanceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"message": "ยกเลิกบิลค่าสนามของรอบนี้แล้ว — ออกบิลใหม่ได้",
		"data":    session,
	})
}

// GetUnbilledCourtSessions [GET] /api/attendance/court-fee/pending
func (ctrl *AttendanceController) GetUnbilledCourtSessions(c *gin.Context) {
	items, err := ctrl.service.GetUnbilledCourtSessions()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": items})
}

// UpdateStatus [PATCH] /api/attendance/records/:id
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
		c.JSON(http.StatusBadRequest, gin.H{"error": "สถานะต้องเป็น present หรือ absent"})
		return
	}

	result, err := ctrl.service.UpdateAttendanceStatus(id, adminID, req)
	if err != nil {
		mapAttendanceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "แก้ไขสถานะเรียบร้อยแล้ว", "data": result})
}

// historyFilter อ่านตัวกรองของหน้าประวัติจาก query string
func historyFilter(c *gin.Context) (services.HistoryFilter, error) {
	f := services.HistoryFilter{
		From:  c.Query("from"),
		To:    c.Query("to"),
		Query: c.Query("q"),
	}

	if date := c.Query("date"); date != "" && f.From == "" && f.To == "" {
		f.From, f.To = date, date
	}

	if raw := c.Query("course_id"); raw != "" {
		parsed, err := strconv.ParseUint(raw, 10, 32)
		if err != nil {
			return f, errors.New("รหัสคอร์สไม่ถูกต้อง")
		}
		f.CourseID = uint(parsed)
	}

	f.Limit = services.DefaultHistoryLimit
	if raw := c.Query("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed <= 0 {
			return f, errors.New("จำนวนแถวต่อหน้าไม่ถูกต้อง")
		}
		if parsed > services.MaxHistoryLimit {
			parsed = services.MaxHistoryLimit
		}
		f.Limit = parsed
	}

	if raw := c.Query("offset"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 0 {
			return f, errors.New("ตำแหน่งเริ่มต้นไม่ถูกต้อง")
		}
		f.Offset = parsed
	}

	return f, nil
}

// GetHistory [GET] /api/attendance/history?course_id=&from=&to=&q=&limit=&offset=
func (ctrl *AttendanceController) GetHistory(c *gin.Context) {
	filter, err := historyFilter(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	items, total, err := ctrl.service.GetHistory(filter)
	if err != nil {
		mapAttendanceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"data":   items,
		"total":  total,
		"limit":  filter.Limit,
		"offset": filter.Offset,
	})
}

// ExportHistory [GET] /api/attendance/history/export — CSV ของทั้งช่วง ไม่มีเพดานแถว
func (ctrl *AttendanceController) ExportHistory(c *gin.Context) {
	filter, err := historyFilter(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	filter.Limit = 0 // export = ทั้งช่วงตามตัวกรอง
	filter.Offset = 0

	var (
		rows     [][]string
		filename string
	)

	if c.Query("type") == "coach" {
		items, err := ctrl.service.GetCoachHistory(filter)
		if err != nil {
			mapAttendanceError(c, err)
			return
		}
		filename = "coach-attendance"
		rows = append(rows, []string{"เวลาเช็คชื่อ", "ชื่อโค้ช", "ชื่อเล่น", "สถานะ", "วิธี", "ตามตาราง", "หมายเหตุ"})
		for _, it := range items {
			rows = append(rows, []string{
				it.CheckInTime.In(services.AppLocation()).Format("2006-01-02 15:04"),
				it.FullName, it.Nickname, it.Status, it.CheckInMethod,
				boolText(it.IsScheduled), it.Remarks,
			})
		}
	} else {
		items, _, err := ctrl.service.GetHistory(filter)
		if err != nil {
			mapAttendanceError(c, err)
			return
		}
		filename = "attendance"
		rows = append(rows, []string{"เวลาเช็คชื่อ", "คอร์ส", "ชื่อ-นามสกุล", "ชื่อเล่น", "สถานะ", "วิธี", "นอกตาราง", "หมายเหตุ"})
		for _, it := range items {
			rows = append(rows, []string{
				it.CheckInTime.In(services.AppLocation()).Format("2006-01-02 15:04"),
				it.CourseName, it.FullName, it.Nickname, it.Status, it.CheckInMethod,
				boolText(it.IsOffSchedule), it.Remarks,
			})
		}
	}

	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="%s-%s.csv"`, filename, time.Now().Format("20060102-150405")))

	if _, err := c.Writer.WriteString("\ufeff"); err != nil {
		return
	}
	w := csv.NewWriter(c.Writer)
	if err := w.WriteAll(rows); err != nil {
		log.Printf("[attendance] เขียน CSV ประวัติไม่สำเร็จ: %v", err)
	}
}

func boolText(v bool) string {
	if v {
		return "ใช่"
	}
	return "ไม่"
}

// GetCoachHistory [GET] /api/attendance/coach-history — ประวัติเข้าสอนของโค้ช
func (ctrl *AttendanceController) GetCoachHistory(c *gin.Context) {
	filter, err := historyFilter(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	for _, raw := range strings.Split(c.Query("session_ids"), ",") {
		if raw == "" {
			continue
		}
		parsed, err := strconv.ParseUint(strings.TrimSpace(raw), 10, 32)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "รหัสรอบเช็คชื่อไม่ถูกต้อง"})
			return
		}
		filter.SessionIDs = append(filter.SessionIDs, uint(parsed))
	}

	items, err := ctrl.service.GetCoachHistory(filter)
	if err != nil {
		mapAttendanceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": items})
}

// GetMissedClasses [GET] /api/attendance/missed-classes
func (ctrl *AttendanceController) GetMissedClasses(c *gin.Context) {
	items, err := ctrl.service.ListMissedClasses()
	if err != nil {
		mapAttendanceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": items})
}

// ResolveMissedClass [POST] /api/attendance/missed-classes/resolve
func (ctrl *AttendanceController) ResolveMissedClass(c *gin.Context) {
	adminID, _, ok := GetAuthContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งาน"})
		return
	}

	var req dto.ResolveMissedClassRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "กรุณาระบุคาบที่ต้องการเคลียร์ และสถานะของโค้ชทุกคนในคาบนั้น (present หรือ absent)"})
		return
	}

	result, err := ctrl.service.ResolveMissedClass(req, adminID)
	if err != nil {
		mapAttendanceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "บันทึกการสอนย้อนหลังเรียบร้อยแล้ว", "data": result})
}
