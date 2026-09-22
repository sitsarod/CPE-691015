package controllers

import (
	"bytes"
	"errors"
	"io"
	"log"
	"net/http"
	"sort"
	"strconv"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
	"CPE-691015/internal/services"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// PhotoPostController จัดการ "รูปโพสต์" ที่โค้ชอัปโหลด (อาจมีนักเรียนหลายคนอยู่ในรูปเดียว)
// แล้วนำไปแสดงในแท็บ Posts ของโปรไฟล์นักเรียนที่ถูกแท็ก
//
// อย่าสับสนกับ PhotoController — ตัวนั้นจัดการ "รูปยินยอมอ้างอิงใบหน้า" ของนักเรียน/โค้ชคนเดียว
type PhotoPostController struct {
	photoPostService *services.DetectedPhotoService
	videoService     *services.DetectedVideoService
	taggingService   *services.FaceTaggingService
	mediaStorage     services.MediaStorage
	db               *gorm.DB
}

func NewPhotoPostController(
	photoPostService *services.DetectedPhotoService,
	videoService *services.DetectedVideoService,
	taggingService *services.FaceTaggingService,
	mediaStorage services.MediaStorage,
	db *gorm.DB,
) *PhotoPostController {
	return &PhotoPostController{
		photoPostService: photoPostService,
		videoService:     videoService,
		taggingService:   taggingService,
		mediaStorage:     mediaStorage,
		db:               db,
	}
}

// UploadPhotoPost handles POST /api/photo-posts
//
// โค้ช/แอดมินอัปโหลดรูป แล้วระบบลองจำแนกว่ามีนักเรียนคนไหนอยู่ในรูปบ้าง (เทียบกับนักเรียนทั้งโรงเรียน
// ไม่ต้องเลือกคอร์สก่อน — ดูเหตุผลที่ FaceTaggingService.DetectStudentsInPhoto)
// ⚠️ ผลที่คืนไปเป็นแค่ "ข้อเสนอ" ยังไม่ได้แท็กใครจริง — ต้องผ่าน AssignStudentsToPhoto อีกที
func (ctrl *PhotoPostController) UploadPhotoPost(c *gin.Context) {
	userID, role, ok := GetAuthContext(c)
	if !ok || (role != "coach" && role != "admin") {
		respondJSON(c, http.StatusForbidden, gin.H{"error": "เฉพาะโค้ชหรือผู้ดูแลระบบเท่านั้นที่สามารถอัปโหลดรูปได้"})
		return
	}

	fh, err := c.FormFile("photo")
	if err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "กรุณาแนบไฟล์รูปภาพ (ฟิลด์ 'photo')"})
		return
	}

	ext, err := ValidateImageUpload(fh)
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

	// อ่านเข้าหน่วยความจำครั้งเดียวแล้วใช้สองต่อ (เก็บไฟล์ + ส่งให้โมเดลจำแนก)
	// ปลอดภัยเพราะ ValidateImageUpload คุมขนาดไว้ที่ MaxImageUploadBytes มาแล้ว
	raw, err := io.ReadAll(io.LimitReader(file, MaxImageUploadBytes))
	if err != nil || len(raw) == 0 {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": ErrUploadUnreadable.Error()})
		return
	}

	storageKey, err := ctrl.mediaStorage.Save(c.Request.Context(), services.MediaKindPhotoPost, bytes.NewReader(raw), ext)
	if err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": "บันทึกไฟล์รูปล้มเหลว"})
		return
	}

	// รูปที่แอดมินอัปโหลดเองจะไม่ผูกกับโค้ชคนไหน (coachID เป็น nil)
	var coachID *uint
	if role == "coach" {
		var coach models.Coach
		if err := ctrl.db.Where("user_id = ?", userID).First(&coach).Error; err == nil {
			coachID = &coach.ID
		}
	}

	rawPhoto, err := ctrl.photoPostService.CreateRawPhoto(storageKey, coachID)
	if err != nil {
		// เขียนแถวไม่สำเร็จ = ไฟล์ที่เพิ่งอัปไม่มีใครชี้ถึงอีกเลย ต้องลบทันที (เหมือน FaceImageService.Upload)
		_ = ctrl.mediaStorage.Delete(c.Request.Context(), services.MediaKindPhotoPost, storageKey)
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	resp := dto.UploadPhotoPostResponse{
		RawPhotoID: rawPhoto.ID,
		PhotoURL:   rawPhoto.PhotoURL,
		Students:   []dto.DetectedStudentSuggestion{},
	}

	// จำแนกใบหน้าแบบ best-effort — face-service ล่มหรือยังไม่ตั้งค่า ต้องไม่ทำให้อัปโหลดล้มเหลว
	// (หลักการเดียวกับเช็คชื่อที่ยังใช้ QR ต่อได้เมื่อระบบใบหน้าใช้ไม่ได้) โค้ชแท็กเองได้อยู่แล้ว
	// ทำทั้งโค้ชและแอดมิน เพราะเทียบกับนักเรียนทั้งโรงเรียนแล้ว ไม่ต้องรู้ว่าใครสอนคอร์สไหน
	matches, faceCount, err := ctrl.taggingService.DetectStudentsInPhoto(c.Request.Context(), raw)
	if err != nil {
		log.Printf("จำแนกใบหน้าในรูป raw_photo=%d (%d bytes) ไม่สำเร็จ: %v", rawPhoto.ID, len(raw), err)
		// ดูคอมเมนต์เต็มที่ video_controller.go — ErrFaceTaggingUnavailable ไม่ใช่ความผิดของไฟล์นี้
		if !errors.Is(err, services.ErrFaceTaggingUnavailable) {
			resp.FaceTagError = "ระบบจำแนกใบหน้าอัตโนมัติทำงานกับไฟล์นี้ไม่สำเร็จ (เช่น ไฟล์เสียหาย หรือระบบขัดข้อง) — เพิ่มชื่อผู้เรียนเองได้ด้านล่าง"
		}
	} else {
		resp.FaceCount = faceCount
		for _, m := range matches {
			resp.Students = append(resp.Students, dto.DetectedStudentSuggestion{
				CustomerID: m.CustomerID,
				Nickname:   m.Nickname,
				Confidence: m.Confidence * 100, // คืนเป็นเปอร์เซ็นต์ให้หน้าเว็บใช้ได้ตรง ๆ
				BBox:       m.BBox,
			})
		}
	}

	respondJSON(c, http.StatusOK, gin.H{"message": "อัปโหลดรูปสำเร็จ", "data": resp})
}

