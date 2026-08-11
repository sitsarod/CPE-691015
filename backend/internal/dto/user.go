package dto



// TokenResponse ใช้สำหรับพ่นตั๋ว JWT และข้อมูลคนล็อกอินกลับไปให้ฝั่ง Frontend
type TokenResponse struct {
    Token string `json:"token"`
    Role  string `json:"role"`
}

// UserProfileResponseDTO ข้อมูลโปรไฟล์ที่หน้าโปรไฟล์ผู้เรียนใช้แสดงผล
//
// ฟิลด์ชุดล่างมาจากตาราง customers จึงมีเฉพาะผู้ใช้ role = customer
// ใช้ omitempty เพื่อไม่ให้แอดมิน/โค้ชได้ฟิลด์ว่างเปล่าติดไปด้วย
type UserProfileResponseDTO struct {
	ID        uint   `json:"id"`
	Email     string `json:"email" binding:"required,email,endswith=@gmail.com"`
	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`
	Role      string `json:"role"`
	IsStudent bool   `json:"isStudent"`

	Nickname          string     `json:"nickname,omitempty"`
	PhoneNumber       string     `json:"phoneNumber,omitempty"`
	LineID            string     `json:"lineId,omitempty"`
	Facebook          string     `json:"facebook,omitempty"`
	BirthDate         *string `json:"birthDate,omitempty"`
	Gender            string     `json:"gender,omitempty"`
	ParentEmail       string     `json:"parentEmail,omitempty"`
	ParentPhoneNumber string     `json:"parentPhoneNumber,omitempty"`
	Status            string     `json:"status,omitempty"`
}


type StudentListResponseDTO struct {
	ID          uint   `json:"id"`
	FirstName   string `json:"firstName"`
	LastName    string `json:"lastName"`
	Email       string `json:"email"`
	Nickname    string `json:"nickname"`
	PhoneNumber string `json:"phoneNumber"`

	GraceEnrollments int64 `json:"graceEnrollments"`
	LineID      string `json:"lineId"`
	Facebook    string `json:"facebook"`
	BirthDate   string `json:"birthDate"`
	Gender      string `json:"gender"`
}

type UpdateProfileInput struct {
	Email     string `json:"email" binding:"omitempty,email,endswith=@gmail.com"`
	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`

	Nickname          string `json:"nickname"`
	PhoneNumber       string `json:"phoneNumber" binding:"omitempty,numeric,len=10"`
	ParentEmail       string `json:"parentEmail" binding:"omitempty,email,endswith=@gmail.com"`
	ParentPhoneNumber string `json:"parentPhoneNumber" binding:"omitempty,numeric,len=10"`

	// LineID / Facebook ไม่บังคับ ใช้ pointer เพื่อแยก "ไม่ได้ส่งมา" ออกจาก "ส่งค่าว่างมาเพื่อลบ"
	LineID   *string `json:"lineId"`
	Facebook *string `json:"facebook"`
}


type UserInfoDTO struct {
    ID        uint   `json:"id"`
    Role      string `json:"role"`
    FirstName string `json:"firstName"`
    Email     string `json:"email"`
}


type CustomerInfoDTO struct {
    Nickname string `json:"nickname"`
    QrImage  string `json:"qrImage"` 
}


type RegisterResponseDTO struct {
    Token    string          `json:"token"`
    User     UserInfoDTO     `json:"user"`
    Customer CustomerInfoDTO `json:"customer"`
}


