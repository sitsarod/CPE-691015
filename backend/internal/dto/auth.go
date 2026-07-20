package dto

// LoginInput รับข้อมูลสำหรับ Login
type LoginInput struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

// FindAccountInput รับข้อมูลสำหรับค้นหาบัญชี (อีเมลหรือเบอร์โทร)
type FindAccountInput struct {
	Identifier string `json:"identifier" binding:"required"`
}

// SendOTPInput รับอีเมลเพื่อสั่งส่ง OTP
type SendOTPInput struct {
	Email string `json:"email" binding:"required,email"`
}

// VerifyOTPInput รับอีเมลและรหัส OTP เพื่อตรวจสอบ
type VerifyOTPInput struct {
	Email string `json:"email" binding:"required,email"`
	OTP   string `json:"otp" binding:"required,len=6"`
}

// UserResponseDTO โครงสร้างข้อมูล User ที่ส่งกลับไปหน้าบ้าน
type UserResponseDTO struct {
	ID        uint   `json:"id"`
	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`
	Nickname  string `json:"nickname,omitempty"`
	Email     string `json:"email"`
	Role      string `json:"role"`
	AvatarUrl string `json:"avatarUrl,omitempty"`
}