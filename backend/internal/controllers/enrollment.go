package controllers

import (
	"net/http"
	"strconv"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
	"CPE-691015/internal/services"

	"github.com/gin-gonic/gin"
)

type EnrollmentController struct {
	service *services.EnrollmentService
}

func NewEnrollmentController(service *services.EnrollmentService) *EnrollmentController {
	return &EnrollmentController{service: service}
}

// GetAvailableCourses
func (ctrl *EnrollmentController) GetAvailableCourses(c *gin.Context) {
	courses, err := ctrl.service.GetAvailableCourses()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถดึงข้อมูลคอร์สเรียนได้"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": courses})
}

// EnrollCourse
func (ctrl *EnrollmentController) EnrollCourse(c *gin.Context) {
	var input dto.CreateEnrollmentReq

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ครบถ้วน หรือรูปแบบไม่ถูกต้อง"})
		return
	}

	enrollment, err := ctrl.service.EnrollCourse(input.CustomerID, input.PackageID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

c.JSON(http.StatusCreated, dto.CreateEnrollmentRes{
		Message: "ลงทะเบียนสำเร็จ",
		Data: dto.CreateEnrollmentData{
			EnrollmentID: enrollment.ID,
			BillingID:    enrollment.BillingID,
		},
	})
}

// GetCustomerEnrollments
func (ctrl *EnrollmentController) GetCustomerEnrollments(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID ต้องเป็นตัวเลขเท่านั้น"})
		return
	}

	enrollments, err := ctrl.service.GetCustomerEnrollments(uint(id))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ดึงข้อมูลไม่สำเร็จ"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": enrollments})
}

// UpdateEnrollment
func (ctrl *EnrollmentController) UpdateEnrollment(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID ต้องเป็นตัวเลขเท่านั้น"})
		return
	}

	var input dto.UpdateEnrollmentReq
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ถูกต้อง"})
		return
	}

	enrollment, err := ctrl.service.UpdateEnrollment(uint(id), input)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "อัปเดตสำเร็จ", "data": enrollment})
}

// DeleteEnrollment
func (ctrl *EnrollmentController) DeleteEnrollment(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID ต้องเป็นตัวเลขเท่านั้น"})
		return
	}

	if err := ctrl.service.CancelEnrollment(uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ลบข้อมูลไม่สำเร็จ"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "ยกเลิกการลงทะเบียนสำเร็จ"})
}

// SetupSchedule
func (ctrl *EnrollmentController) SetupSchedule(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID ต้องเป็นตัวเลขเท่านั้น"})
		return
	}

	var input []dto.WeeklyScheduleItemReq
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "รูปแบบข้อมูลตารางเรียนไม่ถูกต้อง (เช่น สะกดวันผิด)"})
		return
	}

	var schedules []models.WeeklySchedule
	for _, req := range input {
		schedules = append(schedules, models.WeeklySchedule{
			DayOfWeek: models.DayOfWeek(req.DayOfWeek),
			StartTime: req.StartTime,
			EndTime:   req.EndTime,
		})
	}

	if err := ctrl.service.SetupWeeklySchedule(uint(id), schedules); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"message": "จัดตารางเรียนสำเร็จ"})
}

// UpdateSchedule
func (ctrl *EnrollmentController) UpdateSchedule(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID ต้องเป็นตัวเลขเท่านั้น"})
		return
	}

	var input dto.UpdateSingleScheduleReq

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ถูกต้อง (เช่น สะกดวันผิด)"})
		return
	}

	schedule, err := ctrl.service.UpdateSingleSchedule(uint(id), models.DayOfWeek(input.DayOfWeek), input.StartTime, input.EndTime)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "เปลี่ยนเวลาเรียนสำเร็จ", "data": schedule})
}

// DeleteSchedule
func (ctrl *EnrollmentController) DeleteSchedule(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID ต้องเป็นตัวเลขเท่านั้น"})
		return
	}

	if err := ctrl.service.DeleteSingleSchedule(uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ลบตารางเรียนไม่สำเร็จ"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "ลบตารางเรียนสำเร็จ"})
}