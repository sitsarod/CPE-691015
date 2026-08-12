package controllers

import (
	"errors"
	"net/http"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// PersonalQRController จัดการ QR ประจำตัวของผู้ใช้ที่ล็อกอินอยู่
//
// ใช้ *gorm.DB ตรง ๆ เพราะงานที่ทำมีแค่การอ่านโปรไฟล์ของตัวเองมาแปลงเป็นรูป
// ไม่มี business logic ที่ควรอยู่ในชั้น service
type PersonalQRController struct {
	db *gorm.DB
}

func NewPersonalQRController(db *gorm.DB) *PersonalQRController {
	return &PersonalQRController{db: db}
}

// GetMyQR คืน QR ประจำตัวของผู้ใช้ที่ล็อกอินอยู่ พร้อมรูป PNG แบบ data URL
//
//	GET /api/me/qr
//
// อ้างตัวตนจาก JWT อย่างเดียว ไม่รับ id จาก path หรือ body
// จึงดึง QR ของคนอื่นไม่ได้โดยโครงสร้าง ไม่ต้องใช้ CheckIDOR
// (แนวเดียวกับกลุ่ม /consents/face ที่ทำไว้แล้ว)
//
// รองรับทั้งนักเรียนและโค้ช เพราะทั้งสองบทบาทต้องสแกนเช็คชื่อเหมือนกัน
// ส่วนแอดมินไม่มี QR จะได้ 404 ซึ่งหน้าบ้านควรซ่อนการ์ด QR ไปเลย
func (ctrl *PersonalQRController) GetMyQR(c *gin.Context) {
	userID, role, ok := GetAuthContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้ในโทเค็น"})
		return
	}

	var (
		code        string
		displayName string
		nickname    string
	)

	switch role {
	case string(models.CustomerRole):
		var customer models.Customer
		if err := ctrl.db.Preload("User").Where("user_id = ?", userID).First(&customer).Error; err != nil {
			ctrl.respondProfileError(c, err)
			return
		}
		code = customer.PersonalQRCode
		nickname = customer.Nickname
		if customer.User != nil {
			displayName = customer.User.FirstName + " " + customer.User.LastName
		}

	case string(models.CoachRole):
		var coach models.Coach
		if err := ctrl.db.Preload("User").Where("user_id = ?", userID).First(&coach).Error; err != nil {
			ctrl.respondProfileError(c, err)
			return
		}
		code = coach.PersonalQRCode
		nickname = coach.Nickname
		if coach.User != nil {
			displayName = coach.User.FirstName + " " + coach.User.LastName
		}

	default:
		// แอดมินไม่ต้องเช็คชื่อ จึงไม่มี QR ประจำตัว
		c.JSON(http.StatusNotFound, gin.H{"error": "บัญชีนี้ไม่มี QR ประจำตัว"})
		return
	}

	// แถวที่สร้างไว้ก่อนระบบ QR จะมีค่าว่าง ต้องบอกให้ชัดว่าให้ไปรัน cmd/reissueqr
	// ไม่ใช่ปล่อยให้หน้าบ้านแสดงรูปเปล่า ๆ แล้วงงว่าทำไมสแกนไม่ได้
	if code == "" {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "บัญชีนี้ยังไม่มี QR ประจำตัว กรุณาติดต่อผู้ดูแลระบบ",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": dto.PersonalQRResponse{
		Code:        code,
		QRImage:     encodeQRImage(code),
		DisplayName: displayName,
		Nickname:    nickname,
		Role:        role,
	}})
}

func (ctrl *PersonalQRController) respondProfileError(c *gin.Context, err error) {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบโปรไฟล์ของผู้ใช้นี้"})
		return
	}
	c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถดึงข้อมูล QR ได้"})
}
