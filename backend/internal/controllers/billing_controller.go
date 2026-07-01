package controllers

import (
	"net/http"
	"time"

	"CPE-691015/internal/services"
	"github.com/gin-gonic/gin"
)

type BillingController struct {
	service *services.BillingService
}

func NewBillingController(service *services.BillingService) *BillingController {
	return &BillingController{service: service}
}

// CreateBilling สร้างบิลเรียกเก็บเงินรายบุคคลหรือแบบรายกลุ่ม (ยอดเงินคงที่)
func (ctrl *BillingController) CreateBilling(c *gin.Context) {
	var input struct {
		CustomerIDs []uint    `json:"customer_ids" binding:"required"`
		AdminID     uint      `json:"admin_id" binding:"required"`
		BillingTypeID uint    `json:"billingtype_id" binding:"required"`
		Description string    `json:"billingdescription" binding:"required"`
		Amount      float64   `json:"billingamount" binding:"required"`
		DueDate     time.Time `json:"billingdue_date" binding:"required"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ถูกต้องหรือไม่ครบถ้วน"})
		return
	}

	err := ctrl.service.CreateBulkBillings(input.CustomerIDs, input.AdminID, input.BillingTypeID, input.Description, input.Amount, input.DueDate)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "สร้างบิลเรียกเก็บเงินสำเร็จ"})
}

// CreateSplitBilling คำนวณและหารค่าใช้จ่ายสนามจากเช็คอินของนักเรียน
func (ctrl *BillingController) CreateSplitBilling(c *gin.Context) {
	var input struct {
		CourseID      uint      `json:"course_id" binding:"required"`
		Date          string    `json:"date" binding:"required"` // format: YYYY-MM-DD
		HourlyRate    float64   `json:"hourly_rate" binding:"required"`
		Hours         float64   `json:"hours" binding:"required"`
		AdminID       uint      `json:"admin_id" binding:"required"`
		BillingTypeID uint      `json:"billingtype_id" binding:"required"`
		Description   string    `json:"billingdescription" binding:"required"`
		DueDate       time.Time `json:"billingdue_date" binding:"required"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ถูกต้องหรือไม่ครบถ้วน"})
		return
	}

	err := ctrl.service.CreateSplitBillingFromAttendance(
		input.CourseID,
		input.Date,
		input.HourlyRate,
		input.Hours,
		input.AdminID,
		input.BillingTypeID,
		input.Description,
		input.DueDate,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "สร้างบิลหารเฉลี่ยสำเร็จ"})
}
