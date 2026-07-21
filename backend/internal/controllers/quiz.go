package controllers

import (
	"errors"
	"net/http"
	"strconv"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/services"

	"github.com/gin-gonic/gin"
)

type QuizController struct {
	quizService *services.QuizService
}

func NewQuizController(quizService *services.QuizService) *QuizController {
	return &QuizController{quizService: quizService}
}

// parseUintParam (Q-F) อ่าน path param เป็น uint (> 0) — ถ้าไม่ถูกต้องตอบ 400 แล้วคืน false
func parseUintParam(ctx *gin.Context, name string) (uint, bool) {
	v, err := strconv.Atoi(ctx.Param(name))
	if err != nil || v <= 0 {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "ID ต้องเป็นตัวเลขที่ถูกต้อง"})
		return 0, false
	}
	return uint(v), true
}

// [GET] /api/quiz
func (c *QuizController) GetActiveQuestions(ctx *gin.Context) {
	questions, err := c.quizService.GetActiveQuestions()
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"data": questions})
}

// [POST] /api/quiz/recommend — คัดกรอง: ส่ง option ที่เลือก → คืนคอร์สจัดอันดับ (public)
func (c *QuizController) Recommend(ctx *gin.Context) {
	var req dto.QuizRecommendReq
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ถูกต้อง"})
		return
	}

	results, fallback, err := c.quizService.Recommend(req.OptionIDs)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถประมวลผลการคัดกรองได้"})
		return
	}

	ctx.JSON(http.StatusOK, dto.QuizRecommendResponse{Data: results, Fallback: fallback})
}

// [GET] /api/admin/quiz
func (c *QuizController) GetAllQuestions(ctx *gin.Context) {
	questions, err := c.quizService.GetAllQuestions()
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"data": questions})
}

// [POST] /api/admin/quiz
func (c *QuizController) CreateQuestion(ctx *gin.Context) {
	var req dto.CreateQuizQuestionReq
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ถูกต้อง"})
		return
	}

	question, err := c.quizService.CreateQuestion(req)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	ctx.JSON(http.StatusCreated, gin.H{"message": "สร้างคำถามสำเร็จ", "data": question})
}

// [PUT] /api/admin/quiz/:id
func (c *QuizController) UpdateQuestion(ctx *gin.Context) {
	id, ok := parseUintParam(ctx, "id")
	if !ok {
		return
	}
	var req dto.UpdateQuizQuestionReq
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ถูกต้อง"})
		return
	}

	question, err := c.quizService.UpdateQuestion(id, req)
	if err != nil {
		if errors.Is(err, services.ErrQuizQuestionNotFound) {
			ctx.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"message": "อัปเดตคำถามสำเร็จ", "data": question})
}

// [DELETE] /api/admin/quiz/:id
func (c *QuizController) DeleteQuestion(ctx *gin.Context) {
	id, ok := parseUintParam(ctx, "id")
	if !ok {
		return
	}
	if err := c.quizService.DeleteQuestion(id); err != nil {
		if errors.Is(err, services.ErrQuizQuestionNotFound) {
			ctx.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"message": "ลบคำถามสำเร็จ"})
}

// [POST] /api/admin/quiz/:id/options
func (c *QuizController) AddOption(ctx *gin.Context) {
	questionID, ok := parseUintParam(ctx, "id")
	if !ok {
		return
	}
	var req dto.CreateQuizOptionReq
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ถูกต้อง"})
		return
	}

	option, err := c.quizService.AddOption(questionID, req)
	if err != nil {
		if errors.Is(err, services.ErrQuizQuestionNotFound) {
			ctx.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	ctx.JSON(http.StatusCreated, gin.H{"message": "เพิ่มตัวเลือกสำเร็จ", "data": option})
}

// [POST] /api/admin/quiz/options/:option_id/courses — แมปคอร์สที่แนะนำ + น้ำหนัก ให้ตัวเลือก
func (c *QuizController) AddOptionCourse(ctx *gin.Context) {
	optionID, ok := parseUintParam(ctx, "option_id")
	if !ok {
		return
	}
	var req dto.AddOptionCourseReq
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ถูกต้อง"})
		return
	}

	row, err := c.quizService.AddOptionCourse(optionID, req)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrQuizOptionNotFound):
			ctx.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		case errors.Is(err, services.ErrQuizCourseNotActive):
			ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		default:
			ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}
	ctx.JSON(http.StatusCreated, gin.H{"message": "เพิ่มคอร์สที่แนะนำสำเร็จ", "data": row})
}

// [DELETE] /api/admin/quiz/option-courses/:id — ลบการแมปคอร์สออกจากตัวเลือก
func (c *QuizController) DeleteOptionCourse(ctx *gin.Context) {
	id, ok := parseUintParam(ctx, "id")
	if !ok {
		return
	}
	if err := c.quizService.DeleteOptionCourse(id); err != nil {
		if errors.Is(err, services.ErrQuizOptionCourseNotFound) {
			ctx.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"message": "ลบคอร์สที่แนะนำสำเร็จ"})
}

// [DELETE] /api/admin/quiz/options/:option_id
func (c *QuizController) DeleteOption(ctx *gin.Context) {
	optionID, ok := parseUintParam(ctx, "option_id")
	if !ok {
		return
	}
	if err := c.quizService.DeleteOption(optionID); err != nil {
		if errors.Is(err, services.ErrQuizOptionNotFound) {
			ctx.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"message": "ลบตัวเลือกสำเร็จ"})
}
