package controllers

import (
	"errors"
	"net/http"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
	"CPE-691015/internal/services"

	"github.com/gin-gonic/gin"
)

type FaceImageController struct {
	service *services.FaceImageService
}

func NewFaceImageController(service *services.FaceImageService) *FaceImageController {
	return &FaceImageController{service: service}
}

// mapFaceImageError — หน้าเว็บต้องแยกได้ว่า "ยังไม่ยินยอม" (พาไปหน้ายินยอม)
// ต่างจาก "ถ่ายท่านี้แล้ว" (ให้ลบก่อน) จึงไม่ตอบ 500 รวมทุกกรณี
func mapFaceImageError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, services.ErrFaceImageNotFound),
		errors.Is(err, services.ErrCustomerProfileNotFound),
		errors.Is(err, services.ErrCustomerNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})

	case errors.Is(err, services.ErrFaceConsentRequired),
		errors.Is(err, services.ErrFaceImageForbidden):
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})

	case errors.Is(err, services.ErrInvalidFacePose),
		errors.Is(err, services.ErrInvalidFaceStatus),
		errors.Is(err, services.ErrInvalidReviewAction),
		errors.Is(err, services.ErrRejectReasonRequired):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})

	case errors.Is(err, services.ErrFacePoseAlreadyExists),
		errors.Is(err, services.ErrFaceImageLimitReached):
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})

	// ยังไม่ได้ตั้งค่าที่เก็บไฟล์ = ระบบยังไม่พร้อม ไม่ใช่ผู้ใช้ทำผิด
	case errors.Is(err, services.ErrFaceStorageUnavailable):
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})

	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
	}
}

// UploadFaceImage [POST] /api/face-images — นักเรียนอัปโหลดรูปใบหน้าหนึ่งท่า
func (ctrl *FaceImageController) UploadFaceImage(c *gin.Context) {
	userID, _, ok := GetAuthContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "กรุณาเข้าสู่ระบบ"})
		return
	}

	// ⚠️ ต้องครอบก่อน c.FormFile — ถ้าเช็คแค่ fh.Size ทีหลัง gin อ่านไฟล์ทั้งก้อน
	// เข้าหน่วยความจำไปแล้ว (เผื่อ 1 MB ให้ header ของ multipart)
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, MaxImageUploadBytes+(1<<20))

	pose := models.FacePose(c.PostForm("pose"))
	if !models.IsValidFacePose(pose) {
		c.JSON(http.StatusBadRequest, gin.H{"error": services.ErrInvalidFacePose.Error()})
		return
	}

	fh, err := c.FormFile("photo")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาแนบไฟล์รูปภาพใบหน้า (ฟิลด์ 'photo')"})
		return
	}

	// ตรวจจากเนื้อไฟล์จริง ไม่เชื่อชื่อไฟล์และ Content-Type ที่ client ส่งมา
	if _, err := ValidateFaceImageUpload(fh); err != nil {
		status := UploadErrorStatus(err)
		if errors.Is(err, ErrUploadBadType) {
			// 415 บอกตรงว่าชนิดไฟล์ไม่รับ ซึ่งหน้าเว็บขึ้นข้อความได้ตรงกว่า 400
			status = http.StatusUnsupportedMediaType
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}

	file, err := fh.Open()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": ErrUploadUnreadable.Error()})
		return
	}
	defer file.Close()

	image, err := ctrl.service.Upload(userID, pose, file)
	if err != nil {
		mapFaceImageError(c, err)
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "อัปโหลดสำเร็จ กำลังประมวลผลภาพ",
		"data":    image,
	})
}

// GetMyFaceImages [GET] /api/face-images/me — รูปของตัวเองพร้อมสถานะแต่ละท่า
func (ctrl *FaceImageController) GetMyFaceImages(c *gin.Context) {
	userID, _, ok := GetAuthContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "กรุณาเข้าสู่ระบบ"})
		return
	}

	images, err := ctrl.service.ListMine(userID)
	if err != nil {
		mapFaceImageError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data":     images,
		"required": models.AllFacePoses,
	})
}

// GetFaceImageRaw [GET] /api/face-images/:id/raw — เนื้อไฟล์รูป (เจ้าของหรือแอดมิน)
//
// ⚠️ ทางเดียวที่จะดูรูปได้ — ไฟล์อยู่บน Cloudinary โหมด authenticated ที่เปิดจาก URL
// ตรงไม่ได้ backend ดึงมา stream ต่อให้ จึงไม่มี URL ของภาพใบหน้าหลุดออกนอกระบบ
func (ctrl *FaceImageController) GetFaceImageRaw(c *gin.Context) {
	userID, role, ok := GetAuthContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "กรุณาเข้าสู่ระบบ"})
		return
	}

	imageID, ok := uintParam(c, "id", "รหัสรูปภาพ")
	if !ok {
		return
	}

	body, contentType, err := ctrl.service.OpenRaw(userID, models.UserRole(role), imageID)
	if err != nil {
		mapFaceImageError(c, err)
		return
	}
	defer body.Close()

	// ห้าม cache — สิทธิ์การดูอาจถูกถอนทีหลัง สำเนาที่ค้างในเบราว์เซอร์จะกลายเป็นช่องรั่ว
	c.Header("Cache-Control", "no-store, private")
	c.Header("X-Content-Type-Options", "nosniff")
	c.DataFromReader(http.StatusOK, -1, contentType, body, nil)
}

// DeleteFaceImage [DELETE] /api/face-images/:id — ลบรูป + ไฟล์จริง
func (ctrl *FaceImageController) DeleteFaceImage(c *gin.Context) {
	userID, role, ok := GetAuthContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "กรุณาเข้าสู่ระบบ"})
		return
	}

	imageID, ok := uintParam(c, "id", "รหัสรูปภาพ")
	if !ok {
		return
	}

	if err := ctrl.service.Delete(userID, models.UserRole(role), imageID); err != nil {
		mapFaceImageError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "ลบรูปภาพใบหน้าเรียบร้อยแล้ว"})
}

// ─── ฝั่งแอดมิน ───

// ListFaceImagesForAdmin [GET] /api/admin/face-images?status=... — คิวรอตรวจ
//
// ไม่ใส่ status = ทุกสถานะ เพราะยังไม่มี worker สร้าง embedding
// รูปจึงค้างที่ pending ไม่ขยับไป awaiting_review (เฟส C)
func (ctrl *FaceImageController) ListFaceImagesForAdmin(c *gin.Context) {
	images, err := ctrl.service.ListForAdmin(c.Query("status"))
	if err != nil {
		mapFaceImageError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": images})
}

// ReviewFaceImage [PATCH] /api/admin/face-images/:id/review
// body: {"action":"approve"} หรือ {"action":"reject","reason":"..."}
func (ctrl *FaceImageController) ReviewFaceImage(c *gin.Context) {
	adminUserID, _, ok := GetAuthContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "กรุณาเข้าสู่ระบบ"})
		return
	}

	imageID, ok := uintParam(c, "id", "รหัสรูปภาพ")
	if !ok {
		return
	}

	var req dto.FaceImageReviewRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": services.ErrInvalidReviewAction.Error()})
		return
	}

	image, err := ctrl.service.Review(adminUserID, imageID, req.Action, req.Reason)
	if err != nil {
		mapFaceImageError(c, err)
		return
	}

	msg := "อนุมัติรูปใบหน้าเรียบร้อยแล้ว"
	if req.Action == "reject" {
		msg = "ปฏิเสธรูปใบหน้าและลบไฟล์ออกจากระบบแล้ว"
	}
	c.JSON(http.StatusOK, gin.H{"message": msg, "data": image})
}
