package models

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