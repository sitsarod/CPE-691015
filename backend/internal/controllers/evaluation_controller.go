package controllers

import (
	"errors"
	"net/http"
	"strconv"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
	"CPE-691015/internal/services"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type EvaluationController struct {
	evalService *services.EvaluationService
	db          *gorm.DB
}

func NewEvaluationController(evalService *services.EvaluationService, db *gorm.DB) *EvaluationController {
	return &EvaluationController{
		evalService: evalService,
		db:          db,
	}
}

// CreateEvaluation handles POST /api/evaluations
// โค้ชสร้างการประเมินผู้เรียนและระบุลิงก์วิดีโอ (ถ้ามี)
func (ctrl *EvaluationController) CreateEvaluation(c *gin.Context) {
	userID, role, ok := GetAuthContext(c)
	if !ok || role != "coach" {
		respondJSON(c, http.StatusForbidden, gin.H{"error": "เฉพาะโค้ชเท่านั้นที่สามารถสร้างการประเมินได้"})
		return
	}

	var req dto.CreateEvaluationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "ข้อมูลการประเมินไม่ถูกต้อง กรุณาตรวจสอบคะแนนและรายละเอียด"})
		return
	}

	evaluation, err := ctrl.evalService.CreateEvaluation(userID, req)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrCustomerNotEnrolledWithCoach):
			respondJSON(c, http.StatusForbidden, gin.H{"error": err.Error()})
		default:
			respondJSON(c, http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}

	// แปลงผลลัพธ์ไปเป็น Response DTO
	resp := dto.EvaluationResponse{
		ID:         evaluation.ID,
		CustomerID: evaluation.CustomerID,
		CoachID:    evaluation.CoachID,
		CoachName:  evaluation.Coach.User.FirstName + " " + evaluation.Coach.User.LastName,
		Assessment: evaluation.Assessment,
		VideoURL:   evaluation.VideoURL,
		CreatedAt:  evaluation.CreatedAt,
	}

	respondJSON(c, http.StatusCreated, gin.H{
		"message": "บันทึกการประเมินผู้เรียนสำเร็จแล้ว",
		"data":    resp,
	})
}

// GetMyStudents handles GET /api/evaluations/students
// โค้ชดึงรายชื่อนักเรียนที่ลงทะเบียนเรียนกับตัวเองอยู่จริง สำหรับเลือกไปประเมิน
//
// query ?course_id= (ไม่บังคับ) กรองเฉพาะนักเรียนของคอร์สนั้น — ไม่ใส่ = รวมทุกคอร์สเหมือนเดิม
func (ctrl *EvaluationController) GetMyStudents(c *gin.Context) {
	userID, role, ok := GetAuthContext(c)
	if !ok || role != "coach" {
		respondJSON(c, http.StatusForbidden, gin.H{"error": "เฉพาะโค้ชเท่านั้นที่ดูรายชื่อนักเรียนของตัวเองได้"})
		return
	}

	var courseID *uint
	if raw := c.Query("course_id"); raw != "" {
		id, err := strconv.ParseUint(raw, 10, 32)
		if err != nil {
			respondJSON(c, http.StatusBadRequest, gin.H{"error": "รหัสคอร์สไม่ถูกต้อง"})
			return
		}
		cid := uint(id)
		courseID = &cid
	}

	students, err := ctrl.evalService.GetMyStudents(userID, courseID)
	if err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	responses := make([]dto.EvaluableStudentResponse, 0, len(students))
	for _, s := range students {
		responses = append(responses, dto.EvaluableStudentResponse{
			CustomerID:     s.ID,
			Nickname:       s.Nickname,
			ProfilePicture: s.ProfilePicture,
		})
	}

	respondJSON(c, http.StatusOK, gin.H{"data": responses})
}

// GetAllActiveStudents handles GET /api/evaluations/students/all
//
// รายชื่อนักเรียนที่ลงทะเบียนเรียนอยู่จริงทั้งโรงเรียน ไม่กรองตามโค้ช/คอร์สเลย — ใช้ตอนแท็ก
// นักเรียนในรูป/วิดีโอ (หน้า coach/detect) เพราะคนอัปโหลดอาจไม่ใช่คนสอนคอร์สของคนในรูปนั้นก็ได้
// เปิดให้ทั้งโค้ชและแอดมินเรียกได้ (ต่างจาก GetMyStudents ที่จำกัดแค่โค้ช)
func (ctrl *EvaluationController) GetAllActiveStudents(c *gin.Context) {
	_, role, ok := GetAuthContext(c)
	if !ok || (role != "coach" && role != "admin") {
		respondJSON(c, http.StatusForbidden, gin.H{"error": "เฉพาะโค้ชหรือผู้ดูแลระบบเท่านั้นที่ดูรายชื่อนักเรียนทั้งหมดได้"})
		return
	}

	students, err := ctrl.evalService.GetAllActiveStudents()
	if err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	responses := make([]dto.EvaluableStudentResponse, 0, len(students))
	for _, s := range students {
		responses = append(responses, dto.EvaluableStudentResponse{
			CustomerID:     s.ID,
			Nickname:       s.Nickname,
			ProfilePicture: s.ProfilePicture,
		})
	}

	respondJSON(c, http.StatusOK, gin.H{"data": responses})
}

