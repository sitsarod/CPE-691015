package controllers

import (
    "errors"
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

// mapEnrollmentError แปลง error จาก service เป็น HTTP status ที่ตรงความหมาย
//
// เดิม EnrollCourse ตอบ 500 กับทุก error รวมถึงกรณีปกติอย่าง "สมัครไปแล้ว"
// ทำให้ระบบมอนิเตอร์มองว่าเซิร์ฟเวอร์พังทั้งที่เป็น flow ที่ออกแบบไว้
func mapEnrollmentError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, services.ErrEnrollmentNotFound),
		errors.Is(err, services.ErrPackageNotFound),
		errors.Is(err, services.ErrCustomerProfileNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})

	case errors.Is(err, services.ErrEnrollmentRejectReason):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})

	case errors.Is(err, services.ErrEnrollmentForbidden):
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})

	// สถานะไม่เอื้อให้ทำตอนนี้ — ยิงซ้ำก็ไม่ช่วย
	case errors.Is(err, services.ErrAlreadyEnrolled),
		errors.Is(err, services.ErrPackageSeatsFull),
		errors.Is(err, services.ErrEnrollmentNotPending),
		errors.Is(err, services.ErrEnrollmentNotCancellable),
		errors.Is(err, services.ErrEnrollmentBillingLocked):
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})

	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
	}
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

	// input.CustomerID คือ users.id (service จะแปลงเป็น customers.id ให้เอง)
	// จึงเทียบกับ JWT ผ่าน CheckIDOR ได้ตรงชนิด
	if !CheckIDOR(c, input.CustomerID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "ไม่มีสิทธิ์ลงทะเบียนให้ผู้อื่น"})
		return
	}

    enrollment, err := ctrl.service.EnrollCourse(input.CustomerID, input.PackageID)
    if err != nil {
        mapEnrollmentError(c, err)
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

// CancelMyEnrollment [PATCH] /api/enrollments/:id/cancel — นักเรียนถอนใบสมัครของตัวเอง
func (ctrl *EnrollmentController) CancelMyEnrollment(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID ต้องเป็นตัวเลขเท่านั้น"})
		return
	}

	userID, _, ok := GetAuthContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งาน"})
		return
	}

	if err := ctrl.service.CancelMyEnrollment(userID, uint(id)); err != nil {
		mapEnrollmentError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "ยกเลิกใบสมัครเรียบร้อยแล้ว"})
}

// RejectEnrollment [PATCH] /api/admin/enrollments/:id/reject — ปฏิเสธคำขอพร้อมเหตุผล (adminOnly)
//
// ตัวตนแอดมินดึงจาก JWT ไม่ใช่ body — ไม่งั้นปลอมได้ว่าใครเป็นคนปฏิเสธ
func (ctrl *EnrollmentController) RejectEnrollment(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID ต้องเป็นตัวเลขเท่านั้น"})
		return
	}

	adminID, _, ok := GetAuthContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งาน (Admin)"})
		return
	}

	var req dto.RejectEnrollmentReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาระบุเหตุผลในการปฏิเสธ (3–500 ตัวอักษร)"})
		return
	}

	if err := ctrl.service.RejectEnrollment(uint(id), adminID, req.Reason); err != nil {
		mapEnrollmentError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "ปฏิเสธคำขอเรียบร้อยแล้ว แจ้งเตือนไปหานักเรียนแล้ว"})
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
        switch {
        case errors.Is(err, services.ErrEnrollmentNotFound):
            c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
        case errors.Is(err, services.ErrEnrollmentNotPending), errors.Is(err, services.ErrPackageSeatsFull):
            c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
        default:
            c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
        }
        return
    }

    c.JSON(http.StatusOK, gin.H{
        "message": "อนุมัติการลงทะเบียนและสร้างบิลเรียบร้อยแล้ว",
        "data": enrollment,
    })
}

// GetCustomerEnrollments
//
// :id ในเส้นทางนี้คือ users.id (service แปลงเป็น customers.id ให้เอง)
func (ctrl *EnrollmentController) GetCustomerEnrollments(c *gin.Context) {
    id, err := strconv.ParseUint(c.Param("id"), 10, 32)
    if err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "ID ต้องเป็นตัวเลขเท่านั้น"})
        return
    }

	if !CheckIDOR(c, uint(id)) {
		c.JSON(http.StatusForbidden, gin.H{"error": "ไม่มีสิทธิ์เข้าถึงข้อมูลของผู้อื่น"})
		return
	}

    enrollments, err := ctrl.service.GetCustomerEnrollments(uint(id))
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "ดึงข้อมูลไม่สำเร็จ"})
        return
    }
    c.JSON(http.StatusOK, gin.H{"data": enrollments})
}

