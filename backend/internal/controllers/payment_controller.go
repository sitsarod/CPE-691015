package controllers

import (
	"net/http"
	"strconv"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
	"CPE-691015/internal/services"

	"github.com/gin-gonic/gin"
)

type PaymentController struct {
	service *services.PaymentService
}

func NewPaymentController(service *services.PaymentService) *PaymentController {
	return &PaymentController{service: service}
}

// CreateInvoice สร้างใบแจ้งหนี้
func (ctrl *PaymentController) CreateInvoice(c *gin.Context) {
	var input dto.CreateInvoiceRequest

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ถูกต้องหรือไม่ครบถ้วน"})
		return
	}

	invoice, err := ctrl.service.CreateInvoice(input.CustomerID, input.BillingIDs, models.PaymentMethod(input.Method))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "สร้างใบแจ้งหนี้สำเร็จ",
		"data":    dto.ToInvoiceDTO(invoice),
	})
}

// UploadSlip อัปโหลดรูปสลิปหลักฐานการโอนเงิน
func (ctrl *PaymentController) UploadSlip(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID ต้องเป็นตัวเลขเท่านั้น"})
		return
	}

	var input dto.UploadSlipRequest

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาระบุ URL ของสลิป"})
		return
	}

	invoice, err := ctrl.service.UploadSlip(uint(id), input.SlipURL)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "แจ้งชำระเงินสำเร็จ กำลังรอตรวจสอบ",
		"data":    dto.ToInvoiceDTO(invoice),
	})
}

// ConfirmPayment ยืนยันการชำระเงิน (Admin)
func (ctrl *PaymentController) ConfirmPayment(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID ต้องเป็นตัวเลขเท่านั้น"})
		return
	}

	invoice, err := ctrl.service.ConfirmPayment(uint(id))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "ยืนยันยอดชำระเงินสำเร็จแล้ว",
		"data":    dto.ToInvoiceDTO(invoice),
	})
}

// GetCustomerInvoices ดึงประวัติใบแจ้งหนี้ของลูกค้า
func (ctrl *PaymentController) GetCustomerInvoices(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID ต้องเป็นตัวเลขเท่านั้น"})
		return
	}

	invoices, err := ctrl.service.GetCustomerInvoices(uint(id))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ดึงข้อมูลประวัติใบแจ้งหนี้ไม่สำเร็จ"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data": dto.ToInvoiceDTOs(invoices),
	})
}

