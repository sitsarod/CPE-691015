package controllers

import (
	"net/http"
	"errors"
	"strconv"

	"CPE-691015/internal/models"
	"CPE-691015/internal/dto"
	"CPE-691015/internal/services"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// UserController handles user-related HTTP requests
type UserController struct {
	userService *services.UserService
}

// NewUserController creates a new instance of UserController
func NewUserController(userService *services.UserService) *UserController {
	return &UserController{userService: userService}
}

//GetAllUsersController
func (ctrl *UserController) GetUserByRoleController(c *gin.Context) {
	role := c.Query("role")
	users, err := ctrl.userService.GetUserByRole(models.UserRole(role))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถดึงข้อมูลผู้ใช้ได้"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": users})
}

//CreateUser handles the creation of a new user
func (ctrl *UserController) CreateUserController(c *gin.Context) {
	var user models.User
	if err := c.ShouldBindJSON(&user); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลที่ส่งมาไม่ครบถ้วน"})
		return
	}
	if err := ctrl.userService.CreateUser(&user); err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "ไม่สามารถสร้างผู้ใช้ได้"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"message": "สร้างผู้ใช้สำเร็จ", "data": user})
}

// UpdateUserController handles the update of an existing user
func (c *UserController) UpdateUserController(ctx *gin.Context) {
	idParam := ctx.Param("id")
	id, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "ID ผู้ใช้งานไม่ถูกต้อง ต้องเป็นตัวเลขเท่านั้น"})
		return
	}

	if !CheckIDOR(ctx, uint(id)) {
		ctx.JSON(http.StatusForbidden, gin.H{"error": "ไม่มีสิทธิ์เข้าถึงข้อมูลของผู้อื่น"})
		return
	}

	var input dto.UpdateProfileInput
	if err := ctx.ShouldBindJSON(&input); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลที่ส่งมาไม่ถูกต้อง"})
		return
	}

	updatedUser, err := c.userService.UpdateUser(uint(id), input)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			ctx.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบผู้ใช้งาน"})
		} else {
			ctx.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถอัปเดตผู้ใช้งานได้"})
		}
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"message": "อัปเดตข้อมูลสำเร็จแล้ว","data": updatedUser})
}
 
// DeleteUserController handles the deletion of a user
func (c *UserController) DeleteUserController(ctx *gin.Context) {
	idParam := ctx.Param("id")
	id, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "ID ผู้ใช้งานไม่ถูกต้อง ต้องเป็นตัวเลขเท่านั้น"})
		return
	}
	if err := c.userService.DeleteUser(uint(id)); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			ctx.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบผู้ใช้งาน"})
		} else {
			ctx.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถลบผู้ใช้งานได้"})
		}
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"message": "ลบผู้ใช้งานสำเร็จแล้ว"})
}

func (ctrl *UserController) GetUserProfileController(c *gin.Context) {
    idParam := c.Param("id")
    userID, err := strconv.ParseUint(idParam, 10, 32)
    if err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "รูปแบบรหัสผู้ใช้งานไม่ถูกต้อง"})
        return
    }

	if !CheckIDOR(c, uint(userID)) {
		c.JSON(http.StatusForbidden, gin.H{"error": "ไม่มีสิทธิ์เข้าถึงข้อมูลของผู้อื่น"})
		return
	}
    
    user, err := ctrl.userService.GetUserProfile(uint(userID))
    if err != nil {
        if errors.Is(err, gorm.ErrRecordNotFound) {
            c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบผู้ใช้งาน"})
            return 
        }

        c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถดึงข้อมูลผู้ใช้งานได้"})
        return
    }
    
 
    isStudent, _ := ctrl.userService.IsActiveStudent(user.ID)


    response := dto.UserProfileResponseDTO{
        ID:        user.ID,
        Email:     user.Email,
        FirstName: user.FirstName,
        LastName:  user.LastName,
        Role:      string(user.Role),
        IsStudent: isStudent,
    }

    // ข้อมูลผู้เรียนอยู่ในตาราง customers (GetUserProfile preload มาให้แล้ว)
    if user.Customer != nil {
        response.Nickname = user.Customer.Nickname
        response.PhoneNumber = user.Customer.PhoneNumber
        response.Gender = string(user.Customer.Gender)
        response.ParentEmail = user.Customer.ParentEmail
        response.ParentPhoneNumber = user.Customer.ParentPhoneNumber
        response.Status = string(user.Customer.Status)

        if !user.Customer.BirthDate.IsZero() {
            birthDate := user.Customer.BirthDate
            response.BirthDate = &birthDate
        }
    }

    c.JSON(http.StatusOK, gin.H{"data": response})
}

func (ctrl *UserController) GetAllUsersController(c *gin.Context) {
	users, err := ctrl.userService.GetAllUsers()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถดึงข้อมูลผู้ใช้ได้"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": users})
}

// GetActiveStudentsController ดึงรายชื่อผู้ใช้งานที่เป็นนักเรียนทั้งหมดส่งให้หน้าบ้าน
func (ctrl *UserController) GetActiveStudentsController(c *gin.Context) {

	studentUsers, err := ctrl.userService.GetActiveStudents()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถดึงข้อมูลนักเรียนได้"})
		return
	}

	var response []dto.StudentListResponseDTO
	for _, u := range studentUsers {
		nickname := ""
		phone := ""

		if u.Customer != nil {
			nickname = u.Customer.Nickname
			phone = u.Customer.PhoneNumber
		}

		response = append(response, dto.StudentListResponseDTO{
			ID:          u.ID,
			FirstName:   u.FirstName,
			LastName:    u.LastName,
			Email:       u.Email,
			Nickname:    nickname,
			PhoneNumber: phone,
		})
	}

	c.JSON(http.StatusOK, gin.H{"data": response})
}

func (h *UserController) FindAccount(c *gin.Context) {
	var input struct {
		Identifier string `json:"identifier" binding:"required"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาระบุอีเมลหรือหมายเลขโทรศัพท์"})
		return
	}

	// ค้นหา User จาก DB
	user, err := h.userService.FindAccountByIdentifier(input.Identifier)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": err.Error()})
		return
	}

	// แกะข้อมูล Nickname และ PhoneNumber ออกมาจาก Customer Struct (ถ้ามี)
	nickname := ""
	phoneNumber := ""
	if user.Customer != nil {
		nickname = user.Customer.Nickname
		phoneNumber = user.Customer.PhoneNumber
	}

	// ส่งกลับไปให้ React/Next.js นำไปแสดงผล
	c.JSON(http.StatusOK, gin.H{
		"status": "success",
		"user": gin.H{
			"id":          user.ID,
			"firstName":   user.FirstName,
			"lastName":    user.LastName,
			"nickname":    nickname,
			"email":       user.Email,
			"phoneNumber": phoneNumber,
			"role":        user.Role,
		},
	})
}