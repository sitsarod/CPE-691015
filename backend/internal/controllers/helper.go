package controllers

import (
	"errors"
	"net/http"

	"CPE-691015/internal/models"
	"CPE-691015/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
)

// respondServiceError แปลง error จากชั้น service เป็น HTTP status ให้ถูกประเภท
//
// เดิม handler ส่วนใหญ่ตอบ 500 กับทุก error ทำให้หน้าบ้านแยกไม่ออกว่า "กรอกผิด/สถานะไม่พร้อม"
// (ผู้ใช้แก้เองได้) กับ "เซิร์ฟเวอร์พัง" (ต้องแจ้งแอดมิน) ตอนนี้:
//   - *services.BusinessError → 409 Conflict (กติกาทางธุรกิจ/สถานะไม่พร้อม)
//   - ErrForbidden            → 403
//   - ErrInvoiceNotFound / ErrBillingNotFound → 404
//   - ที่เหลือ                → 500
func respondServiceError(c *gin.Context, err error) {
	var be *services.BusinessError
	switch {
	case errors.As(err, &be):
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
	case errors.Is(err, services.ErrForbidden):
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
	case errors.Is(err, services.ErrInvoiceNotFound), errors.Is(err, services.ErrBillingNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
	}
}

// fieldLabelTH แปลงชื่อฟิลด์ใน DTO เป็นชื่อภาษาไทยที่ผู้ใช้เข้าใจ
//
// เพิ่มชื่อฟิลด์ใหม่ที่นี่ที่เดียว ใช้ได้กับทุก endpoint ที่เรียก bindErrorMessage
var fieldLabelTH = map[string]string{
	"Role":              "สิทธิ์การใช้งาน",
	"FirstName":         "ชื่อ",
	"LastName":          "นามสกุล",
	"Email":             "อีเมล",
	"Password":          "รหัสผ่าน",
	"Nickname":          "ชื่อเล่น",
	"Gender":            "เพศ",
	"BirthDate":         "วันเกิด",
	"PhoneNumber":       "หมายเลขโทรศัพท์",
	"Phone":             "หมายเลขโทรศัพท์",
	"ParentEmail":       "อีเมลผู้ปกครอง",
	"ParentPhoneNumber": "หมายเลขโทรศัพท์ผู้ปกครอง",
}

// bindErrorMessage สร้างข้อความ error ที่บอกได้ว่าฟิลด์ไหนผิดและผิดยังไง
//
// ถ้าตอบข้อความรวม ๆ ว่า "ข้อมูลไม่ถูกต้อง" ผู้ใช้จะไม่รู้ว่าต้องแก้ตรงไหน
// และเราก็ดีบักยากเวลามีคนแจ้งว่าสมัครไม่ผ่าน
//
// รายงานแค่ฟิลด์แรกที่ผิดพอ เพราะหน้าบ้านแสดง error ทีละข้อความอยู่แล้ว
func bindErrorMessage(err error) string {
	var verrs validator.ValidationErrors
	if !errors.As(err, &verrs) || len(verrs) == 0 {
		// ไม่ใช่ error จาก validator (เช่น JSON เพี้ยน) จึงบอกได้แค่กว้าง ๆ
		return "ข้อมูลที่ส่งมาไม่ถูกต้องหรือขาดฟิลด์จำเป็น"
	}

	e := verrs[0]
	label, ok := fieldLabelTH[e.Field()]
	if !ok {
		label = e.Field()
	}

	switch e.Tag() {
	case "required":
		return "กรุณากรอก: " + label
	case "email":
		return "รูปแบบ" + label + "ไม่ถูกต้อง"
	case "oneof":
		return label + "ต้องเป็นค่าใดค่าหนึ่งใน: " + e.Param()
	case "numeric":
		return label + "ต้องเป็นตัวเลขเท่านั้น"
	case "len":
		return label + "ต้องมี " + e.Param() + " หลัก"
	case "startswith":
		return label + "ต้องขึ้นต้นด้วยเลข " + e.Param()
	case "max":
		return label + "ต้องยาวไม่เกิน " + e.Param() + " ตัวอักษร"
	case "min":
		return label + "ต้องยาวอย่างน้อย " + e.Param() + " ตัวอักษร"
	default:
		return label + "ไม่ถูกต้อง"
	}
}

// GetAuthContext ดึง userID และ role ที่ AuthMiddleware เซ็ตไว้ออกมาอย่างปลอดภัย
//
// ห้าม type-assert ค่าจาก c.Get() ตรง ๆ เพราะ AuthMiddleware เซ็ตค่าจาก JWT claims
// ซึ่งอาจเป็น nil ได้ถ้า token ไม่มี claim "user_id"/"role" (เช่น token เก่า หรือ
// token ที่เซ็นด้วย secret เดียวกันแต่สร้างจากที่อื่น) การ assert ตรง ๆ จะ panic
// กลายเป็นช่องให้ยิง 500 ใส่เซิร์ฟเวอร์ได้
func GetAuthContext(c *gin.Context) (userID uint, role string, ok bool) {
	userIDVal, idExists := c.Get("userID")
	roleVal, roleExists := c.Get("role")
	if !idExists || !roleExists {
		return 0, "", false
	}

	userIDFloat, idOK := userIDVal.(float64) // JWT parses numbers as float64
	roleStr, roleOK := roleVal.(string)
	if !idOK || !roleOK {
		return 0, "", false
	}

	return uint(userIDFloat), roleStr, true
}

// IsAdmin ตรวจว่าผู้ใช้ปัจจุบันเป็นแอดมินหรือไม่
func IsAdmin(c *gin.Context) bool {
	_, role, ok := GetAuthContext(c)
	return ok && role == string(models.AdminRole)
}

func IsCoach(c *gin.Context) bool {
	_, role, ok := GetAuthContext(c)
	return ok && role == string(models.CoachRole)
}

// CheckIDOR verifies if the current user is an admin or if their ID matches the target ID.
//
// หมายเหตุสำคัญ: targetID ต้องเป็น users.id เสมอ เพราะฟังก์ชันนี้เทียบกับ claim
// user_id ใน JWT อย่าส่ง customers.id เข้ามาเด็ดขาด — ตาราง enrollments/photos/
// evaluations/feedbacks/detected_videos ใช้ customers.id ซึ่งเป็นคนละชุดเลข
// การแปลงระหว่างสองค่านี้ให้ทำที่ชั้น service เท่านั้น (ดู EnrollmentService.toCustomerID)
func CheckIDOR(c *gin.Context, targetID uint) bool {
	userID, role, ok := GetAuthContext(c)
	if !ok {
		return false
	}

	if role == string(models.AdminRole) {
		return true // Admin can access everything
	}

	return userID == targetID
}
