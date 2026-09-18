package controllers

import (
	"bytes"
	"errors"
	"io"
	"log"
	"net/http"
	"strconv"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
	"CPE-691015/internal/services"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type VideoController struct {
	videoService   *services.DetectedVideoService
	taggingService *services.FaceTaggingService
	mediaStorage   services.MediaStorage
	db             *gorm.DB
}

func NewVideoController(
	videoService *services.DetectedVideoService,
	taggingService *services.FaceTaggingService,
	mediaStorage services.MediaStorage,
	db *gorm.DB,
) *VideoController {
	return &VideoController{
		videoService:   videoService,
		taggingService: taggingService,
		mediaStorage:   mediaStorage,
		db:             db,
	}
}

// UploadVideo handles POST /api/coaches/videos
//
// โค้ช/แอดมินอัปโหลดวิดีโอ แล้วระบบลองจำแนกว่ามีนักเรียนคนไหนอยู่ในคลิปบ้าง (เทียบกับนักเรียน
// ทั้งโรงเรียน ไม่ต้องเลือกคอร์สก่อน — ดูเหตุผลที่ FaceTaggingService.DetectStudentsInVideo)
// ⚠️ ผลที่คืนไปเป็นแค่ "ข้อเสนอ" ยังไม่ได้แท็กใครจริง — ต้องผ่าน ManuallyAssignStudents อีกที
// (เหมือน UploadPhotoPost ทุกอย่าง — ก่อนหน้านี้เคยเขียน DetectedVideo ลง DB ทันทีตอนอัปโหลด
// ด้วยผลจากระบบ mock แบบสุ่ม ทำให้คนที่ AI เดา "ยังไม่ได้ยืนยัน" ไปโผล่ในแท็บ Posts ของนักเรียน
// ก่อนโค้ชตรวจทานเสร็จ — แก้ให้เป็น suggestion-only เหมือนฝั่งรูปแล้ว)
func (ctrl *VideoController) UploadVideo(c *gin.Context) {
	userID, role, ok := GetAuthContext(c)
	if !ok || (role != "coach" && role != "admin") {
		respondJSON(c, http.StatusForbidden, gin.H{"error": "เฉพาะโค้ชหรือผู้ดูแลระบบเท่านั้นที่สามารถอัปโหลดวิดีโอได้"})
		return
	}

	// วิดีโอที่แอดมินอัปโหลดเองจะไม่ผูกกับโค้ชคนไหน (coachID เป็น nil)
	var coachID *uint
	if role == "coach" {
		var coach models.Coach
		if err := ctrl.db.Where("user_id = ?", userID).First(&coach).Error; err == nil {
			coachID = &coach.ID
		}
	}

	fh, err := c.FormFile("video")
	if err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "กรุณาแนบไฟล์วิดีโอ (ฟิลด์ 'video')"})
		return
	}

	// ตรวจว่าเป็นวิดีโอจริงและขนาดไม่เกิน ก่อนเขียนอะไรลงที่เก็บไฟล์ (ดูเหตุผลใน upload.go)
	ext, err := ValidateVideoUpload(fh)
	if err != nil {
		respondJSON(c, UploadErrorStatus(err), gin.H{"error": err.Error()})
		return
	}

	file, err := fh.Open()
	if err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": ErrUploadUnreadable.Error()})
		return
	}
	defer file.Close()

	// อ่านเข้าหน่วยความจำครั้งเดียวแล้วใช้สองต่อ (เก็บไฟล์ + ส่งให้โมเดลจำแนก) — เหมือน
	// UploadPhotoPost ปลอดภัยเพราะ ValidateVideoUpload คุมขนาดไว้ที่ MaxVideoUploadBytes มาแล้ว
	raw, err := io.ReadAll(io.LimitReader(file, MaxVideoUploadBytes))
	if err != nil || len(raw) == 0 {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": ErrUploadUnreadable.Error()})
		return
	}

	storageKey, err := ctrl.mediaStorage.Save(c.Request.Context(), services.MediaKindVideo, bytes.NewReader(raw), ext)
	if err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": "บันทึกไฟล์วิดีโอล้มเหลว"})
		return
	}

	rawVideo, err := ctrl.videoService.CreateRawVideo(storageKey, coachID)
	if err != nil {
		// เขียนแถวไม่สำเร็จ = ไฟล์ที่เพิ่งอัปไม่มีใครชี้ถึงอีกเลย ต้องลบทันที (เหมือน FaceImageService.Upload)
		_ = ctrl.mediaStorage.Delete(c.Request.Context(), services.MediaKindVideo, storageKey)
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	resp := dto.UploadVideoResponse{
		RawVideoID: rawVideo.ID,
		VideoURL:   rawVideo.VideoURL,
		Students:   []dto.DetectedStudentSuggestion{},
	}

	// จำแนกใบหน้าแบบ best-effort — face-service ล่มหรือยังไม่ตั้งค่า ต้องไม่ทำให้อัปโหลดล้มเหลว
	// (หลักการเดียวกับเช็คชื่อที่ยังใช้ QR ต่อได้เมื่อระบบใบหน้าใช้ไม่ได้) โค้ชแท็กเองได้อยู่แล้ว
	// ทำทั้งโค้ชและแอดมิน เพราะเทียบกับนักเรียนทั้งโรงเรียนแล้ว ไม่ต้องรู้ว่าใครสอนคอร์สไหน
	matches, faceCount, err := ctrl.taggingService.DetectStudentsInVideo(c.Request.Context(), raw)
	if err != nil {
		log.Printf("จำแนกใบหน้าในวิดีโอ raw_video=%d ไม่สำเร็จ: %v", rawVideo.ID, err)
	} else {
		resp.FaceCount = faceCount
		for _, m := range matches {
			resp.Students = append(resp.Students, dto.DetectedStudentSuggestion{
				CustomerID: m.CustomerID,
				Nickname:   m.Nickname,
				Confidence: m.Confidence * 100, // คืนเป็นเปอร์เซ็นต์ให้หน้าเว็บใช้ได้ตรง ๆ
				BBox:       m.BBox,
				FrameImage: m.FrameImage, // เฟรมที่แมตช์ได้ (ย่อขนาดแล้ว) ให้โค้ชวาดกรอบดูภาพจริงตอนตรวจทาน
			})
		}
	}

	respondJSON(c, http.StatusOK, gin.H{"message": "อัปโหลดวิดีโอสำเร็จ", "data": resp})
}

