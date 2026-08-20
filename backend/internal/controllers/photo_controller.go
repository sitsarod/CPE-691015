package controllers

import (
	"fmt"
	"math/rand"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"CPE-691015/internal/models"
	"CPE-691015/internal/services"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type PhotoController struct {
	db *gorm.DB
}

func NewPhotoController(db *gorm.DB) *PhotoController {
	return &PhotoController{db: db}
}

// UploadFacePhoto handles POST /api/students/face-photo
// นักเรียนอัปโหลดรูปใบหน้าตรงของตนเองเพื่อเป็นแบบเรียนจำลองใบหน้า
func (ctrl *PhotoController) UploadFacePhoto(c *gin.Context) {
	userID, _, ok := GetAuthContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "กรุณาเข้าสู่ระบบ"})
		return
	}

	// 1. แปลง userID เป็น customerID
	customerID, err := services.ResolveCustomerID(ctrl.db, userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบโปรไฟล์นักเรียนสำหรับบัญชีนี้"})
		return
	}

	// 2. ตรวจสอบสถานะความยินยอม PDPA (ต้องยินยอมก่อนถึงจะอัปโหลดหน้าได้)
	var customer models.Customer
	if err := ctrl.db.First(&customer, customerID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบข้อมูลนักเรียน"})
		return
	}

	if customer.FaceConsentStatus != models.FaceConsentGranted {
		c.JSON(http.StatusForbidden, gin.H{"error": "กรุณากดยินยอมให้นโยบายการเก็บข้อมูลชีวภาพ (PDPA) ก่อนการอัปโหลดรูปภาพใบหน้า"})
		return
	}

	// 3. รับไฟล์รูปภาพ
	file, err := c.FormFile("photo")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาแนบไฟล์รูปภาพใบหน้า (ฟิลด์ 'photo')"})
		return
	}

	// ตรวจว่าเป็นรูปจริงและขนาดไม่เกิน ก่อนเขียนอะไรลงดิสก์
	// ext ที่ได้มาจากการตรวจเนื้อไฟล์ ไม่ใช่จากชื่อไฟล์ที่ client ส่งมา (ดู upload.go)
	ext, err := ValidateImageUpload(file)
	if err != nil {
		c.JSON(UploadErrorStatus(err), gin.H{"error": err.Error()})
		return
	}

	// สร้างโฟลเดอร์สำหรับเก็บภาพถ่ายใบหน้า
	uploadDir := "./uploads/faces"
	if err := os.MkdirAll(uploadDir, os.ModePerm); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถสร้างโฟลเดอร์ระบบได้"})
		return
	}

	filename := fmt.Sprintf("face-%d-%d%s", customerID, time.Now().UnixNano(), ext)
	filePath := filepath.Join(uploadDir, filename)

	if err := c.SaveUploadedFile(file, filePath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "บันทึกไฟล์รูปภาพล้มเหลว"})
		return
	}

	photoURL := "http://localhost:8000/uploads/faces/" + filename

	// 4. สุ่มสร้าง Face Embedding 128 มิติ (จำลองผลลัพธ์จาก AI)
	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	mockEmbedding := make([]float64, 128)
	for i := 0; i < 128; i++ {
		mockEmbedding[i] = r.Float64()*2.0 - 1.0 // ค่าทศนิยมอยู่ระหว่าง -1.0 ถึง 1.0
	}

	photo := models.Photo{
		CustomerID:    customerID,
		PhotoURL:      photoURL,
		FaceEmbedding: mockEmbedding,
		IsVerified:    true, // ตั้งเป็นตรวจสอบแล้วในโหมดพัฒนา
	}

	// บันทึกลงฐานข้อมูล
	if err := ctrl.db.Create(&photo).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถบันทึกข้อมูลรูปภาพใบหน้าลงฐานข้อมูลได้"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":   "อัปโหลดรูปภาพใบหน้าและประมวลผล Face Embedding สำเร็จแล้ว",
		"photo_id":  photo.ID,
		"photo_url": photo.PhotoURL,
	})
}

// DeleteFacePhoto handles DELETE /api/students/face-photo/:id
// ลบรูปใบหน้าที่เคยอัปโหลดไว้
func (ctrl *PhotoController) DeleteFacePhoto(c *gin.Context) {
	photoIDParam, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "รหัสรูปภาพไม่ถูกต้อง"})
		return
	}
	photoID := uint(photoIDParam)

	userID, role, ok := GetAuthContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "กรุณาเข้าสู่ระบบ"})
		return
	}

	// ค้นหารูปภาพก่อน
	var photo models.Photo
	if err := ctrl.db.First(&photo, photoID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบข้อมูลรูปภาพใบหน้า"})
		return
	}

	// ป้องกัน IDOR: ถ้าไม่ใช่แอดมิน ต้องเป็นรูปของตัวเอง
	if role != "admin" {
		customerID, err := services.ResolveCustomerID(ctrl.db, userID)
		if err != nil || photo.CustomerID != customerID {
			c.JSON(http.StatusForbidden, gin.H{"error": "ไม่มีสิทธิ์ลบรูปภาพใบหน้านี้"})
			return
		}
	}

	// ลบแถวก่อน แล้วค่อยลบไฟล์จริง — ลำดับนี้สำคัญ
	//
	// ถ้าลบไฟล์ก่อนแล้วลบแถวพลาด จะเหลือแถวที่ชี้ไปหาไฟล์ที่ไม่มีอยู่ ซึ่งกู้ไม่ได้
	// กลับกันถ้าลบแถวสำเร็จแล้วลบไฟล์พลาด จะเหลือไฟล์กำพร้าที่ตามเก็บทีหลังได้
	//
	// Unscoped เพราะ FaceEmbedding เป็นข้อมูลชีวภาพ การ soft delete
	// เท่ากับยังเก็บไว้แค่ซ่อนจาก query ซึ่งไม่นับว่าลบตาม PDPA
	if err := ctrl.db.Unscoped().Delete(&photo).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถลบข้อมูลรูปภาพออกจากระบบได้"})
		return
	}

	// ใช้ตัวเดียวกับตอนลบสมาชิกและตอนถอนความยินยอม (services/photo_storage.go)
	services.RemovePhotoFiles([]string{photo.PhotoURL})

	c.JSON(http.StatusOK, gin.H{"message": "ลบรูปภาพใบหน้าเรียบร้อยแล้ว"})
}

// GetMyPhotos handles GET /api/students/face-photo/me
// ดึงประวัติรูปภาพใบหน้าที่นักเรียนเคยอัปโหลด
func (ctrl *PhotoController) GetMyPhotos(c *gin.Context) {
	userID, _, ok := GetAuthContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "กรุณาเข้าสู่ระบบ"})
		return
	}

	customerID, err := services.ResolveCustomerID(ctrl.db, userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบข้อมูลนักเรียน"})
		return
	}

	var photos []models.Photo
	if err := ctrl.db.Where("customer_id = ?", customerID).Find(&photos).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถดึงข้อมูลรูปภาพได้"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": photos})
}
