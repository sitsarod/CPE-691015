package controllers

import (
	"CPE-691015/internal/models"
	"github.com/gin-gonic/gin"
)

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