// GetActiveStudentsMediaSummary handles GET /api/admin/students/media-summary
//
// เหมือน GetAllActiveStudents แต่แนบจำนวนรูป/วิดีโอที่แต่ละคนถูกแท็กไว้มาด้วย — ใช้แสดงเป็นลิสต์
// ในหน้า admin/detect/media ให้แอดมินเห็นว่าใครมีโพสต์รอดูบ้างโดยไม่ต้องกดเข้าไปเช็คทีละคน
// เฉพาะแอดมิน (ต่างจาก GetAllActiveStudents ที่โค้ชก็เรียกได้ เพราะหน้านี้เป็นของแอดมินโดยเฉพาะ)
func (ctrl *EvaluationController) GetActiveStudentsMediaSummary(c *gin.Context) {
	_, role, ok := GetAuthContext(c)
	if !ok || role != "admin" {
		respondJSON(c, http.StatusForbidden, gin.H{"error": "เฉพาะผู้ดูแลระบบเท่านั้นที่ดูสรุปนี้ได้"})
		return
	}

	students, err := ctrl.evalService.GetAllActiveStudents()
	if err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// นับรูป/วิดีโอต่อคนในคำสั่งเดียว (กลุ่มตาม customer_id) แทนวนสั่งทีละคน กัน N+1 query
	type countRow struct {
		CustomerID uint
		Count      int64
	}
	var photoCounts, videoCounts []countRow
	if err := ctrl.db.Model(&models.DetectedPhoto{}).
		Select("customer_id, COUNT(*) AS count").
		Group("customer_id").
		Scan(&photoCounts).Error; err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": "ไม่สามารถนับจำนวนรูปได้"})
		return
	}
	if err := ctrl.db.Model(&models.DetectedVideo{}).
		Select("customer_id, COUNT(*) AS count").
		Group("customer_id").
		Scan(&videoCounts).Error; err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": "ไม่สามารถนับจำนวนวิดีโอได้"})
		return
	}

	photoCountByCustomer := make(map[uint]int64, len(photoCounts))
	for _, r := range photoCounts {
		photoCountByCustomer[r.CustomerID] = r.Count
	}
	videoCountByCustomer := make(map[uint]int64, len(videoCounts))
	for _, r := range videoCounts {
		videoCountByCustomer[r.CustomerID] = r.Count
	}

	responses := make([]dto.StudentMediaSummaryResponse, 0, len(students))
	for _, s := range students {
		responses = append(responses, dto.StudentMediaSummaryResponse{
			CustomerID:     s.ID,
			Nickname:       s.Nickname,
			ProfilePicture: s.ProfilePicture,
			PhotoCount:     photoCountByCustomer[s.ID],
			VideoCount:     videoCountByCustomer[s.ID],
		})
	}

	respondJSON(c, http.StatusOK, gin.H{"data": responses})
}

// GetMyCourses handles GET /api/evaluations/courses
// โค้ชดึงรายชื่อคอร์สที่ตัวเองมีตารางสอนอยู่จริง — ใช้เลือกก่อนดูรายชื่อนักเรียนแยกตามคอร์ส
func (ctrl *EvaluationController) GetMyCourses(c *gin.Context) {
	userID, role, ok := GetAuthContext(c)
	if !ok || role != "coach" {
		respondJSON(c, http.StatusForbidden, gin.H{"error": "เฉพาะโค้ชเท่านั้นที่ดูรายชื่อคอร์สของตัวเองได้"})
		return
	}

	courses, err := ctrl.evalService.GetMyCourses(userID)
	if err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	responses := make([]dto.EvaluableCourseResponse, 0, len(courses))
	for _, course := range courses {
		responses = append(responses, dto.EvaluableCourseResponse{
			CourseID:   course.ID,
			CourseName: course.CourseName,
		})
	}

	respondJSON(c, http.StatusOK, gin.H{"data": responses})
}

// GetMyGivenEvaluations handles GET /api/evaluations/me/given
// โค้ชดูประวัติการประเมินทั้งหมดที่ตัวเองเคยให้ไว้ (ทุกนักเรียน)
func (ctrl *EvaluationController) GetMyGivenEvaluations(c *gin.Context) {
	userID, role, ok := GetAuthContext(c)
	if !ok || role != "coach" {
		respondJSON(c, http.StatusForbidden, gin.H{"error": "เฉพาะโค้ชเท่านั้นที่ดูข้อมูลนี้ได้"})
		return
	}

	evaluations, err := ctrl.evalService.GetEvaluationsByCoachUserID(userID)
	if err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var responses []dto.EvaluationResponse
	for _, ev := range evaluations {
		responses = append(responses, dto.EvaluationResponse{
			ID:         ev.ID,
			CustomerID: ev.CustomerID,
			CoachID:    ev.CoachID,
			Assessment: ev.Assessment,
			VideoURL:   ev.VideoURL,
			CreatedAt:  ev.CreatedAt,
		})
	}

	respondJSON(c, http.StatusOK, gin.H{"data": responses})
}

