package controllers

import (
	"encoding/base64"
	"errors"
	"net/http"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
	"CPE-691015/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/skip2/go-qrcode"
)

type AuthController interface {
	Login(c *gin.Context)
	Register(c *gin.Context)
	Refresh(c *gin.Context) // ขอ access token ใหม่ด้วย refresh token

	VerifyRegistrationOTP(c *gin.Context) // ยืนยันอีเมลหลังสมัครสมาชิก แล้วล็อกอินให้ทันที
	ResendRegistrationOTP(c *gin.Context) // ขอรหัสยืนยันอีเมลใหม่ (โค้ดเดิมหมดอายุ/หาไม่เจอ)

	// ⚠️ SendOTP / VerifyOTP ถูกลบออกแล้ว อย่าเพิ่มกลับมา
	//
	// ของเดิมยอมให้ผ่านด้วยเลข 123456 ตายตัว ใครที่รู้อีเมลของคนอื่น
	// จึงยึดบัญชีได้ทันที ตอนนี้ย้ายไปที่ PasswordResetController ซึ่งออก OTP
	// แบบสุ่มจริง เก็บเป็น hash และจำกัดจำนวนครั้งที่เดาได้
}

type authController struct {
	authService              services.AuthService
	userService              *services.UserService
	emailVerificationService *services.EmailVerificationService
}

func NewAuthController(
	authService services.AuthService,
	userService *services.UserService,
	emailVerificationService *services.EmailVerificationService,
) AuthController {
	return &authController{
		authService:              authService,
		userService:              userService,
		emailVerificationService: emailVerificationService,
	}
}

