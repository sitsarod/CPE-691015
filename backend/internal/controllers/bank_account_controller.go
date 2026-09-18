package controllers

import (
	"net/http"
	"strconv"
	"CPE-691015/internal/dto"
	"CPE-691015/internal/services"
	"github.com/gin-gonic/gin"
)

type BankAccountController struct {
	service *services.BankAccountService
}

func NewBankAccountController(service *services.BankAccountService) *BankAccountController {
	return &BankAccountController{service: service}
}

// GetAllBankAccounts handles GET /api/bank-accounts/
func (ctrl *BankAccountController) GetAllBankAccounts(c *gin.Context) {
	accounts, err := ctrl.service.GetAllBankAccounts()
	if err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": "ไม่สามารถดึงข้อมูลบัญชีธนาคารได้"})
		return
	}
	respondJSON(c, http.StatusOK, gin.H{"data": accounts})
}

// GetActiveBankAccounts handles GET /api/bank-accounts/active
func (ctrl *BankAccountController) GetActiveBankAccounts(c *gin.Context) {
	accounts, err := ctrl.service.GetActiveBankAccounts()
	if err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": "ไม่สามารถดึงข้อมูลบัญชีธนาคารได้"})
		return
	}
	respondJSON(c, http.StatusOK, gin.H{"data": accounts})
}

// ToggleBankAccount handles PATCH /api/bank-accounts/:id/toggle
func (ctrl *BankAccountController) ToggleBankAccount(c *gin.Context) {
	idParam := c.Param("id")
	id, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "รหัสบัญชีธนาคารไม่ถูกต้อง"})
		return
	}

	account, err := ctrl.service.ToggleBankAccount(uint(id))
	if err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	respondJSON(c, http.StatusOK, gin.H{
		"message": "สลับการเปิดใช้งานบัญชีธนาคารสำเร็จ",
		"data":    account,
	})
}

// CreateBankAccount handles POST /api/bank-accounts/
func (ctrl *BankAccountController) CreateBankAccount(c *gin.Context) {
	var req dto.CreateBankAccountRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ครบถ้วนหรือไม่ถูกต้อง"})
		return
	}

	account, err := ctrl.service.CreateBankAccount(req)
	if err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	respondJSON(c, http.StatusCreated, gin.H{
		"message": "เพิ่มบัญชีธนาคารสำเร็จ",
		"data":    account,
	})
}

// UpdateBankAccount handles PATCH /api/bank-accounts/:id
func (ctrl *BankAccountController) UpdateBankAccount(c *gin.Context) {
	idParam := c.Param("id")
	id, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "รหัสบัญชีธนาคารไม่ถูกต้อง"})
		return
	}

	var req dto.UpdateBankAccountRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ถูกต้อง"})
		return
	}

	account, err := ctrl.service.UpdateBankAccount(uint(id), req)
	if err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	respondJSON(c, http.StatusOK, gin.H{
		"message": "อัปเดตข้อมูลบัญชีธนาคารสำเร็จ",
		"data":    account,
	})
}

// DeleteBankAccount handles DELETE /api/bank-accounts/:id
func (ctrl *BankAccountController) DeleteBankAccount(c *gin.Context) {
	idParam := c.Param("id")
	id, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "รหัสบัญชีธนาคารไม่ถูกต้อง"})
		return
	}

	err = ctrl.service.DeleteBankAccount(uint(id))
	if err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	respondJSON(c, http.StatusOK, gin.H{
		"message": "ลบบัญชีธนาคารสำเร็จ",
	})
}
