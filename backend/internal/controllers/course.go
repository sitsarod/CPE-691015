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

type CourseController struct {
	courseService *services.CourseService
}

func NewCourseController(courseService *services.CourseService) *CourseController {
	return &CourseController{courseService: courseService}
}

// GetAllCourse (public) — คืนเฉพาะคอร์ส active
func (ctrl *CourseController) GetAllCourse(c *gin.Context) {
	response, err := ctrl.courseService.GetAllCourses(true)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถดึงข้อมูลคอร์สเรียนได้"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": response})
}

// GetAllCourseAdmin (adminOnly) — คืนคอร์สทุกสถานะรวม draft/inactive สำหรับหน้าจัดการ
func (ctrl *CourseController) GetAllCourseAdmin(c *gin.Context) {
	response, err := ctrl.courseService.GetAllCourses(false)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถดึงข้อมูลคอร์สเรียนได้"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": response})
}

func (ctrl *CourseController) GetCourseByID(c *gin.Context) {
	idParam := c.Param("id")
	courseID, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "รูปแบบรหัสคอร์สเรียนไม่ถูกต้อง"})
		return
	}

	// public → เห็นเฉพาะ active (draft/inactive จะได้ 404 เหมือนไม่มีคอร์ส)
	response, err := ctrl.courseService.GetCourseByID(uint(courseID), true)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบข้อมูลคอร์สเรียนนี้ในระบบ"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถดึงข้อมูลคอร์สเรียนได้"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": response})
}

// GetCourseByIDAdmin (adminOnly) — เห็นคอร์สทุกสถานะ สำหรับหน้าแก้ไขคอร์ส
func (ctrl *CourseController) GetCourseByIDAdmin(c *gin.Context) {
	idParam := c.Param("id")
	courseID, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "รูปแบบรหัสคอร์สเรียนไม่ถูกต้อง"})
		return
	}

	response, err := ctrl.courseService.GetCourseByID(uint(courseID), false)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบข้อมูลคอร์สเรียนนี้ในระบบ"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถดึงข้อมูลคอร์สเรียนได้"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": response})
}

// CreateCourse - ปรับปรุงให้หลังจากบันทึกแล้ว จะดึง DTO ตัวเต็มมาแสดงผลแทน
func (ctrl *CourseController) CreateCourse(c *gin.Context) {
	var req dto.CreateCourseReq

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลที่ส่งมาไม่ถูกต้อง หรือไม่ครบถ้วน"})
		return
	}

	// (C2) เจ้าของคอร์ส = users.id ของแอดมินที่ล็อกอิน (จาก JWT) ไม่รับจาก client
	userID, _, ok := GetAuthContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งานที่ยืนยันตัวตนแล้ว"})
		return
	}

	// สถานะเริ่มต้นเป็น draft ถ้าไม่ได้ระบุมา (ค่าที่รับได้ถูก validate ด้วย binding oneof แล้ว)
	status := models.CourseStatus(req.Status)
	if status == "" {
		status = models.CourseStatusDraft
	}

	courseInput := models.Course{
		CourseName:  req.CourseName,
		Description: req.Description,
		Status:      status,
		UserID:      userID,
	}

	if err := ctrl.courseService.CreateCourse(&courseInput); err != nil {
		// เช็ก Business Error ที่ส่งมาจากชั้น Service
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		return
	}

	// 🌟 ดึงข้อมูลตัวเต็มหลังจากสร้างเสร็จผ่าน GetCourseByID เพื่อให้ได้ DTO รูปแบบเดียวกับ Get อื่นๆ
	// คอร์สที่เพิ่งสร้างอาจเป็น draft → onlyActive = false เพื่อให้ดึงกลับมาได้เสมอ
	newCourseDTO, err := ctrl.courseService.GetCourseByID(courseInput.ID, false)
	if err != nil {
		c.JSON(http.StatusCreated, gin.H{"message": "สร้างคอร์สเรียนสำเร็จแล้ว", "data": courseInput})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "สร้างคอร์สเรียนสำเร็จแล้ว", "data": newCourseDTO})
}

func (ctrl *CourseController) UpdateCourse(c *gin.Context) {
	idParam := c.Param("id")
	courseID, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID คอร์สเรียนไม่ถูกต้อง"})
		return
	}

	var input models.Course
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลที่ส่งมาไม่ถูกต้อง"})
		return
	}

	updatedCourse, err := ctrl.courseService.UpdateCourse(uint(courseID), input)
	if err != nil {
		switch {
		case errors.Is(err, gorm.ErrRecordNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบข้อมูลคอร์สเรียน"})
		case errors.Is(err, services.ErrInvalidCourseStatus): // (C4)
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถอัปเดตข้อมูลได้"})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "อัปเดตข้อมูลคอร์สเรียนสำเร็จแล้ว", "data": updatedCourse})
}

func (ctrl *CourseController) DeleteCourse(c *gin.Context) {
	idParam := c.Param("id")
	courseID, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID คอร์สเรียนไม่ถูกต้อง"})
		return
	}

	if err := ctrl.courseService.DeleteCourse(uint(courseID)); err != nil {
		switch {
		case errors.Is(err, gorm.ErrRecordNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบข้อมูลคอร์สเรียนที่ต้องการลบ"})
		case errors.Is(err, services.ErrCourseHasActiveEnrollments):
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถลบข้อมูลคอร์สเรียนได้"})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "ลบข้อมูลคอร์สเรียนสำเร็จแล้ว"})
}