// GetMyEvaluations handles GET /api/evaluations/me
// นักเรียนที่ล็อกอินอยู่ดูประวัติการประเมินของตัวเองอย่างปลอดภัย (กัน IDOR)
func (ctrl *EvaluationController) GetMyEvaluations(c *gin.Context) {
	userID, _, ok := GetAuthContext(c)
	if !ok {
		respondJSON(c, http.StatusUnauthorized, gin.H{"error": "กรุณาเข้าสู่ระบบ"})
		return
	}

	// แปลง userID -> customerID
	customerID, err := services.ResolveCustomerID(ctrl.db, userID)
	if err != nil {
		respondJSON(c, http.StatusNotFound, gin.H{"error": "ไม่พบประวัตินักเรียนของผู้ใช้งานนี้"})
		return
	}

	evaluations, err := ctrl.evalService.GetEvaluationsByStudentID(customerID)
	if err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var responses []dto.EvaluationResponse
	for _, ev := range evaluations {
		responses = append(responses, dto.EvaluationResponse{
			ID:         ev.ID,
			CustomerID: ev.CustomerID,
			CoachID:    ev.CoachID,
			CoachName:  ev.Coach.User.FirstName + " " + ev.Coach.User.LastName,
			Assessment: ev.Assessment,
			VideoURL:   ev.VideoURL,
			CreatedAt:  ev.CreatedAt,
		})
	}

	respondJSON(c, http.StatusOK, gin.H{"data": responses})
}

// GetStudentEvaluations handles GET /api/evaluations/student/:customer_id
// โค้ช (เฉพาะนักเรียนที่ลงทะเบียนเรียนกับตัวเอง) หรือเจ้าตัวนักเรียน ดูประวัติการประเมิน
// แอดมินไม่มีสิทธิ์เข้าถึง endpoint นี้
func (ctrl *EvaluationController) GetStudentEvaluations(c *gin.Context) {
	customerIDParam, err := strconv.ParseUint(c.Param("customer_id"), 10, 32)
	if err != nil {
		respondJSON(c, http.StatusBadRequest, gin.H{"error": "รหัสนักเรียนไม่ถูกต้อง"})
		return
	}
	customerID := uint(customerIDParam)

	userID, role, ok := GetAuthContext(c)
	if !ok {
		respondJSON(c, http.StatusUnauthorized, gin.H{"error": "กรุณาเข้าสู่ระบบ"})
		return
	}

	// เช็คสิทธิ์ (IDOR check) — แอดมินดูข้อมูลการประเมินไม่ได้เลยตามนโยบายของระบบนี้
	// โค้ชดูได้เฉพาะนักเรียนที่ลงทะเบียนเรียนกับตัวเองจริง ส่วนนักเรียนดูได้เฉพาะของตัวเอง
	switch role {
	case "admin":
		respondJSON(c, http.StatusForbidden, gin.H{"error": "ผู้ดูแลระบบไม่มีสิทธิ์ดูข้อมูลการประเมินของนักเรียน"})
		return
	case "coach":
		if err := ctrl.evalService.VerifyCoachCanAccessStudent(userID, customerID); err != nil {
			respondJSON(c, http.StatusForbidden, gin.H{"error": "ไม่มีสิทธิ์เข้าถึงข้อมูลการประเมินของนักเรียนคนนี้"})
			return
		}
	default:
		myCustomerID, err := services.ResolveCustomerID(ctrl.db, userID)
		if err != nil || myCustomerID != customerID {
			respondJSON(c, http.StatusForbidden, gin.H{"error": "ไม่มีสิทธิ์เข้าถึงข้อมูลการประเมินนี้"})
			return
		}
	}

	evaluations, err := ctrl.evalService.GetEvaluationsByStudentID(customerID)
	if err != nil {
		respondJSON(c, http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var responses []dto.EvaluationResponse
	for _, ev := range evaluations {
		responses = append(responses, dto.EvaluationResponse{
			ID:         ev.ID,
			CustomerID: ev.CustomerID,
			CoachID:    ev.CoachID,
			CoachName:  ev.Coach.User.FirstName + " " + ev.Coach.User.LastName,
			Assessment: ev.Assessment,
			VideoURL:   ev.VideoURL,
			CreatedAt:  ev.CreatedAt,
		})
	}

	respondJSON(c, http.StatusOK, gin.H{"data": responses})
}
