package controllers

import (
	"encoding/base64"
	"net/http"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/skip2/go-qrcode"
)

type AuthController interface {
	Login(c *gin.Context)
	Register(c *gin.Context)
	Refresh(c *gin.Context) // ขอ access token ใหม่ด้วย refresh token

	// ⚠️ SendOTP / VerifyOTP ถูกลบออกแล้ว อย่าเพิ่มกลับมา
	//
	// ของเดิมยอมให้ผ่านด้วยเลข 123456 ตายตัว ใครที่รู้อีเมลของคนอื่น
	// จึงยึดบัญชีได้ทันที ตอนนี้ย้ายไปที่ PasswordResetController ซึ่งออก OTP
	// แบบสุ่มจริง เก็บเป็น hash และจำกัดจำนวนครั้งที่เดาได้
}

type authController struct {
	authService services.AuthService
	userService *services.UserService
}

func NewAuthController(authService services.AuthService, userService *services.UserService) AuthController {
	return &authController{authService: authService, userService: userService}
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

func (ctrl *authController) Login(c *gin.Context) {
	var input dto.LoginInput

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ถูกต้อง"})
		return
	}

	token, refreshToken, user, err := ctrl.authService.Login(input)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

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

	c.JSON(http.StatusOK, gin.H{
		"message":      "เข้าสู่ระบบสำเร็จคัป",
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
	})
}

func (ctrl *authController) Register(c *gin.Context) {
	// ใช้ DTO ไม่ใช่ models.User เพื่อไม่ให้ client กำหนดฟิลด์อ่อนไหวเอง
	// (รายละเอียดเหตุผลอยู่ที่คอมเมนต์ของ dto.RegisterRequest)
	var req dto.RegisterRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": bindErrorMessage(err)})
		return
	}

	input := req.ToUser()
	rawPassword := req.Password

	if err := ctrl.userService.CreateUser(input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// CreateUser เป็นคนสุ่ม PersonalQRCode ให้ผ่าน pointer ตัวเดียวกันนี้
	// จึงต้องอ่านค่าหลังเรียก CreateUser เท่านั้น
	var qrBase64 string
	var nickname string
	if input.Customer != nil {
		nickname = input.Customer.Nickname
		qrBase64 = encodeQRImage(input.Customer.PersonalQRCode)
	}

	loginInput := dto.LoginInput{
		Email:    input.Email,
		Password: rawPassword,
	}

	token, refreshToken, user, err := ctrl.authService.Login(loginInput)
	if err != nil {
		c.JSON(http.StatusCreated, gin.H{"message": "สมัครสมาชิกสำเร็จแล้วคัป กรุณาไปหน้าเข้าสู่ระบบ"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message":      "สมัครสมาชิกสำเร็จคัป",
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
	})
}

// Refresh รับ refresh token แล้วออก access token (+ refresh token) ชุดใหม่
func (ctrl *authController) Refresh(c *gin.Context) {
	var input struct {
		RefreshToken string `json:"refreshToken" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาระบุ refresh token"})
		return
	}

	token, refreshToken, err := ctrl.authService.Refresh(input.RefreshToken)
	if err != nil {
		// 401 เพื่อให้ฝั่ง client รู้ว่าต้องกลับไป login ใหม่
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token":        token,
		"refreshToken": refreshToken,
	})
}
