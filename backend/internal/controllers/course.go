package controllers

import (
	"errors"
	"net/http"
	"strconv"

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

func (ctrl *CourseController) GetAllCourse(c *gin.Context) {
	response, err := ctrl.courseService.GetAllCourses()
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

	response, err := ctrl.courseService.GetCourseByID(uint(courseID))
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
	var courseInput models.Course

	if err := c.ShouldBindJSON(&courseInput); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลที่ส่งมาไม่ถูกต้อง หรือไม่ครบถ้วน"})
		return
	}

	if err := ctrl.courseService.CreateCourse(&courseInput); err != nil {
		// เช็ก Business Error ที่ส่งมาจากชั้น Service
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		return
	}

	// 🌟 ดึงข้อมูลตัวเต็มหลังจากสร้างเสร็จผ่าน GetCourseByID เพื่อให้ได้ DTO รูปแบบเดียวกับ Get อื่นๆ
	newCourseDTO, err := ctrl.courseService.GetCourseByID(courseInput.ID)
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
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบข้อมูลคอร์สเรียน"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถอัปเดตข้อมูลได้"})
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
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบข้อมูลคอร์สเรียนที่ต้องการลบ"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถลบข้อมูลคอร์สเรียนได้"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "ลบข้อมูลคอร์สเรียนสำเร็จแล้ว"})
}