// encodeQRImage แปลงรหัส QR ประจำตัวเป็นรูป PNG แบบ data URL ให้หน้าบ้านเอาไปแสดงได้เลย
//
// ใช้ได้กับทั้ง QR ของนักเรียนและของโค้ช เพราะเป็นรหัสรูปแบบเดียวกัน
// ถ้า encode ไม่สำเร็จจะคืนค่าว่าง ไม่ทำให้การล็อกอิน/สมัครสมาชิกล้มทั้งคำขอ
// เพราะ QR เป็นข้อมูลเสริม ไม่ใช่เงื่อนไขของการเข้าสู่ระบบ
func encodeQRImage(code string) string {
	if code == "" {
		return ""
	}
	pngBytes, err := qrcode.Encode(code, qrcode.Medium, 256)
	if err != nil {
		return ""
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(pngBytes)
}

// authSuccessResponse ประกอบ body ตอน login/ยืนยันอีเมลสำเร็จ ใช้ร่วมกันทั้งสองเส้นทาง
// เพราะทั้งคู่ต้องได้ผลลัพธ์หน้าตาเดียวกัน (token + ข้อมูลผู้ใช้ + QR) ไปให้หน้าบ้าน
func authSuccessResponse(message, token, refreshToken string, user *models.User) gin.H {
	// ทั้งนักเรียนและโค้ชมี QR ประจำตัวไว้สแกนเช็คชื่อ จึงส่งรูป QR กลับไปให้ทั้งสองบทบาท
	// (แอดมินไม่มีโปรไฟล์ทั้งสองแบบ ค่าจะเป็นค่าว่างซึ่งหน้าบ้านมองข้ามได้)
	var qrBase64 string
	var nickname string
	switch {
	case user.Customer != nil:
		nickname = user.Customer.Nickname
		qrBase64 = encodeQRImage(user.Customer.PersonalQRCode)
	case user.Coach != nil:
		nickname = user.Coach.Nickname
		qrBase64 = encodeQRImage(user.Coach.PersonalQRCode)
	}

	return gin.H{
		"message":      message,
		"token":        token,
		"refreshToken": refreshToken,
		"user": gin.H{
			"id":        user.ID,
			"firstName": user.FirstName,
			"lastName":  user.LastName,
			"role":      user.Role,
			"email":     user.Email,

			// ฟิลด์กลางที่ใช้ได้กับทุกบทบาท — โค้ดใหม่ควรอ่านจากตรงนี้
			"nickname": nickname,
			"qrImage":  qrBase64,

			// คงคีย์ "customer" ไว้เพื่อไม่ให้หน้าบ้านที่อ่าน data.customer.qrImage อยู่เดิมพัง
			// เมื่อย้ายหน้าบ้านไปอ่านฟิลด์ด้านบนครบแล้วค่อยลบคีย์นี้ทิ้ง
			"customer": gin.H{
				"nickname": nickname,
				"qrImage":  qrBase64,
			},
		},
	}
}

func (ctrl *authController) Login(c *gin.Context) {
	var input dto.LoginInput

	if err := c.ShouldBindJSON(&input); err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ถูกต้อง"})
		return
	}

	token, refreshToken, user, err := ctrl.authService.Login(input)
	if err != nil {
		if errors.Is(err, services.ErrEmailNotVerified) {
			// ให้หน้าบ้านรู้ว่าต้องพาไปหน้ากรอก OTP ต่อ ไม่ใช่แค่ขึ้น error เฉย ๆ
			respondJSON(c, http.StatusForbidden, gin.H{
				"error":                err.Error(),
				"requiresVerification": true,
				"email":                input.Email,
			})
			return
		}
		respondJSON(c, http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	respondJSON(c, http.StatusOK, authSuccessResponse("เข้าสู่ระบบสำเร็จคัป", token, refreshToken, user))
}

// Register สมัครสมาชิกใหม่ (เสมอเป็นบทบาท customer — ดู dto.RegisterRequest.ToUser)
//
// ⚠️ ไม่ล็อกอินให้ทันทีเหมือนเดิมอีกต่อไป
//
// บัญชีที่สร้างจากเส้นนี้ยังไม่ถูกยืนยันอีเมล (EmailVerifiedAt เป็น nil) และ
// AuthService.Login ปฏิเสธบัญชีที่ยังไม่ยืนยัน ต้องให้หน้าบ้านพาไปกรอก OTP
// ที่ส่งไปทางอีเมลก่อน แล้วเรียก VerifyRegistrationOTP ถึงจะได้ token จริง
func (ctrl *authController) Register(c *gin.Context) {
	// ใช้ DTO ไม่ใช่ models.User เพื่อไม่ให้ client กำหนดฟิลด์อ่อนไหวเอง
	// (รายละเอียดเหตุผลอยู่ที่คอมเมนต์ของ dto.RegisterRequest)
	var req dto.RegisterRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": bindErrorMessage(err)})
		return
	}

	input := req.ToUser()
	if err := ctrl.userService.CreateUser(input); err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	message := "สมัครสมาชิกสำเร็จ กรุณายืนยันอีเมลด้วยรหัสที่ส่งไปให้"
	if err := ctrl.emailVerificationService.SendOTP(input, c.ClientIP()); err != nil {
		// สมัครสำเร็จแล้ว แค่ส่งอีเมลไม่ออก — ไม่ถือว่าทั้งคำขอล้ม เพราะบัญชีถูกสร้างจริง
		// หน้าบ้านต้องเสนอปุ่ม "ขอรหัสใหม่" ให้กดซ้ำได้จากตรงนี้
		message = "สมัครสมาชิกสำเร็จ แต่ส่งอีเมลยืนยันไม่สำเร็จ กรุณากดขอรหัสยืนยันใหม่อีกครั้ง"
	}

	respondJSON(c, http.StatusCreated, gin.H{
		"message":              message,
		"requiresVerification": true,
		"email":                input.Email,
	})
}

// VerifyRegistrationOTP ตรวจรหัสยืนยันอีเมลหลังสมัครสมาชิก แล้วล็อกอินให้ทันทีถ้าถูกต้อง
func (ctrl *authController) VerifyRegistrationOTP(c *gin.Context) {
	var req dto.VerifyEmailOTPRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": bindErrorMessage(err)})
		return
	}

	user, token, refreshToken, err := ctrl.emailVerificationService.VerifyOTP(req.Email, req.OTP)
	if err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// VerifyOTP ไม่ได้ preload Customer/Coach มาด้วย ต้องดึงใหม่เพื่อเอา QR/ชื่อเล่น
	// ไปประกอบ response ให้เหมือนกับตอน login ปกติ
	full, err := ctrl.userService.GetUserProfile(user.ID)
	if err != nil {
		respondJSON(c, http.StatusCreated, gin.H{"message": "ยืนยันอีเมลสำเร็จ กรุณาเข้าสู่ระบบ"})
		return
	}

	respondJSON(c, http.StatusOK, authSuccessResponse("ยืนยันอีเมลสำเร็จ เข้าสู่ระบบให้อัตโนมัติ", token, refreshToken, full))
}

// ResendRegistrationOTP ขอรหัสยืนยันอีเมลใบใหม่ (กรณีโค้ดเดิมหมดอายุหรือหาไม่เจอ)
func (ctrl *authController) ResendRegistrationOTP(c *gin.Context) {
	var req dto.ResendEmailOTPRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": bindErrorMessage(err)})
		return
	}

	// ตอบสำเร็จเสมอไม่ว่าจะพบบัญชีจริงหรือไม่ — service เงียบเรื่องนี้อยู่แล้ว
	// (ดูเหตุผลที่ EmailVerificationService.ResendOTP)
	if err := ctrl.emailVerificationService.ResendOTP(req.Email, c.ClientIP()); err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	respondJSON(c, http.StatusOK, gin.H{"message": "ส่งรหัสยืนยันใหม่แล้ว กรุณาตรวจสอบอีเมล"})
}

// Refresh รับ refresh token แล้วออก access token (+ refresh token) ชุดใหม่
func (ctrl *authController) Refresh(c *gin.Context) {
	var input struct {
		RefreshToken string `json:"refreshToken" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "กรุณาระบุ refresh token"})
		return
	}

	token, refreshToken, err := ctrl.authService.Refresh(input.RefreshToken)
	if err != nil {
		// 401 เพื่อให้ฝั่ง client รู้ว่าต้องกลับไป login ใหม่
		respondJSON(c, http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	respondJSON(c, http.StatusOK, gin.H{
		"token":        token,
		"refreshToken": refreshToken,
	})
}
