package controllers

import (
	"errors"
	"net/http"
	"strconv"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/services"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type EvaluationController struct {
	evalService    *services.EvaluationService
	db             *gorm.DB
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
		c.JSON(http.StatusForbidden, gin.H{"error": "เฉพาะโค้ชเท่านั้นที่สามารถสร้างการประเมินได้"})
		return
	}

	var req dto.CreateEvaluationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลการประเมินไม่ถูกต้อง กรุณาตรวจสอบคะแนนและรายละเอียด"})
		return
	}

	evaluation, err := ctrl.evalService.CreateEvaluation(userID, req)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrCustomerNotEnrolledWithCoach):
			c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
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
		Score:      evaluation.Score,
		VideoURL:   evaluation.VideoURL,
		CreatedAt:  evaluation.CreatedAt,
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "บันทึกการประเมินผู้เรียนสำเร็จแล้ว",
		"data":    resp,
	})
}

// GetMyStudents handles GET /api/evaluations/students
// โค้ชดึงรายชื่อนักเรียนที่ลงทะเบียนเรียนกับตัวเองอยู่จริง สำหรับเลือกไปประเมิน
func (ctrl *EvaluationController) GetMyStudents(c *gin.Context) {
	userID, role, ok := GetAuthContext(c)
	if !ok || role != "coach" {
		c.JSON(http.StatusForbidden, gin.H{"error": "เฉพาะโค้ชเท่านั้นที่ดูรายชื่อนักเรียนของตัวเองได้"})
		return
	}

	students, err := ctrl.evalService.GetMyStudents(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
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

	c.JSON(http.StatusOK, gin.H{"data": responses})
}

// GetMyGivenEvaluations handles GET /api/evaluations/me/given
// โค้ชดูประวัติการประเมินทั้งหมดที่ตัวเองเคยให้ไว้ (ทุกนักเรียน)
func (ctrl *EvaluationController) GetMyGivenEvaluations(c *gin.Context) {
	userID, role, ok := GetAuthContext(c)
	if !ok || role != "coach" {
		c.JSON(http.StatusForbidden, gin.H{"error": "เฉพาะโค้ชเท่านั้นที่ดูข้อมูลนี้ได้"})
		return
	}

	evaluations, err := ctrl.evalService.GetEvaluationsByCoachUserID(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var responses []dto.EvaluationResponse
	for _, ev := range evaluations {
		responses = append(responses, dto.EvaluationResponse{
			ID:         ev.ID,
			CustomerID: ev.CustomerID,
			CoachID:    ev.CoachID,
			Assessment: ev.Assessment,
			Score:      ev.Score,
			VideoURL:   ev.VideoURL,
			CreatedAt:  ev.CreatedAt,
		})
	}

	c.JSON(http.StatusOK, gin.H{"data": responses})
}

// GetMyEvaluations handles GET /api/evaluations/me
// นักเรียนที่ล็อกอินอยู่ดูประวัติการประเมินของตัวเองอย่างปลอดภัย (กัน IDOR)
func (ctrl *EvaluationController) GetMyEvaluations(c *gin.Context) {
	userID, _, ok := GetAuthContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "กรุณาเข้าสู่ระบบ"})
		return
	}

	// แปลง userID -> customerID
	customerID, err := services.ResolveCustomerID(ctrl.db, userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบประวัตินักเรียนของผู้ใช้งานนี้"})
		return
	}

	evaluations, err := ctrl.evalService.GetEvaluationsByStudentID(customerID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
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
			Score:      ev.Score,
			VideoURL:   ev.VideoURL,
			CreatedAt:  ev.CreatedAt,
		})
	}

	c.JSON(http.StatusOK, gin.H{"data": responses})
}

// GetStudentEvaluations handles GET /api/evaluations/student/:customer_id
// โค้ช (เฉพาะนักเรียนที่ลงทะเบียนเรียนกับตัวเอง) หรือเจ้าตัวนักเรียน ดูประวัติการประเมิน
// แอดมินไม่มีสิทธิ์เข้าถึง endpoint นี้
func (ctrl *EvaluationController) GetStudentEvaluations(c *gin.Context) {
	customerIDParam, err := strconv.ParseUint(c.Param("customer_id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "รหัสนักเรียนไม่ถูกต้อง"})
		return
	}
	customerID := uint(customerIDParam)

	userID, role, ok := GetAuthContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "กรุณาเข้าสู่ระบบ"})
		return
	}

	// เช็คสิทธิ์ (IDOR check) — แอดมินดูข้อมูลการประเมินไม่ได้เลยตามนโยบายของระบบนี้
	// โค้ชดูได้เฉพาะนักเรียนที่ลงทะเบียนเรียนกับตัวเองจริง ส่วนนักเรียนดูได้เฉพาะของตัวเอง
	switch role {
	case "admin":
		c.JSON(http.StatusForbidden, gin.H{"error": "ผู้ดูแลระบบไม่มีสิทธิ์ดูข้อมูลการประเมินของนักเรียน"})
		return
	case "coach":
		if err := ctrl.evalService.VerifyCoachCanAccessStudent(userID, customerID); err != nil {
			c.JSON(http.StatusForbidden, gin.H{"error": "ไม่มีสิทธิ์เข้าถึงข้อมูลการประเมินของนักเรียนคนนี้"})
			return
		}
	default:
		myCustomerID, err := services.ResolveCustomerID(ctrl.db, userID)
		if err != nil || myCustomerID != customerID {
			c.JSON(http.StatusForbidden, gin.H{"error": "ไม่มีสิทธิ์เข้าถึงข้อมูลการประเมินนี้"})
			return
		}
	}

	evaluations, err := ctrl.evalService.GetEvaluationsByStudentID(customerID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
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
			Score:      ev.Score,
			VideoURL:   ev.VideoURL,
			CreatedAt:  ev.CreatedAt,
		})
	}

	c.JSON(http.StatusOK, gin.H{"data": responses})
}
