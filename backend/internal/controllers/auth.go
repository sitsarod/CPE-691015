package controllers

import (
	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
	"CPE-691015/internal/services"
	"encoding/base64"
	"net/http"
	"github.com/gin-gonic/gin"
	"github.com/skip2/go-qrcode"
)

type AuthController interface {
	Login(c *gin.Context)
	Register(c *gin.Context) 
}

type authController struct {
	authService services.AuthService
	userService *services.UserService 
}


func NewAuthController(authService services.AuthService, userService *services.UserService) AuthController {
	return &authController{authService: authService, userService: userService}
}

func (ctrl *authController) Login(c *gin.Context) {
	var input dto.LoginInput

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ถูกต้อง"})
		return
	}	

	token, user, err := ctrl.authService.Login(input)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "อีเมลหรือรหัสผ่านไม่ถูกต้อง"})
		return
	}


	pngBytes, err := qrcode.Encode(user.Customer.PersonalQRCode, qrcode.Medium, 256)
	var qrBase64 string
	if err == nil {
		qrBase64 = "data:image/png;base64," + base64.StdEncoding.EncodeToString(pngBytes)
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "เข้าสู่ระบบสำเร็จคัป",
		"token":   token,
		"user": gin.H{
			"id":        user.ID,
			"firstName": user.FirstName,
			"role":      user.Role,
			"email":     user.Email,
			"customer": gin.H{
				"nickname":  user.Customer.Nickname,
				"qrImage":   qrBase64, 
			},
		},
	})
}
func (ctrl *authController) Register(c *gin.Context) {
	var input models.User

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลที่ส่งมาไม่ถูกต้องหรือขาดฟิลด์จำเป็น"})
		return
	}

	rawPassword := input.Password
	input.Role = models.CustomerRole


	if err := ctrl.userService.CreateUser(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	pngBytes, err := qrcode.Encode(input.Customer.PersonalQRCode, qrcode.Medium, 256)
	
	var qrBase64 string
	if err == nil {

		qrBase64 = "data:image/png;base64," + base64.StdEncoding.EncodeToString(pngBytes)
	}


	loginInput := dto.LoginInput{
		Email:    input.Email,
		Password: rawPassword,
	}
	
	token, user, err := ctrl.authService.Login(loginInput)
	if err != nil {
		c.JSON(http.StatusCreated, gin.H{"message": "สมัครสมาชิกสำเร็จแล้วคัป กรุณาไปหน้าเข้าสู่ระบบ"})
		return
	}


	c.JSON(http.StatusCreated, gin.H{
		"message": "สมัครสมาชิกสำเร็จคัป",
		"token":   token,
		"user": gin.H{
			"id":        user.ID,
			"firstName": user.FirstName,
			"role":      user.Role,
			"email":     user.Email,
			"customer": gin.H{
				"nickname":  input.Customer.Nickname,
				"qrImage":   qrBase64,
			},
		},
	})
}