package controllers

import(
	"net/http"
	"CPE-691015/internal/models"
	"CPE-691015/internal/services"
	"github.com/gin-gonic/gin"
	
)

type AuthController interface {
	Login(c *gin.Context)
}
 type authController struct {
	authService services.AuthService
}

func NewAuthController(authService services.AuthService) AuthController {
	return &authController{authService: authService}
}

func (ctrl *authController) Login(c *gin.Context) {
	var input models.LoginInput

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณากรอกอีเมลและรหัสผ่านให้ถูกต้อง"})
		return
	}

	token, user, err := ctrl.authService.Login(input)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "เข้าสู่ระบบสำเร็จ",
		"token": token,
		"user":  gin.H{
			"id":        user.ID,
			"firstName": user.FirstName,
			"role":      user.Role,
		},
	})
}