package controllers

import (
	"errors"
	"log"
	"net/http"

	"CPE-691015/internal/services"

	"github.com/gin-gonic/gin"
)

type SettingsController struct {
	service *services.SettingsService
}

func NewSettingsController(s *services.SettingsService) *SettingsController {
	return &SettingsController{service: s}
}

type updateStudentsPerCoachReq struct {
	StudentsPerCoach int `json:"students_per_coach" binding:"required,min=1,max=100"`
}

// GetCoachRatio handles GET /api/settings/coach-ratio
//
// อ่านได้ทั้งแอดมินและโค้ช (โค้ชเห็นคำแนะนำจำนวนโค้ชในหน้าตารางด้วย)
func (ctrl *SettingsController) GetCoachRatio(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"students_per_coach": ctrl.service.GetStudentsPerCoach(),
	})
}

// UpdateCoachRatio handles PUT /api/admin/settings/coach-ratio
//
// ⚠️ เป็นกฎทางธุรกิจของทั้งองค์กร ไม่ใช่ค่าของเครื่องใครเครื่องนั้น
// เดิมเก็บใน localStorage ทำให้แอดมินสองคนเห็นคำแนะนำไม่ตรงกัน
func (ctrl *SettingsController) UpdateCoachRatio(c *gin.Context) {
	actorUserID, _, ok := GetAuthContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งาน"})
		return
	}

	var req updateStudentsPerCoachReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "อัตราส่วนต้องเป็นจำนวนเต็ม 1-100"})
		return
	}

	value, err := ctrl.service.SetStudentsPerCoach(req.StudentsPerCoach, actorUserID)
	if err != nil {
		if errors.Is(err, services.ErrInvalidSettingValue) {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		log.Printf("[api] บันทึกอัตราส่วนโค้ช ไม่สำเร็จ: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถบันทึกค่าตั้งค่าได้"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":            "บันทึกอัตราส่วนโค้ชเรียบร้อยแล้ว",
		"students_per_coach": value,
	})
}
