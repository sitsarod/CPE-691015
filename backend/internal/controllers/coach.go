package controllers

import (
	"errors"
	"net/http"
	"strconv"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
	"CPE-691015/internal/services"

	"github.com/asaskevich/govalidator"
	"github.com/gin-gonic/gin"
)

type CoachController struct {
	service *services.CoachService
}

// NewCoachController creates a new instance of CoachController
func NewCoachController(s *services.CoachService) *CoachController {
	return &CoachController{service: s}
}

// toCoachResponse แปลง models.Coach เป็น dto.CoachResponse (ใช้กับหน้า list)
func toCoachResponse(coach *models.Coach) dto.CoachResponse {
	resp := dto.CoachResponse{
		ID:             coach.ID,
		UserID:         coach.UserID,
		Nickname:       coach.Nickname,
		Specialization: coach.Specialization,
		CoachLicense:   coach.CoachLicense,
		ProfilePicture: coach.ProfilePicture,
		Phone:          coach.Phone,
		LineID:         coach.LineID,
		Facebook:       coach.Facebook,
		Status:         coach.Status,
	}

	// coach.User เป็น pointer ที่มาจาก Preload("User") ใน service เช็ค nil ก่อนเสมอกันกรณี preload ไม่เจอ user จริง
	if coach.User != nil {
		resp.FirstName = coach.User.FirstName
		resp.LastName = coach.User.LastName
		resp.Email = coach.User.Email
	}

	return resp
}

// toCoachDetailResponse แปลง models.Coach (พร้อม User ที่ preload มาแล้ว) เป็น dto.CoachDetailResponse
// ใช้กับหน้า detail/edit ที่ต้องการฟิลด์ครบกว่า list รวมถึง payment_type/pay_rate ที่โชว์ได้ (read-only)
func toCoachDetailResponse(coach *models.Coach) dto.CoachDetailResponse {
	resp := dto.CoachDetailResponse{
		ID:                coach.ID,
		UserID:            coach.UserID,
		Nickname:          coach.Nickname,
		Phone:             coach.Phone,
		LineID:            coach.LineID,
		Facebook:          coach.Facebook,
		Uid:               coach.Uid,
		Address:           coach.Address,
		BirthDate:         coach.BirthDate,
		Specialization:    coach.Specialization,
		CoachLicense:      coach.CoachLicense,
		ProfilePicture:    coach.ProfilePicture,
		BankAccount:       coach.BankAccount,
		PaymentInfo:       coach.PaymentInfo,
		PromptPay:         coach.PromptPay,
		PaymentType:       coach.PaymentType,
		PayRate:           coach.PayRate,
		Bio:               coach.Bio,
		PersonalQRCode:    coach.PersonalQRCode,
		MemberCode:        coach.MemberCode,
	}

	// coach.User เป็น pointer ที่มาจาก Preload("User") ใน service
	// เช็ค nil ก่อนเสมอ กันกรณี preload ไม่เจอ user จริง (ไม่ควรเกิด แต่กันไว้ไม่ให้ panic)
	if coach.User != nil {
		resp.FirstName = coach.User.FirstName
		resp.LastName = coach.User.LastName
		resp.Email = coach.User.Email
	}

	return resp
}

// GetCoaches handles GET /api/coaches
func (ctrl *CoachController) GetCoaches(c *gin.Context) {
	coaches, err := ctrl.service.GetAll()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve coaches: " + err.Error()})
		return
	}

	responses := make([]dto.CoachResponse, 0, len(coaches))
	for i := range coaches {
		responses = append(responses, toCoachResponse(&coaches[i]))
	}

	c.JSON(http.StatusOK, gin.H{"data": responses})
}

// GetMyCoach handles GET /api/coaches/me
// โค้ชที่ล็อกอินอยู่ดูข้อมูลโปรไฟล์ตัวเอง โดย resolve coach_id จาก JWT เอง ไม่ต้องรู้ id ล่วงหน้า
func (ctrl *CoachController) GetMyCoach(c *gin.Context) {
	userID, _, ok := GetAuthContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่"})
		return
	}

	coach, err := ctrl.service.GetMe(userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบข้อมูลโค้ชสำหรับผู้ใช้งานนี้"})
		return
	}
	c.JSON(http.StatusOK, toCoachDetailResponse(coach))
}

// GetCoachByID handles GET /api/coaches/:id
// คืน CoachDetailResponse (ฟิลด์ครบกว่า) เพราะ endpoint นี้ใช้กับหน้า detail/edit ของ coach คนเดียว
func (ctrl *CoachController) GetCoachByID(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid coach id"})
		return
	}

	// ตรวจสิทธิ์: coach ดูได้เฉพาะของตัวเอง, admin ดูได้ทุกคน
	userID, role, ok := GetAuthContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่"})
		return
	}

	coach, err := ctrl.service.GetByID(uint(id), userID, role)
	if err != nil {
		if errors.Is(err, services.ErrCoachForbidden) {
			c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusNotFound, gin.H{"error": "coach not found"})
		return
	}
	c.JSON(http.StatusOK, toCoachDetailResponse(coach))
}

