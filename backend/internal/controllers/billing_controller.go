package controllers

import (
	"net/http"
	"strconv"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
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
	var input dto.CreateBillingRequest

	if err := c.ShouldBindJSON(&input); err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ถูกต้องหรือไม่ครบถ้วน"})
		return
	}

	// คนออกบิลอ้างจาก JWT เท่านั้น ไม่รับจาก body (กันปลอม audit trail)
	adminID, _, ok := GetAuthContext(c)
	if !ok {
		respondJSON(c, http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่"})
		return
	}

	err := ctrl.service.CreateBulkBillings(input.CustomerIDs, adminID, input.BillingTypeID, input.Description, input.Amount, input.DueDate)
	if err != nil {
		respondServiceError(c, err)
		return
	}

	respondJSON(c, http.StatusCreated, gin.H{"message": "สร้างบิลเรียกเก็บเงินสำเร็จ"})
}

// CreateSplitBilling คำนวณและหารค่าใช้จ่ายสนามจากเช็คอินของนักเรียน
func (ctrl *BillingController) CreateSplitBilling(c *gin.Context) {
	var input dto.CreateSplitBillingRequest

	if err := c.ShouldBindJSON(&input); err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ถูกต้องหรือไม่ครบถ้วน"})
		return
	}

	// คนออกบิลอ้างจาก JWT เท่านั้น ไม่รับจาก body (กันปลอม audit trail)
	adminID, _, ok := GetAuthContext(c)
	if !ok {
		respondJSON(c, http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่"})
		return
	}

	err := ctrl.service.CreateSplitBillingFromAttendance(
		input.CourseID,
		input.Date,
		input.HourlyRate,
		input.Hours,
		adminID,
		input.BillingTypeID,
		input.Description,
		input.DueDate,
	)
	if err != nil {
		respondServiceError(c, err)
		return
	}

	respondJSON(c, http.StatusCreated, gin.H{"message": "สร้างบิลหารเฉลี่ยสำเร็จ"})
}

// GetAllBillings ดึงรายการบิลทั้งหมด (Admin)
func (ctrl *BillingController) GetAllBillings(c *gin.Context) {
	billings, err := ctrl.service.GetAllBillings()
	if err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": "ไม่สามารถดึงข้อมูลรายการบิลได้"})
		return
	}

	respondJSON(c, http.StatusOK, gin.H{"data": dto.ToBillingDTOs(billings)})
}

// GetCustomerBillings ดึงรายการบิลของลูกค้ารายเจาะจง (Customer)
func (ctrl *BillingController) GetCustomerBillings(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "ID ต้องเป็นตัวเลขเท่านั้น"})
		return
	}

	if !CheckIDOR(c, uint(id)) {
		respondJSON(c, http.StatusForbidden, gin.H{"error": "ไม่มีสิทธิ์เข้าถึงข้อมูลของผู้อื่น"})
		return
	}

	billings, err := ctrl.service.GetBillingsByCustomerID(uint(id))
	if err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": "ไม่สามารถดึงข้อมูลรายการบิลของนักเรียนได้"})
		return
	}

	respondJSON(c, http.StatusOK, gin.H{"data": dto.ToBillingDTOs(billings)})
}

// GetBillingByID ดึงบิลตาม ID
func (ctrl *BillingController) GetBillingByID(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "ID ต้องเป็นตัวเลขเท่านั้น"})
		return
	}

	billing, err := ctrl.service.GetBillingByID(uint(id))
	if err != nil {
		respondJSON(c, http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	if !CheckIDOR(c, billing.CustomerID) {
		respondJSON(c, http.StatusForbidden, gin.H{"error": "ไม่มีสิทธิ์เข้าถึงข้อมูลของผู้อื่น"})
		return
	}

	respondJSON(c, http.StatusOK, gin.H{"data": dto.ToBillingDTO(billing)})
}

// UpdateBilling แก้ไขรายละเอียดบิล (PATCH)
func (ctrl *BillingController) UpdateBilling(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "ID ต้องเป็นตัวเลขเท่านั้น"})
		return
	}

	var input dto.UpdateBillingRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ถูกต้อง"})
		return
	}

	// แปลง DTO เป็น Model
	var billingModel models.Billing
	if input.Description != nil {
		billingModel.Description = *input.Description
	}
	if input.Amount != nil {
		billingModel.Amount = *input.Amount
	}
	if input.DueDate != nil {
		billingModel.DueDate = *input.DueDate
	}
	if input.Status != nil {
		billingModel.Status = models.BillingStatus(*input.Status)
	}
	if input.BillingTypeID != nil {
		billingModel.BillingTypeID = *input.BillingTypeID
	}

	// ผู้แก้ไขอ้างจาก JWT เท่านั้น (บันทึกเป็น UpdatedBy ของบิล)
	actorID, _, ok := GetAuthContext(c)
	if !ok {
		respondJSON(c, http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่"})
		return
	}

	billing, err := ctrl.service.UpdateBilling(uint(id), billingModel, actorID)
	if err != nil {
		respondServiceError(c, err)
		return
	}

	respondJSON(c, http.StatusOK, gin.H{
		"message": "แก้ไขข้อมูลบิลสำเร็จ",
		"data":    dto.ToBillingDTO(billing),
	})
}

// DeleteBilling ลบบิลตาม ID (DELETE)
func (ctrl *BillingController) DeleteBilling(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "ID ต้องเป็นตัวเลขเท่านั้น"})
		return
	}

	err = ctrl.service.DeleteBilling(uint(id))
	if err != nil {
		respondServiceError(c, err)
		return
	}

	respondJSON(c, http.StatusOK, gin.H{"message": "ลบบิลเรียบร้อยแล้ว"})
}


