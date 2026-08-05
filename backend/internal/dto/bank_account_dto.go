package dto

type CreateBankAccountRequest struct {
	BankName    string `json:"bank_name" binding:"required"`
	AccountNo   string `json:"account_no" binding:"required"`
	AccountName string `json:"account_name" binding:"required"`
	PromptPayID string `json:"promptpay_id"` // เลขพร้อมเพย์ (ไม่บังคับ) สำหรับสร้าง QR สแกนจ่าย
}

type UpdateBankAccountRequest struct {
	BankName          *string `json:"bank_name"`
	AccountNo         *string `json:"account_no"`
	AccountName       *string `json:"account_name"`
	PromptPayID       *string `json:"promptpay_id"`
	IsActive          *bool   `json:"is_active"`
	AutoVerifyEnabled *bool   `json:"auto_verify_enabled"`
}