// GetEnrollmentReview ดึงข้อมูลตรวจสอบผู้สมัครแบบละเอียดก่อนอนุมัติ (adminOnly)
//
// [GET] /api/admin/enrollments/:id
func (ctrl *EnrollmentController) GetEnrollmentReview(c *gin.Context) {
    id, err := strconv.ParseUint(c.Param("id"), 10, 32)
    if err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "ID ต้องเป็นตัวเลขเท่านั้น"})
        return
    }

    review, err := ctrl.service.GetEnrollmentReview(uint(id))
    if err != nil {
        if errors.Is(err, services.ErrEnrollmentNotFound) {
            c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
            return
        }
        c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถดึงข้อมูลผู้สมัครได้"})
        return
    }

    c.JSON(http.StatusOK, gin.H{"data": review})
}

// ExtendEnrollment ขยายระยะเวลาเรียนให้นักเรียนรายบุคคล (adminOnly)
//
// [POST] /api/admin/enrollments/:id/extend
//
// ตัวตนของแอดมินดึงจาก JWT ไม่ใช่จาก body — ถ้ารับจาก body จะปลอมได้ว่าใครเป็นคนอนุมัติ
func (ctrl *EnrollmentController) ExtendEnrollment(c *gin.Context) {
    id, err := strconv.ParseUint(c.Param("id"), 10, 32)
    if err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "ID ต้องเป็นตัวเลขเท่านั้น"})
        return
    }

    adminID, _, ok := GetAuthContext(c)
    if !ok {
        c.JSON(http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งาน (Admin)"})
        return
    }

    var req dto.ExtendEnrollmentReq
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{
            "error": "ข้อมูลไม่ถูกต้อง — จำนวนวันไม่เกิน 366 จำนวนครั้งไม่เกิน 100 และต้องระบุเหตุผลอย่างน้อย 3 ตัวอักษร",
        })
        return
    }

    res, err := ctrl.service.ExtendEnrollment(uint(id), adminID, req)
    if err != nil {
        switch {
        case errors.Is(err, services.ErrEnrollmentNotFound):
            c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
        case errors.Is(err, services.ErrExtensionReasonReq):
            c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        case errors.Is(err, services.ErrExtensionNotStarted),
            errors.Is(err, services.ErrExtensionCancelled),
            errors.Is(err, services.ErrExtensionNoSessions),
            errors.Is(err, services.ErrExtensionNotExpired),
            errors.Is(err, services.ErrExtensionAlreadyDone),
            errors.Is(err, services.ErrExtensionGraceOver),
            errors.Is(err, services.ErrPackageSeatsFull):
            c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
        default:
            c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
        }
        return
    }

    c.JSON(http.StatusOK, gin.H{
        "message": "ขยายสิทธิ์เรียนเรียบร้อยแล้ว",
        "data":    res,
    })
}

// GetEnrollmentExtensions ดึงประวัติการขยายเวลาของการลงทะเบียนใบหนึ่ง (adminOnly)
//
// [GET] /api/admin/enrollments/:id/extensions
func (ctrl *EnrollmentController) GetEnrollmentExtensions(c *gin.Context) {
    id, err := strconv.ParseUint(c.Param("id"), 10, 32)
    if err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "ID ต้องเป็นตัวเลขเท่านั้น"})
        return
    }

    items, err := ctrl.service.GetEnrollmentExtensions(uint(id))
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
        return
    }

    c.JSON(http.StatusOK, gin.H{"data": items})
}

// GetAllEnrollments
func (ctrl *EnrollmentController) GetAllEnrollments(c *gin.Context) {
    enrollments, err := ctrl.service.GetAllEnrollments()
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "ดึงข้อมูลไม่สำเร็จ"})
        return
    }
    c.JSON(http.StatusOK, gin.H{"data": dto.ToAdminEnrollmentDTOs(enrollments)})
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
        switch {
        case errors.Is(err, services.ErrEnrollmentNotFound):
            c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
        case errors.Is(err, services.ErrEnrollmentBillingLocked):
            c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
        default:
            c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
        }
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
        switch {
        case errors.Is(err, services.ErrEnrollmentNotFound):
            c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
        case errors.Is(err, services.ErrEnrollmentBillingLocked):
            c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
        default:
            c.JSON(http.StatusInternalServerError, gin.H{"error": "ลบข้อมูลไม่สำเร็จ"})
        }
        return
    }
    c.JSON(http.StatusOK, gin.H{"message": "ยกเลิกการลงทะเบียนสำเร็จ"})
}
