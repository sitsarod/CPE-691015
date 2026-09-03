package controllers

import (
	"net/http"
	"errors"
	"strconv"
	"strings"

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

// toUserProfileResponse แปลง models.User เป็น DTO สำหรับส่งออกทาง API
//
// ⚠️ ห้ามส่ง models.User ออกทาง API ตรง ๆ เด็ดขาด เพราะฟิลด์ Password
// (bcrypt hash) จะติดไปกับ JSON ด้วย ทุก endpoint ที่คืนข้อมูลผู้ใช้
// ต้องผ่านฟังก์ชันนี้หรือ DTO ตัวอื่นเสมอ
func toUserProfileResponse(u *models.User) dto.UserProfileResponseDTO {
	res := dto.UserProfileResponseDTO{
		ID:        u.ID,
		Email:     u.Email,
		FirstName: u.FirstName,
		LastName:  u.LastName,
		Role:      string(u.Role),
	}

	if u.Coach != nil {
		// โค้ชก็มีรหัสประจำตัวเหมือนกัน ใช้ชุดเลขเดียวกับผู้เรียน
		res.MemberCode = u.Coach.MemberCode
		res.Nickname = u.Coach.Nickname
		res.ProfilePicture = u.Coach.ProfilePicture
	}

	if u.Customer != nil {
		res.MemberCode = u.Customer.MemberCode
		res.Nickname = u.Customer.Nickname
		res.PhoneNumber = u.Customer.PhoneNumber
		res.LineID = u.Customer.LineID
		res.Facebook = u.Customer.Facebook
		res.Gender = strings.ToLower(string(u.Customer.Gender))
		res.ParentEmail = u.Customer.ParentEmail
		res.ParentPhoneNumber = u.Customer.ParentPhoneNumber
		res.ProfilePicture = u.Customer.ProfilePicture
		res.Status = string(u.Customer.Status)

		if !u.Customer.BirthDate.IsZero() {
			formatted := u.Customer.BirthDate.Format("2006-01-02")
			res.BirthDate = &formatted
		}
	}

	return res
}

//GetAllUsersController
func (ctrl *UserController) GetUserByRoleController(c *gin.Context) {
	role := c.Query("role")
	users, err := ctrl.userService.GetUserByRole(models.UserRole(role))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถดึงข้อมูลผู้ใช้ได้"})
		return
	}

	// ใช้ UserMinDTO เพราะหน้าที่เรียกเส้นนี้ (หน้าออกบิล) ต้องการแค่ชื่อกับชื่อเล่น
	// ไม่ควรได้ข้อมูลอื่นติดไปด้วย และที่สำคัญคือกัน password hash หลุด
	response := make([]dto.UserMinDTO, 0, len(users))
	for i := range users {
		if item := dto.ToUserMinDTO(&users[i]); item != nil {
			response = append(response, *item)
		}
	}

	c.JSON(http.StatusOK, gin.H{"data": response})
}

// AdminCreateUserController สร้างบัญชีผู้ใช้พร้อมโปรไฟล์ตามบทบาท
//
//	POST /api/admin/users
//
// เป็นทางเดียวที่ควรใช้สร้างสมาชิกจากหน้าแอดมิน เพราะสร้าง user และโปรไฟล์
// (customer/coach) ในทรานแซกชันเดียว ไม่ทิ้ง user ลอยไว้เมื่อมีอะไรพลาด
func (ctrl *UserController) AdminCreateUserController(c *gin.Context) {
	var req dto.AdminCreateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": bindErrorMessage(err)})
		return
	}

	user, err := ctrl.userService.AdminCreateUser(&req)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrEmailTaken), errors.Is(err, services.ErrCoachDuplicateUID):
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		}
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "สร้างสมาชิกสำเร็จ",
		"data":    toUserProfileResponse(user),
	})
}

// AdminGetUserDetailController ดึงข้อมูลสมาชิกแบบเต็มให้แอดมิน
//
//	GET /api/admin/users/:id
//
// ต่างจาก GET /api/users/:id ตรงที่เส้นนี้คืนโปรไฟล์ตามบทบาทมาครบทุกฟิลด์
// (โปรไฟล์โค้ชเต็มก้อน หรือโปรไฟล์ผู้เรียนเต็มก้อน) สำหรับหน้าดูรายละเอียด/แก้ไข
// คุมสิทธิ์ด้วย adminOnly ที่ชั้น route แล้ว จึงไม่ต้องเช็ค IDOR ซ้ำ
func (ctrl *UserController) AdminGetUserDetailController(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID ผู้ใช้งานไม่ถูกต้อง ต้องเป็นตัวเลขเท่านั้น"})
		return
	}

	user, err := ctrl.userService.GetUserProfile(uint(id))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบผู้ใช้งาน"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถดึงข้อมูลผู้ใช้งานได้"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": dto.ToAdminUserDetail(user)})
}

