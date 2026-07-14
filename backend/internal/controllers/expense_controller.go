package controllers

import (
	"CPE-691015/internal/dto"
	"CPE-691015/internal/services"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

type ExpenseController struct {
	service *services.ExpenseService
}

func NewExpenseController(service *services.ExpenseService) *ExpenseController {
	return &ExpenseController{service: service}
}

func (ctrl *ExpenseController) CreateExpense(c *gin.Context) {
	var req dto.CreateExpenseRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ถูกต้องหรือกรอกไม่ครบถ้วน"})
		return
	}

	expense, err := ctrl.service.CreateExpense(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "บันทึกค่าใช้จ่ายสำเร็จ",
		"data":    dto.ToExpenseDTO(expense),
	})
}

func (ctrl *ExpenseController) GetAllExpenses(c *gin.Context) {
	expenses, err := ctrl.service.GetAllExpenses()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data": dto.ToExpenseDTOs(expenses),
	})
}

func (ctrl *ExpenseController) DeleteExpense(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID ต้องเป็นตัวเลขเท่านั้น"})
		return
	}

	err = ctrl.service.DeleteExpense(uint(id))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "ลบค่าใช้จ่ายสำเร็จ",
	})
}

// UploadFileHandler handles multipart/form-data file uploads and saves to ./uploads directory
func (ctrl *ExpenseController) UploadFileHandler(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาแนบไฟล์ที่ต้องการอัปโหลด"})
		return
	}

	// Create uploads directory if not exists
	uploadDir := "./uploads"
	if err := os.MkdirAll(uploadDir, os.ModePerm); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถสร้างโฟลเดอร์สำหรับอัปโหลดได้"})
		return
	}

	// Generate a unique filename using timestamp
	filename := fmt.Sprintf("%d-%s", time.Now().UnixNano(), filepath.Base(file.Filename))
	filePath := filepath.Join(uploadDir, filename)

	if err := c.SaveUploadedFile(file, filePath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "บันทึกไฟล์อัปโหลดไม่สำเร็จ"})
		return
	}

	// Return the local URL
	c.JSON(http.StatusOK, gin.H{
		"url": "http://localhost:8000/uploads/" + filename,
	})
}
