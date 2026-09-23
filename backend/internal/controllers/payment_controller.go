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
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ถูกต้องหรือไม่ครบถ้วน"})
		return
	}

	if !CheckIDOR(c, input.CustomerID) {
		respondJSON(c, http.StatusForbidden, gin.H{"error": "ไม่มีสิทธิ์สร้างใบแจ้งหนี้ให้ผู้อื่น"})
		return
	}

	invoice, err := ctrl.service.CreateInvoice(input.CustomerID, input.BillingIDs, models.PaymentMethod(input.Method))
	if err != nil {
		respondServiceError(c, err)
		return
	}

	respondJSON(c, http.StatusCreated, gin.H{
		"message": "สร้างใบแจ้งหนี้สำเร็จ",
		"data":    dto.ToInvoiceDTO(invoice),
	})
}

// UploadSlip อัปโหลดรูปสลิปหลักฐานการโอนเงิน
func (ctrl *PaymentController) UploadSlip(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "ID ต้องเป็นตัวเลขเท่านั้น"})
		return
	}

	var input dto.UploadSlipRequest

	if err := c.ShouldBindJSON(&input); err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "กรุณาระบุ URL ของสลิป"})
		return
	}

	userID, role, ok := GetAuthContext(c)
	if !ok {
		respondJSON(c, http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่"})
		return
	}

	invoice, err := ctrl.service.UploadSlip(uint(id), input.SlipURL, userID, role)
	if err != nil {
		respondServiceError(c, err)
		return
	}

	respondJSON(c, http.StatusOK, gin.H{
		"message": "แจ้งชำระเงินสำเร็จ กำลังรอตรวจสอบ",
		"data":    dto.ToInvoiceDTO(invoice),
	})
}

// ConfirmPayment ยืนยันการชำระเงิน (Admin)
func (ctrl *PaymentController) ConfirmPayment(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "ID ต้องเป็นตัวเลขเท่านั้น"})
		return
	}

	// เก็บว่าแอดมินคนไหนเป็นผู้กดอนุมัติ (users.id จาก JWT)
	adminID, _, ok := GetAuthContext(c)
	if !ok {
		respondJSON(c, http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่"})
		return
	}

	invoice, err := ctrl.service.ConfirmPayment(uint(id), &adminID)
	if err != nil {
		respondServiceError(c, err)
		return
	}

	respondJSON(c, http.StatusOK, gin.H{
		"message": "ยืนยันยอดชำระเงินสำเร็จแล้ว",
		"data":    dto.ToInvoiceDTO(invoice),
	})
}

// ConfirmCashPayment ยืนยันว่าลูกค้าชำระด้วยเงินสด แล้วปิดบิลให้ (Admin)
// แยกจาก ConfirmPayment เพราะต้องเขียนวิธีชำระเงินเป็น cash ทับของเดิม (เช่นใบที่ลูกค้าสร้างไว้เป็น QR)
func (ctrl *PaymentController) ConfirmCashPayment(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "ID ต้องเป็นตัวเลขเท่านั้น"})
		return
	}

	// เก็บว่าแอดมินคนไหนเป็นผู้กดยืนยัน (users.id จาก JWT)
	adminID, _, ok := GetAuthContext(c)
	if !ok {
		respondJSON(c, http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่"})
		return
	}

	invoice, err := ctrl.service.ConfirmCashPayment(uint(id), &adminID)
	if err != nil {
		respondServiceError(c, err)
		return
	}

	respondJSON(c, http.StatusOK, gin.H{
		"message": "บันทึกการชำระเงินสดสำเร็จแล้ว",
		"data":    dto.ToInvoiceDTO(invoice),
	})
}

// GetCustomerInvoices ดึงประวัติใบแจ้งหนี้ของลูกค้า
func (ctrl *PaymentController) GetCustomerInvoices(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "ID ต้องเป็นตัวเลขเท่านั้น"})
		return
	}

	if !CheckIDOR(c, uint(id)) {
		respondJSON(c, http.StatusForbidden, gin.H{"error": "ไม่มีสิทธิ์เข้าถึงข้อมูลของผู้อื่น"})
		return
	}

	invoices, err := ctrl.service.GetCustomerInvoices(uint(id))
	if err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": "ดึงข้อมูลประวัติใบแจ้งหนี้ไม่สำเร็จ"})
		return
	}

	respondJSON(c, http.StatusOK, gin.H{
		"data": dto.ToInvoiceDTOs(invoices),
	})
}

// RejectPayment ปฏิเสธการชำระเงิน (Admin)
func (ctrl *PaymentController) RejectPayment(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "ID ต้องเป็นตัวเลขเท่านั้น"})
		return
	}

	// บังคับกรอกเหตุผล เพราะข้อความนี้ถูกส่งไปหาลูกค้าตรง ๆ และแสดงในประวัติใบแจ้งหนี้
	var req dto.RejectPaymentReq
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "กรุณาระบุเหตุผลในการปฏิเสธ (3–500 ตัวอักษร)"})
		return
	}

	invoice, err := ctrl.service.RejectPayment(uint(id), req.Reason)
	if err != nil {
		respondServiceError(c, err)
		return
	}

	respondJSON(c, http.StatusOK, gin.H{
		"message": "ปฏิเสธยอดชำระเงินสำเร็จแล้ว",
		"data":    dto.ToInvoiceDTO(invoice),
	})
}

// CancelInvoice ยกเลิกใบแจ้งหนี้ (เจ้าของ หรือ Admin)
func (ctrl *PaymentController) CancelInvoice(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "ID ต้องเป็นตัวเลขเท่านั้น"})
		return
	}

	userID, role, ok := GetAuthContext(c)
	if !ok {
		respondJSON(c, http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่"})
		return
	}

	invoice, err := ctrl.service.CancelInvoice(uint(id), userID, role)
	if err != nil {
		respondServiceError(c, err)
		return
	}

	respondJSON(c, http.StatusOK, gin.H{
		"message": "ยกเลิกใบแจ้งหนี้สำเร็จแล้ว",
		"data":    dto.ToInvoiceDTO(invoice),
	})
}

