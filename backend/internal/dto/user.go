package dto

// LoginInput ใช้สำหรับรับข้อมูล Email และ Password จากหน้าจอล็อกอินชั่วคราว
type LoginInput struct {
    Email    string `json:"email" binding:"required,email"`
    Password string `json:"password" binding:"required"`
}

// TokenResponse ใช้สำหรับพ่นตั๋ว JWT และข้อมูลคนล็อกอินกลับไปให้ฝั่ง Frontend
type TokenResponse struct {
    Token string `json:"token"`
    Role  string `json:"role"`
}

type UserProfileResponseDTO struct {
	ID        uint   `json:"id"`
	Email     string `json:"email"`
	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`
	Role      string `json:"role"`      
	IsStudent bool   `json:"isStudent"` 
}


type StudentListResponseDTO struct {
	ID          uint   `json:"id"`
	FirstName   string `json:"firstName"`
	LastName    string `json:"lastName"`
	Email       string `json:"email"`
	Nickname    string `json:"nickname"`    
	PhoneNumber string `json:"phoneNumber"` 
}

type UpdateProfileInput struct {

	Email     string `json:"email" binding:"omitempty,email"`
	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`

	
	Nickname    string `json:"nickname"`
	PhoneNumber string `json:"phoneNumber" binding:"omitempty,numeric,length=10"`
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