// GetPhotoPostRaw handles GET /api/photo-posts/:raw_photo_id/raw — เนื้อไฟล์รูปจริง
//
// เฉพาะแอดมิน, โค้ชเจ้าของรูปนี้, หรือนักเรียนที่ถูกแท็กอยู่ในรูปนี้เท่านั้นที่เปิดได้
// (เหตุผลเดียวกับ FaceImageController.GetFaceImageRaw — ไฟล์เก็บแบบ private ต้อง proxy
// ผ่าน backend ที่ตรวจสิทธิ์แล้วเท่านั้น ไม่มี URL ที่เปิดตรงได้)
func (ctrl *PhotoPostController) GetPhotoPostRaw(c *gin.Context) {
	userID, role, ok := GetAuthContext(c)
	if !ok {
		respondJSON(c, http.StatusUnauthorized, gin.H{"error": "กรุณาเข้าสู่ระบบ"})
		return
	}

	rawPhotoID, ok := uintParam(c, "raw_photo_id", "รหัสรูป")
	if !ok {
		return
	}

	var rawPhoto models.RawPhoto
	if err := ctrl.db.First(&rawPhoto, rawPhotoID).Error; err != nil {
		respondJSON(c, http.StatusNotFound, gin.H{"error": "ไม่พบข้อมูลรูปต้นฉบับ"})
		return
	}

	if err := services.VerifyCanViewRawPhoto(ctrl.db, &rawPhoto, userID, role); err != nil {
		respondJSON(c, http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}

	body, contentType, err := ctrl.mediaStorage.Open(c.Request.Context(), services.MediaKindPhotoPost, rawPhoto.StorageKey)
	if err != nil {
		if errors.Is(err, services.ErrMediaNotFound) {
			respondJSON(c, http.StatusNotFound, gin.H{"error": "ไม่พบไฟล์รูปนี้แล้ว"})
			return
		}
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": "ไม่สามารถเปิดไฟล์รูปได้"})
		return
	}
	defer body.Close()

	// ห้าม cache — สิทธิ์การดูอาจถูกถอนทีหลัง สำเนาที่ค้างในเบราว์เซอร์จะกลายเป็นช่องรั่ว
	c.Header("Cache-Control", "no-store, private")
	c.Header("X-Content-Type-Options", "nosniff")
	c.DataFromReader(http.StatusOK, -1, contentType, body, nil)
}

// AssignStudentsToPhoto handles POST /api/photo-posts/:raw_photo_id/assign
// โค้ชระบุว่านักเรียนคนไหนอยู่ในรูปนี้บ้าง
func (ctrl *PhotoPostController) AssignStudentsToPhoto(c *gin.Context) {
	userID, role, ok := GetAuthContext(c)
	if !ok || (role != "coach" && role != "admin") {
		respondJSON(c, http.StatusForbidden, gin.H{"error": "เฉพาะโค้ชหรือผู้ดูแลระบบเท่านั้นที่สามารถแก้ไขข้อมูลรูปนี้ได้"})
		return
	}

	rawPhotoIDParam, err := strconv.ParseUint(c.Param("raw_photo_id"), 10, 32)
	if err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "รหัสรูปไม่ถูกต้อง"})
		return
	}
	rawPhotoID := uint(rawPhotoIDParam)

	var rawPhoto models.RawPhoto
	if err := ctrl.db.First(&rawPhoto, rawPhotoID).Error; err != nil {
		respondJSON(c, http.StatusNotFound, gin.H{"error": "ไม่พบข้อมูลรูปต้นฉบับ"})
		return
	}

	if err := services.VerifyCoachOwnsRawPhoto(ctrl.db, &rawPhoto, userID, role); err != nil {
		respondJSON(c, http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}

	var req struct {
		StudentIDs []uint `json:"student_ids"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "รูปแบบรายการ ID นักเรียนไม่ถูกต้อง"})
		return
	}

	results, skipped, err := ctrl.photoPostService.AssignStudentsToPhoto(rawPhotoID, rawPhoto.PhotoURL, req.StudentIDs)
	if err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var studentIDs []uint
	for _, r := range results {
		studentIDs = append(studentIDs, r.CustomerID)
	}

	respondJSON(c, http.StatusOK, gin.H{
		"message":            "อัปเดตรายชื่อนักเรียนในรูปนี้สำเร็จแล้ว",
		"student_ids":        studentIDs,
		"skipped_no_consent": skipped, // นักเรียนที่ถูกข้ามเพราะยังไม่ยินยอมให้เก็บข้อมูลใบหน้า
	})
}

// GetVideoDetectedStudentsInPhoto handles GET /api/photo-posts/:raw_photo_id/students
// ดึงรายชื่อนักเรียนที่ถูกแท็กอยู่ในรูปนี้ — เฉพาะแอดมิน หรือโค้ชเจ้าของรูปนี้เท่านั้น
func (ctrl *PhotoPostController) GetPhotoDetectedStudents(c *gin.Context) {
	userID, role, ok := GetAuthContext(c)
	if !ok || (role != "coach" && role != "admin") {
		respondJSON(c, http.StatusForbidden, gin.H{"error": "เฉพาะโค้ชหรือผู้ดูแลระบบเท่านั้นที่ดูข้อมูลนี้ได้"})
		return
	}

	rawPhotoIDParam, err := strconv.ParseUint(c.Param("raw_photo_id"), 10, 32)
	if err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "รหัสรูปไม่ถูกต้อง"})
		return
	}
	rawPhotoID := uint(rawPhotoIDParam)

	var rawPhoto models.RawPhoto
	if err := ctrl.db.First(&rawPhoto, rawPhotoID).Error; err != nil {
		respondJSON(c, http.StatusNotFound, gin.H{"error": "ไม่พบข้อมูลรูปต้นฉบับ"})
		return
	}
	if err := services.VerifyCoachOwnsRawPhoto(ctrl.db, &rawPhoto, userID, role); err != nil {
		respondJSON(c, http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}

	list, err := ctrl.photoPostService.GetDetectedPhotosByRawPhotoID(rawPhotoID)
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

// DeleteMyPost handles DELETE /api/students/posts/:type/:raw_id
//
// นักเรียนลบโพสต์ (รูปหรือวิดีโอ) ที่ตัวเองถูกแท็กออกจากแท็บ Posts ของตัวเอง — เพิ่มเติมจากการ
// ลบอัตโนมัติหลัง 7 วันที่มีอยู่แล้ว (ยังทำงานเหมือนเดิม ไม่เกี่ยวกัน)
//
// ⚠️ ลบแค่แท็กของตัวเอง ไม่ได้ลบรูป/วิดีโอต้นฉบับ — ถ้าเป็นสื่อกลุ่มที่มีนักเรียนคนอื่นถูกแท็กอยู่ด้วย
// คนอื่นยังเห็นโพสต์นี้ตามปกติ (เหมือนการ "ลบตัวเองออกจากแท็ก" ไม่ใช่ "ลบโพสต์ของทุกคน")
func (ctrl *PhotoPostController) DeleteMyPost(c *gin.Context) {
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

	rawID, ok := uintParam(c, "raw_id", "รหัสโพสต์")
	if !ok {
		return
	}

	switch c.Param("type") {
	case "photo":
		err = ctrl.photoPostService.DeleteMyPhotoTag(customerID, rawID)
	case "video":
		err = ctrl.videoService.DeleteMyVideoTag(customerID, rawID)
	default:
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "ประเภทโพสต์ไม่ถูกต้อง"})
		return
	}

	if err != nil {
		if errors.Is(err, services.ErrPostNotFound) {
			respondJSON(c, http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	respondJSON(c, http.StatusOK, gin.H{"message": "ลบโพสต์นี้แล้ว"})
}

// GetMyPosts handles GET /api/students/posts/me
// นักเรียนดูโพสต์ (รูป+วิดีโอ) ทั้งหมดที่ตัวเองถูกแท็กไว้ รวมกันเรียงตามเวลาล่าสุดก่อน
func (ctrl *PhotoPostController) GetMyPosts(c *gin.Context) {
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

	posts, err := ctrl.buildPostItems(customerID)
	if err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	respondJSON(c, http.StatusOK, gin.H{"data": posts})
}

// AdminGetStudentPosts handles GET /api/admin/students/:customer_id/posts
//
// เหมือน GetMyPosts ทุกอย่าง ต่างกันแค่ระบุ customer_id ผ่าน URL แทนการ resolve จาก JWT ของ
// ผู้ล็อกอิน — ให้แอดมินดูรูป/วิดีโอที่นักเรียนคนไหนก็ได้ถูกแท็กไว้ (จัดกลุ่มดูทีละคนแทนที่จะกอง
// ปนกันทั้งหมด — ไม่มีการ copy ไฟล์จริงไปแยกโฟลเดอร์ ยังเก็บที่เดิมบน storage เหมือนเดิม)
func (ctrl *PhotoPostController) AdminGetStudentPosts(c *gin.Context) {
	customerID, ok := uintParam(c, "customer_id", "รหัสนักเรียน")
	if !ok {
		return
	}

	posts, err := ctrl.buildPostItems(customerID)
	if err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	respondJSON(c, http.StatusOK, gin.H{"data": posts})
}

// buildPostItems รวมรูป+วิดีโอที่นักเรียนคนนี้ถูกแท็กไว้เป็นลิสต์เดียว เรียงล่าสุดก่อน — ใช้ร่วมกัน
// ทั้ง GetMyPosts (ของตัวเอง) และ AdminGetStudentPosts (แอดมินดูของคนอื่น) กันตรรกะรวม/เรียงซ้ำสองที่
func (ctrl *PhotoPostController) buildPostItems(customerID uint) ([]dto.PostItem, error) {
	photos, err := ctrl.photoPostService.GetDetectedPhotosByStudentID(customerID)
	if err != nil {
		return nil, err
	}
	videos, err := ctrl.videoService.GetDetectedVideosByStudentID(customerID)
	if err != nil {
		return nil, err
	}

	posts := make([]dto.PostItem, 0, len(photos)+len(videos))
	for _, p := range photos {
		posts = append(posts, dto.PostItem{ID: p.ID, Type: "photo", RawID: p.RawPhotoID, CreatedAt: p.CreatedAt})
	}
	for _, v := range videos {
		posts = append(posts, dto.PostItem{ID: v.ID, Type: "video", RawID: v.RawVideoID, CreatedAt: v.CreatedAt})
	}
	sort.Slice(posts, func(i, j int) bool { return posts[i].CreatedAt.After(posts[j].CreatedAt) })
	return posts, nil
}