// CreateCoach handles POST /api/coaches
// รับ dto.CreateCoachRequest (ไม่ใช่ models.Coach ตรงๆ) เพื่อ validate input ก่อนแตะ DB
func (ctrl *CoachController) CreateCoach(c *gin.Context) {
	var req dto.CreateCoachRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if _, err := govalidator.ValidateStruct(req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	coach, err := ctrl.service.Create(req)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrCoachUserNotFound), errors.Is(err, services.ErrCoachUserNotCoach), errors.Is(err, services.ErrCoachInvalidPaymentType):
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		case errors.Is(err, services.ErrCoachDuplicateUser), errors.Is(err, services.ErrCoachDuplicateUID):
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create coach: " + err.Error()})
		}
		return
	}

	c.JSON(http.StatusCreated, toCoachResponse(coach))
}

// UpdateCoach handles PATCH /api/coaches/:id
// coach แก้ข้อมูลตัวเอง (ไม่รวม specialization/payment_type/pay_rate ตาม UpdateCoachRequest ที่ตัดออกแล้ว)
func (ctrl *CoachController) UpdateCoach(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid coach id"})
		return
	}

	var req dto.UpdateCoachRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// ดึงตัวตนผู้เรียกจาก JWT เพื่อตรวจสิทธิ์ความเป็นเจ้าของ (กัน IDOR)
	userID, role, ok := GetAuthContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่"})
		return
	}

	coach, err := ctrl.service.Update(uint(id), userID, role, req)
	if err != nil {
		if errors.Is(err, services.ErrCoachForbidden) {
			c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update coach: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, toCoachResponse(coach))
}

// UpdateCoachBankAccount handles PATCH /api/coaches/:id/bank
//
// แยก endpoint ออกจาก PATCH /coaches/:id เพราะเส้นนี้ต้องยืนยันรหัสผ่านซ้ำ
// ถ้ารวมไว้เส้นเดียวกัน การแก้เบอร์โทรธรรมดาก็จะต้องกรอกรหัสผ่านตาม
// ซึ่งกวนเกินจำเป็นจนคนเลิกใช้ และเผลอ ๆ จะไปจบที่ยกเลิกการยืนยันทั้งหมด
func (ctrl *CoachController) UpdateCoachBankAccount(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid coach id"})
		return
	}

	var req dto.UpdateCoachBankRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณากรอกเลขบัญชี ข้อมูลการจ่ายเงิน และรหัสผ่านให้ครบ"})
		return
	}

	userID, role, ok := GetAuthContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่"})
		return
	}

	coach, err := ctrl.service.UpdateBankAccount(uint(id), userID, role, req)
	if err != nil {
		switch {
		// ⚠️ ต้องเป็น 403 ห้ามใช้ 401 เด็ดขาด
		//
		// ตามตำรา HTTP การยืนยันตัวตนไม่ผ่านควรเป็น 401 แต่ระบบนี้มีข้อตกลงว่า
		// 401 = "access token ใช้ไม่ได้แล้ว" เท่านั้น เพราะ SessionGuard ฝั่งหน้าเว็บ
		// ดักทุก 401 ไปลอง refresh token แล้วถ้ายังไม่ผ่านจะเด้งผู้ใช้ออกจากระบบ
		//
		// ถ้าตอบ 401 ตรงนี้ โค้ชที่พิมพ์รหัสผ่านผิดแค่ครั้งเดียวจะถูกล็อกเอาต์ทันที
		// ทั้งที่ token ยังดีอยู่ — กติกาคือ 401 สงวนไว้ให้เรื่อง token เท่านั้น
		// ส่วนการยืนยันซ้ำที่ไม่ผ่านให้ใช้ 403 พร้อมข้อความอธิบาย
		case errors.Is(err, services.ErrWrongPassword),
			errors.Is(err, services.ErrCoachForbidden),
			errors.Is(err, services.ErrCoachSelfOnly):
			c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถบันทึกข้อมูลบัญชีธนาคารได้"})
		}
		return
	}

	// คืน detail (มีเลขบัญชีติดมาด้วย) ให้หน้าเว็บยืนยันกับตาได้ว่าบันทึกค่าอะไรลงไป
	// ปลอดภัยเพราะเป็นข้อมูลของเจ้าตัวเอง และเพิ่งยืนยันรหัสผ่านผ่านมาหมาด ๆ
	c.JSON(http.StatusOK, toCoachDetailResponse(coach))
}

// AdminUpdateCoach handles PATCH /api/coaches/:id/level
// เฉพาะ admin เท่านั้นที่แก้ specialization (ระดับ), payment_type และ pay_rate (ค่าจ้าง) ได้
// route ต้องผูกกับ adminOnly middleware (RequireRole("admin")) เท่านั้น
func (ctrl *CoachController) AdminUpdateCoach(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid coach id"})
		return
	}

	var req dto.AdminUpdateCoachRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	coach, err := ctrl.service.AdminUpdate(uint(id), req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, toCoachResponse(coach))
}

// DeleteCoach handles DELETE /api/coaches/:id
func (ctrl *CoachController) DeleteCoach(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid coach id"})
		return
	}

	if err := ctrl.service.Delete(uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete coach: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "coach deleted"})
}