// AdminUpdateUserController ให้แอดมินแก้ข้อมูลสมาชิก
//
//	PATCH /api/admin/users/:id
//
// ครอบคลุมข้อมูลที่เจ้าตัวแก้เองไม่ได้ตามนโยบาย — ชื่อ อีเมล วันเกิด เลขบัตรประชาชน
// บัญชีธนาคาร ค่าจ้าง ฯลฯ โดยแอดมินจะแก้ให้หลังตรวจหลักฐานที่สมาชิกส่งมา
// (การส่งหลักฐานทำนอกระบบ ทักกันเอง)
func (ctrl *UserController) AdminUpdateUserController(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID ผู้ใช้งานไม่ถูกต้อง ต้องเป็นตัวเลขเท่านั้น"})
		return
	}

	var req dto.AdminUpdateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": bindErrorMessage(err)})
		return
	}

	user, err := ctrl.userService.AdminUpdateUser(uint(id), &req)
	if err != nil {
		switch {
		case errors.Is(err, gorm.ErrRecordNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบผู้ใช้งาน"})
		case errors.Is(err, services.ErrEmailTaken), errors.Is(err, services.ErrCoachDuplicateUID):
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		case errors.Is(err, services.ErrProfileNotFound),
			errors.Is(err, services.ErrAdminEmailDomain),
			errors.Is(err, services.ErrEmailInvalid):
			// ต้องส่งข้อความจริงกลับไป ไม่งั้นแอดมินเห็นแค่ "อัปเดตไม่ได้"
			// แล้วไม่มีทางรู้ว่าติดที่กติกาโดเมนอีเมล
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถอัปเดตข้อมูลได้"})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "อัปเดตข้อมูลสมาชิกสำเร็จ",
		"data":    dto.ToAdminUserDetail(user),
	})
}

//CreateUser handles the creation of a new user
func (ctrl *UserController) CreateUserController(c *gin.Context) {
	// ใช้ DTO ไม่ใช่ models.User เพื่อไม่ให้ client กำหนดฟิลด์อ่อนไหวเอง
	// (รายละเอียดเหตุผลอยู่ที่คอมเมนต์ของ dto.CreateUserRequest)
	var req dto.CreateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": bindErrorMessage(err)})
		return
	}

	user := req.ToUser()
	if err := ctrl.userService.CreateUser(user); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "สร้างผู้ใช้สำเร็จ",
		"data":    toUserProfileResponse(user),
	})
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
	ctx.JSON(http.StatusOK, gin.H{
		"message": "อัปเดตข้อมูลสำเร็จแล้ว",
		"data":    toUserProfileResponse(updatedUser),
	})
}
 
// DeleteUserController handles the deletion of a user
func (c *UserController) DeleteUserController(ctx *gin.Context) {
	idParam := ctx.Param("id")
	id, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "ID ผู้ใช้งานไม่ถูกต้อง ต้องเป็นตัวเลขเท่านั้น"})
		return
	}
	// ต้องรู้ว่าใครเป็นคนกดลบ เพื่อกันแอดมินลบบัญชีตัวเอง
	actorUserID, _, ok := GetAuthContext(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่"})
		return
	}

	if err := c.userService.DeleteUser(uint(id), actorUserID); err != nil {
		switch {
		case errors.Is(err, gorm.ErrRecordNotFound):
			ctx.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบผู้ใช้งาน"})
		// 409 Conflict — คำขอถูกต้องทุกอย่าง แต่ขัดกับสถานะปัจจุบันของระบบ
		// (เหลือแอดมินคนเดียว / กำลังลบตัวเองอยู่) ไม่ใช่ 400 ที่แปลว่าส่งข้อมูลมาผิด
		case errors.Is(err, services.ErrLastAdmin), errors.Is(err, services.ErrDeleteSelf):
			ctx.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		default:
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


    response := toUserProfileResponse(user)
    response.IsStudent = isStudent

    c.JSON(http.StatusOK, gin.H{"data": response})
}

func (ctrl *UserController) GetAllUsersController(c *gin.Context) {
	users, err := ctrl.userService.GetAllUsers()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถดึงข้อมูลผู้ใช้ได้"})
		return
	}

	// map เป็น DTO เพื่อส่ง status/nickname/phone (จากตาราง customers) ไปให้หน้า admin
	// admin/coach ไม่มี Customer จึงไม่มี status (หน้าบ้านจะถือว่า active ตามค่าเริ่มต้น)
	response := make([]dto.UserProfileResponseDTO, 0, len(users))
	for i := range users {
		response = append(response, toUserProfileResponse(&users[i]))
	}

	c.JSON(http.StatusOK, gin.H{"data": response})
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
		lineID := ""
		facebook := ""
		birthDate := ""
		gender := ""
		profilePicture := ""

		if u.Customer != nil {
			nickname = u.Customer.Nickname
			phone = u.Customer.PhoneNumber
			lineID = u.Customer.LineID
			facebook = u.Customer.Facebook
			gender = strings.ToLower(string(u.Customer.Gender))
			profilePicture = u.Customer.ProfilePicture
			if !u.Customer.BirthDate.IsZero() {
				birthDate = u.Customer.BirthDate.Format("2006-01-02")
			}
		}

		response = append(response, dto.StudentListResponseDTO{
			ID:               u.ID,
			FirstName:        u.FirstName,
			LastName:         u.LastName,
			Email:            u.Email,
			Nickname:         nickname,
			PhoneNumber:      phone,
			GraceEnrollments: ctrl.userService.CountGraceEnrollments(u.ID),
			LineID:           lineID,
			Facebook:         facebook,
			BirthDate:        birthDate,
			Gender:           gender,
			ProfilePicture:   profilePicture,
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

	// ⚠️ เส้นนี้เรียกได้โดยไม่ต้องล็อกอิน จึงคืนได้เฉพาะข้อมูลที่ปิดบังแล้ว
	//
	// เดิมคืนชื่อจริง นามสกุล ชื่อเล่น อีเมลเต็ม เบอร์เต็ม และ role ทำให้ไล่ยิงเบอร์
	// เพื่อกวาดรายชื่อสมาชิกทั้งระบบได้ (ดูเหตุผลเต็มที่ dto.FindAccountResponse)
	phoneNumber := ""
	if user.Customer != nil {
		phoneNumber = user.Customer.PhoneNumber
	}

	c.JSON(http.StatusOK, gin.H{
		"status": "success",
		"user": dto.FindAccountResponse{
			MaskedEmail: dto.MaskEmail(user.Email),
			MaskedPhone: dto.MaskPhone(phoneNumber),
		},
	})
}