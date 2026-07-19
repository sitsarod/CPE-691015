package controllers

import (
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

// [GET] /api/quiz
func (c *QuizController) GetActiveQuestions(ctx *gin.Context) {
	questions, err := c.quizService.GetActiveQuestions()
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"data": questions})
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
	id, _ := strconv.Atoi(ctx.Param("id"))
	var req dto.UpdateQuizQuestionReq
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ถูกต้อง"})
		return
	}

	question, err := c.quizService.UpdateQuestion(uint(id), req)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"message": "อัปเดตคำถามสำเร็จ", "data": question})
}

// [DELETE] /api/admin/quiz/:id
func (c *QuizController) DeleteQuestion(ctx *gin.Context) {
	id, _ := strconv.Atoi(ctx.Param("id"))
	err := c.quizService.DeleteQuestion(uint(id))
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"message": "ลบคำถามสำเร็จ"})
}

// [POST] /api/admin/quiz/:id/options
func (c *QuizController) AddOption(ctx *gin.Context) {
	questionID, _ := strconv.Atoi(ctx.Param("id"))
	var req dto.CreateQuizOptionReq
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ถูกต้อง"})
		return
	}

	option, err := c.quizService.AddOption(uint(questionID), req)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	ctx.JSON(http.StatusCreated, gin.H{"message": "เพิ่มตัวเลือกสำเร็จ", "data": option})
}

// [DELETE] /api/admin/quiz/options/:option_id
func (c *QuizController) DeleteOption(ctx *gin.Context) {
	optionID, _ := strconv.Atoi(ctx.Param("option_id"))
	err := c.quizService.DeleteOption(uint(optionID))
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"message": "ลบตัวเลือกสำเร็จ"})
}
