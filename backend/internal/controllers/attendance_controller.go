package controllers

import (
	"errors"
	"io"
	"log"
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
		errors.Is(err, services.ErrCoachQRScanned),
		errors.Is(err, services.ErrCoachNotFound),
		errors.Is(err, services.ErrMissedClassNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})

	// ไม่ได้ลงทะเบียนแพ็กเกจนี้ = ไม่มีสิทธิ์ ไม่ใช่ข้อมูลผิด
	// โค้ชที่ถูกพักงานก็เข้าข่ายเดียวกัน — ตัวตนถูก แต่ไม่มีสิทธิ์เช็คชื่อ
	case errors.Is(err, services.ErrNotInPackage),
		errors.Is(err, services.ErrCoachInactive):
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})

	case errors.Is(err, services.ErrInvalidStatus),
		errors.Is(err, services.ErrMissedClassCoachSet),
		errors.Is(err, services.ErrMissedClassLegacy),
		errors.Is(err, services.ErrScheduleInvalid):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})

	// สแกนใบหน้าแล้วใช้ผลไม่ได้ — คำขอถูกรูปแบบ แต่เนื้อในไปต่อไม่ได้ จึงไม่ใช่ 400
	// หน้าเว็บใช้ 422 เป็นสัญญาณว่า "ลองใหม่หรือไปใช้ QR" ไม่ใช่ "โปรแกรมส่งมาผิด"
	case errors.Is(err, services.ErrNoFaceInImage),
		errors.Is(err, services.ErrMultipleFaces),
		errors.Is(err, services.ErrFaceTooBlurry),
		errors.Is(err, services.ErrFaceNotRecognized),
		errors.Is(err, services.ErrFaceAmbiguous):
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})

	// face-service ล่มหรือยังไม่ได้ตั้งค่า = ระบบยังไม่พร้อม ไม่ใช่ผู้ใช้ทำผิด
	// ต้องแยกออกมาให้ชัดเพื่อให้หน้าเว็บบอกได้ว่า "ใช้ QR แทนไปก่อน"
	case errors.Is(err, services.ErrFaceEngineUnavailable):
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})

	// สถานะไม่เอื้อให้ทำตอนนี้
	// ชนกับรอบที่มีอยู่ = ข้อมูลต้องมีคนไปแก้ ไม่ใช่ระบบพัง
	case errors.Is(err, services.ErrMissedClassCollision):
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})

	case errors.Is(err, services.ErrSessionClosed),
		errors.Is(err, services.ErrSessionExists),
		errors.Is(err, services.ErrNotInClassTime),
		errors.Is(err, services.ErrNoSessionsLeft),
		errors.Is(err, services.ErrAlreadyCheckedIn),
		errors.Is(err, services.ErrCoachAlreadyWorkedIn),
		errors.Is(err, services.ErrAttendanceExpired),
		errors.Is(err, services.ErrMissedClassResolved),
		errors.Is(err, services.ErrMissedClassOpen),
		errors.Is(err, services.ErrMissedClassNotDue):
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})

	// ยอดรอบเช็คชื่อชนกับที่มีอยู่แล้ว = ผิดกฎธุรกิจ ไม่ใช่ระบบพัง
	default:
		// ⚠️ ห้ามส่ง err.Error() ของ GORM/pgx ออกไป
		//
		// ผู้ใช้เคยเห็นข้อความเต็ม ๆ ว่า
		//   duplicate key value violates unique constraint "idx_..." (SQLSTATE 23505)
		// ซึ่งบอกชื่อ index และโครงสร้างตารางให้คนนอก และผู้ใช้เอาไปทำอะไรไม่ได้
		//
		// รายละเอียดไปอยู่ใน log ฝั่งเซิร์ฟเวอร์แทน
		log.Printf("[api] จัดการการเช็คชื่อไม่สำเร็จ: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ระบบขัดข้อง กรุณาลองใหม่ หรือแจ้งผู้ดูแลระบบ"})
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
		log.Printf("[api] ดึงรายการแพ็กเกจที่เปิดรอบได้ ไม่สำเร็จ: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถดึงรายการแพ็กเกจได้"})
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
		log.Printf("[api] ดึงรอบที่เปิดค้างอยู่ ไม่สำเร็จ: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถดึงรายการรอบที่เปิดค้างอยู่ได้"})
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

