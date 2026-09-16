package controllers

import (
	"errors"
	"net/http"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/services"

	"github.com/gin-gonic/gin"
)

type PasswordResetController struct {
	service *services.PasswordResetService
}

func NewPasswordResetController(service *services.PasswordResetService) *PasswordResetController {
	return &PasswordResetController{service: service}
}

// RequestOTP ส่งรหัสยืนยันไปทางอีเมลของเจ้าของบัญชี
//
// [POST] /api/auth/password/request-otp
//
// ⚠️ ตอบ 200 เสมอ แม้ไม่พบบัญชีนั้นในระบบ
//
// ถ้าตอบต่างกัน คนที่ไล่ยิงอีเมลจะรู้ว่าอีเมลไหนมีสมาชิกอยู่จริง
// แล้วเอารายชื่อนั้นไปลองรหัสผ่านที่รั่วมาจากเว็บอื่นต่อ
func (ctrl *PasswordResetController) RequestOTP(c *gin.Context) {
	var req dto.RequestOTPRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "กรุณาระบุอีเมลหรือเบอร์โทรศัพท์"})
		return
	}

	if err := ctrl.service.RequestOTP(req.Identifier, c.ClientIP()); err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	respondJSON(c, http.StatusOK, gin.H{
		"message": "หากมีบัญชีที่ตรงกับข้อมูลนี้ ระบบได้ส่งรหัสยืนยันไปทางอีเมลแล้ว",
	})
}

// VerifyOTP ตรวจรหัส 6 หลัก แล้วคืน token อายุสั้นไว้ใช้ตั้งรหัสผ่านใหม่
//
// [POST] /api/auth/password/verify-otp
func (ctrl *PasswordResetController) VerifyOTP(c *gin.Context) {
	var req dto.VerifyOTPRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "กรุณากรอกรหัสยืนยัน 6 หลัก"})
		return
	}

	resetToken, err := ctrl.service.VerifyOTP(req.Identifier, req.OTP)
	if err != nil {
		// ⚠️ ต้องเป็น 400 ห้ามใช้ 401
		// SessionGuard ฝั่งหน้าเว็บเด้งผู้ใช้ออกทุกครั้งที่เจอ 401
		// และหน้านี้เข้าถึงได้โดยไม่ต้องล็อกอินอยู่แล้ว
		if errors.Is(err, services.ErrOTPInvalid) {
			respondJSON(c, http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	respondJSON(c, http.StatusOK, gin.H{"data": dto.VerifyOTPResponse{ResetToken: resetToken}})
}

// ResetPassword ตั้งรหัสผ่านใหม่ด้วย token ที่ได้จากขั้นตอนยืนยัน OTP
//
// [POST] /api/auth/password/reset
func (ctrl *PasswordResetController) ResetPassword(c *gin.Context) {
	var req dto.ResetPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": bindErrorMessage(err)})
		return
	}

	if err := ctrl.service.ResetPassword(req.ResetToken, req.NewPassword); err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	respondJSON(c, http.StatusOK, gin.H{
		"message": "ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่",
	})
}

// ChangePassword ให้ผู้ที่ล็อกอินอยู่เปลี่ยนรหัสผ่านของตัวเอง
//
// [PATCH] /api/me/password
func (ctrl *PasswordResetController) ChangePassword(c *gin.Context) {
	userID, _, ok := GetAuthContext(c)
	if !ok {
		respondJSON(c, http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่"})
		return
	}

	var req dto.ChangePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": bindErrorMessage(err)})
		return
	}

	if err := ctrl.service.ChangePassword(userID, req.CurrentPassword, req.NewPassword); err != nil {
		// ⚠️ รหัสเดิมผิดต้องตอบ 403 ไม่ใช่ 401
		// เพราะ 401 จะทำให้ SessionGuard เด้งผู้ใช้ออกจากระบบ
		// ทั้งที่ token ยังดีอยู่ (เคยเกิดมาแล้วกับ PATCH /coaches/:id/bank)
		if errors.Is(err, services.ErrWrongPassword) {
			respondJSON(c, http.StatusForbidden, gin.H{"error": err.Error()})
			return
		}
		respondJSON(c, http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	respondJSON(c, http.StatusOK, gin.H{"message": "เปลี่ยนรหัสผ่านเรียบร้อยแล้ว"})
}