// GetVideoRaw handles GET /api/videos/:raw_video_id/raw — เนื้อไฟล์วิดีโอจริง
//
// เฉพาะแอดมิน, โค้ชเจ้าของวิดีโอนี้, หรือนักเรียนที่ถูกแท็กอยู่ในวิดีโอนี้เท่านั้นที่เปิดได้
func (ctrl *VideoController) GetVideoRaw(c *gin.Context) {
	userID, role, ok := GetAuthContext(c)
	if !ok {
		respondJSON(c, http.StatusUnauthorized, gin.H{"error": "กรุณาเข้าสู่ระบบ"})
		return
	}

	rawVideoID, ok := uintParam(c, "raw_video_id", "รหัสวิดีโอ")
	if !ok {
		return
	}

	var rawVideo models.RawVideo
	if err := ctrl.db.First(&rawVideo, rawVideoID).Error; err != nil {
		respondJSON(c, http.StatusNotFound, gin.H{"error": "ไม่พบข้อมูลวิดีโอต้นฉบับ"})
		return
	}

	if err := services.VerifyCanViewRawVideo(ctrl.db, &rawVideo, userID, role); err != nil {
		respondJSON(c, http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}

	body, contentType, err := ctrl.mediaStorage.Open(c.Request.Context(), services.MediaKindVideo, rawVideo.StorageKey)
	if err != nil {
		if errors.Is(err, services.ErrMediaNotFound) {
			respondJSON(c, http.StatusNotFound, gin.H{"error": "ไม่พบไฟล์วิดีโอนี้แล้ว"})
			return
		}
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": "ไม่สามารถเปิดไฟล์วิดีโอได้"})
		return
	}
	defer body.Close()

	// ห้าม cache — สิทธิ์การดูอาจถูกถอนทีหลัง สำเนาที่ค้างในเบราว์เซอร์จะกลายเป็นช่องรั่ว
	c.Header("Cache-Control", "no-store, private")
	c.Header("X-Content-Type-Options", "nosniff")
	c.DataFromReader(http.StatusOK, -1, contentType, body, nil)
}

// ManuallyAssignStudents handles POST /api/coaches/videos/:raw_video_id/assign
// โค้ชติ๊กเลือกนักเรียนในวิดีโอด้วยตนเอง (Override / แก้ไขผลจาก AI)
func (ctrl *VideoController) ManuallyAssignStudents(c *gin.Context) {
	userID, role, ok := GetAuthContext(c)
	if !ok || (role != "coach" && role != "admin") {
		respondJSON(c, http.StatusForbidden, gin.H{"error": "เฉพาะโค้ชหรือผู้ดูแลระบบเท่านั้นที่สามารถแก้ไขข้อมูลวิดีโอนี้ได้"})
		return
	}

	rawVideoIDParam, err := strconv.ParseUint(c.Param("raw_video_id"), 10, 32)
	if err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "รหัสวิดีโอไม่ถูกต้อง"})
		return
	}
	rawVideoID := uint(rawVideoIDParam)

	// ค้นหา RawVideo เพื่อเช็คความถูกต้องและดึง URL
	var rawVideo models.RawVideo
	if err := ctrl.db.First(&rawVideo, rawVideoID).Error; err != nil {
		respondJSON(c, http.StatusNotFound, gin.H{"error": "ไม่พบข้อมูลวิดีโอต้นฉบับ"})
		return
	}

	// เฉพาะแอดมิน หรือโค้ชเจ้าของวิดีโอนี้เท่านั้นที่แก้ไขได้ (กัน IDOR ข้ามวิดีโอของโค้ชคนอื่น)
	if err := services.VerifyCoachOwnsRawVideo(ctrl.db, &rawVideo, userID, role); err != nil {
		respondJSON(c, http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}

	// รับลิสต์ ID นักเรียนจาก Body
	var req struct {
		StudentIDs []uint `json:"student_ids"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "รูปแบบรายการ ID นักเรียนไม่ถูกต้อง"})
		return
	}

	results, skipped, err := ctrl.videoService.ManuallyAssignStudentsToVideo(rawVideoID, rawVideo.VideoURL, req.StudentIDs)
	if err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var studentIDs []uint
	for _, r := range results {
		studentIDs = append(studentIDs, r.CustomerID)
	}

	respondJSON(c, http.StatusOK, gin.H{
		"message":            "อัปเดตรายชื่อนักเรียนที่มีส่วนร่วมในวิดีโอนี้สำเร็จแล้ว",
		"student_ids":        studentIDs,
		"skipped_no_consent": skipped, // นักเรียนที่ถูกข้ามเพราะยังไม่ยินยอมให้เก็บข้อมูลใบหน้า
	})
}

// GetMyDetectedVideos handles GET /api/students/videos
// นักเรียนเปิดดูคลิปวิดีโอทั้งหมดของตัวเองที่มีระบบ AI ตรวจจับเจอ
func (ctrl *VideoController) GetMyDetectedVideos(c *gin.Context) {
	userID, _, ok := GetAuthContext(c)
	if !ok {
		respondJSON(c, http.StatusUnauthorized, gin.H{"error": "กรุณาเข้าสู่ระบบ"})
		return
	}

	customerID, err := services.ResolveCustomerID(ctrl.db, userID)
	if err != nil {
		respondJSON(c, http.StatusNotFound, gin.H{"error": "ไม่พบโปรไฟล์นักเรียนสำหรับบัญชีนี้"})
		return
	}

	detectedVideos, err := ctrl.videoService.GetDetectedVideosByStudentID(customerID)
	if err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": err.Error()})
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

	respondJSON(c, http.StatusOK, gin.H{"data": responses})
}

// GetVideoDetectedStudents handles GET /api/coaches/videos/:raw_video_id/students
// ดึงรายชื่อนักเรียนที่ระบบวิเคราะห์ว่าอยู่ในวิดีโอนี้ — เฉพาะแอดมิน หรือโค้ชเจ้าของวิดีโอนี้เท่านั้น
func (ctrl *VideoController) GetVideoDetectedStudents(c *gin.Context) {
	userID, role, ok := GetAuthContext(c)
	if !ok || (role != "coach" && role != "admin") {
		respondJSON(c, http.StatusForbidden, gin.H{"error": "เฉพาะโค้ชหรือผู้ดูแลระบบเท่านั้นที่ดูข้อมูลนี้ได้"})
		return
	}

	rawVideoIDParam, err := strconv.ParseUint(c.Param("raw_video_id"), 10, 32)
	if err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "รหัสวิดีโอไม่ถูกต้อง"})
		return
	}
	rawVideoID := uint(rawVideoIDParam)

	var rawVideo models.RawVideo
	if err := ctrl.db.First(&rawVideo, rawVideoID).Error; err != nil {
		respondJSON(c, http.StatusNotFound, gin.H{"error": "ไม่พบข้อมูลวิดีโอต้นฉบับ"})
		return
	}
	if err := services.VerifyCoachOwnsRawVideo(ctrl.db, &rawVideo, userID, role); err != nil {
		respondJSON(c, http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}

	list, err := ctrl.videoService.GetDetectedVideosByRawVideoID(rawVideoID)
	if err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": err.Error()})
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

	respondJSON(c, http.StatusOK, gin.H{"data": response})
}