// ─── สแกนใบหน้า ───
//
// รับเป็น multipart (ฟิลด์ photo) ไม่ใช่ base64 ใน JSON เพราะ base64 ทำให้ payload
// ใหญ่ขึ้น ~33% และใช้ ValidateFaceImageUpload ที่มีอยู่แล้วซ้ำไม่ได้

// readFacePhoto อ่านรูปจาก multipart พร้อมตรวจขนาดและชนิดไฟล์
// คืน false เมื่อตอบ error ให้ client ไปแล้ว
func readFacePhoto(c *gin.Context) ([]byte, bool) {
	// ตัดคำขอที่ใหญ่เกินตั้งแต่ยังไม่อ่านเข้าหน่วยความจำ (เหตุผลเดียวกับ face_image_controller)
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
//
// ⚠️ รับรูปใหม่เท่านั้น ไม่รับ enrollment_id จาก body — ตัวตนต้องถูก resolve ใหม่
// จากรูปทุกครั้ง ไม่งั้นคนที่ยึด session แอดมินได้จะเช็คชื่อให้ใครก็ได้
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
//
// แอดมินเช็คชื่อให้โค้ชที่ลืม QR — คู่ขนานกับ ManualCheckIn ของนักเรียน
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
//
// แก้สถานะย้อนหลัง present ⟷ absent — ไม่มีโควตาให้ปรับเหมือนของนักเรียน
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

	session, err := ctrl.service.CloseSession(id, adminID)
	if err != nil {
		mapAttendanceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"message": "ปิดรอบเรียบร้อย — คนที่ยืนยันว่าจะมาแล้วไม่มา ถูกบันทึกเป็นขาดเรียน",
		"data":    session,
	})
}

// UpdateStatus [PATCH] /api/attendance/records/:id
//
// ใช้ตอนแอดมินต้องแก้ผลย้อนหลัง (present ↔ absent)
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

// GetCoachHistory [GET] /api/attendance/coach-history — ประวัติเข้าสอนของโค้ช
//
// แยก endpoint จาก /history แทนที่จะยัดรวม เพราะฟิลด์สองฝั่งไม่ทับกัน
// และการเปลี่ยนรูป response ของ /history จะทำให้หน้าเดิมพัง
func (ctrl *AttendanceController) GetCoachHistory(c *gin.Context) {
	var courseID uint
	if raw := c.Query("course_id"); raw != "" {
		parsed, err := strconv.ParseUint(raw, 10, 32)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "รหัสคอร์สไม่ถูกต้อง"})
			return
		}
		courseID = uint(parsed)
	}

	items, err := ctrl.service.GetCoachHistory(courseID, c.Query("date"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": items})
}

// ─── คาบที่สอนไปแล้วแต่ไม่เคยมีรอบเช็คชื่อ ───────────────────────────────────

// GetMissedClasses [GET] /api/attendance/missed-classes
//
// คาบที่โค้ชถูกมอบหมาย ผ่านวันมาแล้ว แต่ไม่มีรอบเช็คชื่อที่ปิดแล้ว
// ทุกคาบในรายการนี้คือค่าจ้างที่ยังไม่ถูกนับให้โค้ช
func (ctrl *AttendanceController) GetMissedClasses(c *gin.Context) {
	items, err := ctrl.service.ListMissedClasses()
	if err != nil {
		mapAttendanceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": items})
}

// ResolveMissedClass [POST] /api/attendance/missed-classes/resolve
//
// ⚠️ กระทบค่าจ้างโดยตรง — สร้างรอบเช็คชื่อย้อนหลังพร้อมบันทึกว่าโค้ชคนไหนมาสอนบ้าง
// ต้องส่งสถานะมาให้ครบทุกคนของคาบนั้น (ดูเหตุผลที่ dto.ResolveMissedClassRequest)
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
