package dto

import "time"

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
	Email     string `json:"email"`
	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`
	Role      string `json:"role"`
	IsStudent bool   `json:"isStudent"`

	Nickname          string     `json:"nickname,omitempty"`
	PhoneNumber       string     `json:"phoneNumber,omitempty"`
	BirthDate         *time.Time `json:"birthDate,omitempty"`
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

