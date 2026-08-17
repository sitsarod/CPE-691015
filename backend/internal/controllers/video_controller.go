package controllers

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
	"CPE-691015/internal/services"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type VideoController struct {
	videoService *services.DetectedVideoService
	db           *gorm.DB
}

func NewVideoController(videoService *services.DetectedVideoService, db *gorm.DB) *VideoController {
	return &VideoController{
		videoService: videoService,
		db:           db,
	}
}

// UploadVideo handles POST /api/coaches/videos
// โค้ชอัปโหลดวิดีโอ ระบบจะบันทึกและรันการวิเคราะห์จำลองใบหน้า (Mock Face Detection)
func (ctrl *VideoController) UploadVideo(c *gin.Context) {
	_, role, ok := GetAuthContext(c)
	if !ok || (role != "coach" && role != "admin") {
		c.JSON(http.StatusForbidden, gin.H{"error": "เฉพาะโค้ชหรือผู้ดูแลระบบเท่านั้นที่สามารถอัปโหลดวิดีโอได้"})
		return
	}

	// 1. รับไฟล์วิดีโอ
	file, err := c.FormFile("video")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาแนบไฟล์วิดีโอ (ฟิลด์ 'video')"})
		return
	}

	// ตรวจว่าเป็นวิดีโอจริงและขนาดไม่เกิน ก่อนเขียนอะไรลงดิสก์ (ดูเหตุผลใน upload.go)
	ext, err := ValidateVideoUpload(file)
	if err != nil {
		c.JSON(UploadErrorStatus(err), gin.H{"error": err.Error()})
		return
	}

	// สร้างโฟลเดอร์สำหรับเก็บวิดีโอ
	uploadDir := "./uploads/videos"
	if err := os.MkdirAll(uploadDir, os.ModePerm); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถสร้างโฟลเดอร์ระบบได้"})
		return
	}

	filename := fmt.Sprintf("video-%d%s", time.Now().UnixNano(), ext)
	filePath := filepath.Join(uploadDir, filename)

	if err := c.SaveUploadedFile(file, filePath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "บันทึกไฟล์วิดีโอล้มเหลว"})
		return
	}

	videoURL := "http://localhost:8000/uploads/videos/" + filename

	// 2. สร้าง RawVideo บันทึกลง DB
	rawVideo, err := ctrl.videoService.CreateRawVideo(videoURL)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 3. รัน Mock Face Recognition
	detectedVideos, err := ctrl.videoService.ProcessFaceDetection(rawVideo.ID, videoURL)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "การวิเคราะห์สแกนใบหน้าขัดข้อง: " + err.Error()})
		return
	}

	// ดึงรายการ ID นักเรียนที่ถูกตรวจจับเจอ
	var studentIDs []uint
	for _, dv := range detectedVideos {
		studentIDs = append(studentIDs, dv.CustomerID)
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "อัปโหลดวิดีโอและสแกนใบหน้าผู้ประเมินเรียบร้อย",
		"data": dto.UploadVideoResponse{
			RawVideoID: rawVideo.ID,
			VideoURL:   rawVideo.VideoURL,
			StudentIDs: studentIDs,
		},
	})
}

// ManuallyAssignStudents handles POST /api/coaches/videos/:raw_video_id/assign
// โค้ชติ๊กเลือกนักเรียนในวิดีโอด้วยตนเอง (Override / แก้ไขผลจาก AI)
func (ctrl *VideoController) ManuallyAssignStudents(c *gin.Context) {
	_, role, ok := GetAuthContext(c)
	if !ok || (role != "coach" && role != "admin") {
		c.JSON(http.StatusForbidden, gin.H{"error": "เฉพาะโค้ชหรือผู้ดูแลระบบเท่านั้นที่สามารถแก้ไขข้อมูลวิดีโอนี้ได้"})
		return
	}

	rawVideoIDParam, err := strconv.ParseUint(c.Param("raw_video_id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "รหัสวิดีโอไม่ถูกต้อง"})
		return
	}
	rawVideoID := uint(rawVideoIDParam)

	// ค้นหา RawVideo เพื่อเช็คความถูกต้องและดึง URL
	var rawVideo models.RawVideo
	if err := ctrl.db.First(&rawVideo, rawVideoID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบข้อมูลวิดีโอต้นฉบับ"})
		return
	}

	// รับลิสต์ ID นักเรียนจาก Body
	var req struct {
		StudentIDs []uint `json:"student_ids"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "รูปแบบรายการ ID นักเรียนไม่ถูกต้อง"})
		return
	}

	results, err := ctrl.videoService.ManuallyAssignStudentsToVideo(rawVideoID, rawVideo.VideoURL, req.StudentIDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var studentIDs []uint
	for _, r := range results {
		studentIDs = append(studentIDs, r.CustomerID)
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "อัปเดตรายชื่อนักเรียนที่มีส่วนร่วมในวิดีโอนี้สำเร็จแล้ว",
		"student_ids": studentIDs,
	})
}

// GetMyDetectedVideos handles GET /api/students/videos
// นักเรียนเปิดดูคลิปวิดีโอทั้งหมดของตัวเองที่มีระบบ AI ตรวจจับเจอ
func (ctrl *VideoController) GetMyDetectedVideos(c *gin.Context) {
	userID, _, ok := GetAuthContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "กรุณาเข้าสู่ระบบ"})
		return
	}

	customerID, err := services.ResolveCustomerID(ctrl.db, userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบโปรไฟล์นักเรียนสำหรับบัญชีนี้"})
		return
	}

	detectedVideos, err := ctrl.videoService.GetDetectedVideosByStudentID(customerID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var responses []dto.DetectedVideoResponse
	for _, dv := range detectedVideos {
		responses = append(responses, dto.DetectedVideoResponse{
			ID:         dv.ID,
			CustomerID: dv.CustomerID,
			RawVideoID: dv.RawVideoID,
			VideoURL:   dv.VideoURL,
			CreatedAt:  dv.CreatedAt,
		})
	}

	c.JSON(http.StatusOK, gin.H{"data": responses})
}

// GetVideoDetectedStudents handles GET /api/coaches/videos/:raw_video_id/students
// ดึงรายชื่อนักเรียนที่ระบบวิเคราะห์ว่าอยู่ในวิดีโอนี้
func (ctrl *VideoController) GetVideoDetectedStudents(c *gin.Context) {
	rawVideoIDParam, err := strconv.ParseUint(c.Param("raw_video_id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "รหัสวิดีโอไม่ถูกต้อง"})
		return
	}
	rawVideoID := uint(rawVideoIDParam)

	list, err := ctrl.videoService.GetDetectedVideosByRawVideoID(rawVideoID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	type DetectedStudentInfo struct {
		CustomerID uint   `json:"customer_id"`
		Nickname   string `json:"nickname"`
		FirstName  string `json:"firstName"`
		LastName   string `json:"lastName"`
	}

	var response []DetectedStudentInfo
	for _, item := range list {
		if item.Customer != nil && item.Customer.User != nil {
			response = append(response, DetectedStudentInfo{
				CustomerID: item.CustomerID,
				Nickname:   item.Customer.Nickname,
				FirstName:  item.Customer.User.FirstName,
				LastName:   item.Customer.User.LastName,
			})
		}
	}

	c.JSON(http.StatusOK, gin.H{"data": response})
}
