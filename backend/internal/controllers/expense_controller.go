package controllers

import (
	"CPE-691015/internal/dto"
	"CPE-691015/internal/services"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

type ExpenseController struct {
	service    *services.ExpenseService
	cloudinary *services.CloudinaryService // nil = ไม่ได้ตั้งค่า จะ fallback เก็บไฟล์ในเครื่อง
}

func NewExpenseController(service *services.ExpenseService, cloudinary *services.CloudinaryService) *ExpenseController {
	return &ExpenseController{service: service, cloudinary: cloudinary}
}

func (ctrl *ExpenseController) CreateExpense(c *gin.Context) {
	var req dto.CreateExpenseRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ถูกต้องหรือกรอกไม่ครบถ้วน"})
		return
	}

	expense, err := ctrl.service.CreateExpense(req)
	if err != nil {
		switch {
		// ยอดไม่ผ่านด่านตรวจค่าจ้าง = คำขอผิดกฎธุรกิจ ไม่ใช่ระบบพัง
		case errors.Is(err, services.ErrPayrollExceeds),
			errors.Is(err, services.ErrPayrollNoUnpaid):
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		case errors.Is(err, services.ErrPayrollNeedsCoach):
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		case errors.Is(err, services.ErrCoachNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
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

// GetCoachPayroll handles GET /api/coaches/:id/payroll
//
// ⚠️ นี่คือแหล่งเดียวของยอดค่าจ้าง หน้าเว็บต้องใช้ตัวเลขจาก endpoint นี้
// ห้ามคำนวณเองที่ฝั่ง client อีก (ดู services/coach_payroll.go)
func (ctrl *ExpenseController) GetCoachPayroll(c *gin.Context) {
	coachID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid coach id"})
		return
	}

	userID, role, ok := GetAuthContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่"})
		return
	}

	payroll, err := ctrl.service.GetCoachPayroll(uint(coachID), userID, role)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrCoachForbidden):
			c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		case errors.Is(err, services.ErrCoachNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถคำนวณค่าจ้างของโค้ชได้"})
		}
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": payroll})
}

// GetExpensesByCoach handles GET /api/coaches/:id/expenses
// ใช้ในหน้า coach ดูประวัติค่าจ้างของตัวเอง (admin ดูของโค้ชคนไหนก็ได้)
func (ctrl *ExpenseController) GetExpensesByCoach(c *gin.Context) {
	coachID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid coach id"})
		return
	}

	userID, role, ok := GetAuthContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่"})
		return
	}

	expenses, err := ctrl.service.GetByCoachID(uint(coachID), userID, role)
	if err != nil {
		if errors.Is(err, services.ErrCoachForbidden) {
			c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": dto.ToExpenseDTOs(expenses)})
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

// UploadFileHandler handles multipart/form-data file uploads.
// ถ้าตั้งค่า Cloudinary ไว้จะอัปโหลดขึ้นคลาวด์ ไม่งั้น fallback เก็บไฟล์ในโฟลเดอร์ ./uploads
func (ctrl *ExpenseController) UploadFileHandler(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาแนบไฟล์ที่ต้องการอัปโหลด"})
		return
	}

	// ตรวจว่าเป็นรูปจริงและขนาดไม่เกิน ก่อนทำอะไรต่อ
	//
	// เส้นนี้ใช้อัปโหลดรูปโปรไฟล์ สลิปโอนเงิน และภาพข่าว ซึ่งเป็นรูปทั้งหมด
	// จึงตรวจด้วยกติกาของรูป และตั้งนามสกุลเองจากเนื้อไฟล์ที่ตรวจได้ (ดู upload.go)
	ext, err := ValidateImageUpload(file)
	if err != nil {
		c.JSON(UploadErrorStatus(err), gin.H{"error": err.Error()})
		return
	}

	// โฟลเดอร์ย่อยสำหรับแยกประเภทรูป (profile/slip/news) — ส่งมาจาก client ผ่าน form field "folder"
	subfolder := services.SanitizeSubfolder(c.PostForm("folder"))

	// เก็บบน Cloudinary เมื่อถูกตั้งค่า
	if ctrl.cloudinary != nil {
		src, err := file.Open()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "เปิดไฟล์ที่อัปโหลดไม่สำเร็จ"})
			return
		}
		defer src.Close()

		url, err := ctrl.cloudinary.UploadFileToFolder(c.Request.Context(), src, subfolder)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "อัปโหลดไฟล์ขึ้น Cloudinary ไม่สำเร็จ: " + err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"url": url})
		return
	}

	// Create uploads directory if not exists — แยกโฟลเดอร์ย่อยตามประเภทให้ตรงกับฝั่ง Cloudinary
	uploadDir := "./uploads"
	urlPath := "/uploads/"
	if subfolder != "" {
		uploadDir = filepath.Join(uploadDir, subfolder)
		urlPath = "/uploads/" + subfolder + "/"
	}
	if err := os.MkdirAll(uploadDir, os.ModePerm); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถสร้างโฟลเดอร์สำหรับอัปโหลดได้"})
		return
	}

	// ตั้งชื่อไฟล์เองทั้งหมด ไม่เอาชื่อเดิมจาก client มาใช้แม้แต่ส่วนเดียว
	//
	// ของเดิมใช้ filepath.Base(file.Filename) ต่อท้าย ทำให้อัปโหลด evil.html
	// แล้วได้ไฟล์ 123-evil.html ที่เสิร์ฟจาก origin เดียวกับเว็บ = stored XSS
	// ชื่อไฟล์เดิมไม่ได้ถูกใช้อ้างอิงที่ไหน จึงทิ้งได้เลย
	filename := fmt.Sprintf("%d%s", time.Now().UnixNano(), ext)
	filePath := filepath.Join(uploadDir, filename)

	if err := c.SaveUploadedFile(file, filePath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "บันทึกไฟล์อัปโหลดไม่สำเร็จ"})
		return
	}

	// Return the local URL
	c.JSON(http.StatusOK, gin.H{
		"url": "http://localhost:8000" + urlPath + filename,
	})
}
