package controllers

import (
    "net/http"
    "strconv"

    "CPE-691015/internal/dto"
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
        Message: "ลงทะเบียนสำเร็จ กำลังรอแอดมินตรวจสอบ",
        Data: dto.CreateEnrollmentData{
            EnrollmentID: enrollment.ID,
            BillingID:    enrollment.BillingID,
        },
    })
}

// ApproveEnrollment
func (ctrl *EnrollmentController) ApproveEnrollment(c *gin.Context) {
    id, err := strconv.ParseUint(c.Param("id"), 10, 32)
    if err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "ID ต้องเป็นตัวเลขเท่านั้น"})
        return
    }

    // ในการ Approve จำเป็นต้องใช้ ID ของแอดมิน
    // สมมติว่า AuthMiddleware เซ็ต `userID` ไว้ใน context
    adminIDVal, exists := c.Get("userID")
    if !exists {
        c.JSON(http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งาน (Admin)"})
        return
    }
    adminIDFloat, ok := adminIDVal.(float64)
    if !ok {
        c.JSON(http.StatusUnauthorized, gin.H{"error": "ข้อมูลผู้ใช้งาน (Admin) ไม่ถูกต้อง"})
        return
    }
    adminID := uint(adminIDFloat)

    enrollment, err := ctrl.service.ApproveEnrollment(uint(id), adminID)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
        return
    }

    c.JSON(http.StatusOK, gin.H{
        "message": "อนุมัติการลงทะเบียนและสร้างบิลเรียบร้อยแล้ว", 
        "data": enrollment,
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

// GetAllEnrollments
func (ctrl *EnrollmentController) GetAllEnrollments(c *gin.Context) {
    enrollments, err := ctrl.service.GetAllEnrollments()
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
