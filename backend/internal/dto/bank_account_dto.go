package dto

type CreateBankAccountRequest struct {
	BankName    string `json:"bank_name" binding:"required"`
	AccountNo   string `json:"account_no" binding:"required"`
	AccountName string `json:"account_name" binding:"required"`
}

type UpdateBankAccountRequest struct {
	BankName    *string `json:"bank_name"`
	AccountNo   *string `json:"account_no"`
	AccountName *string `json:"account_name"`
	IsActive    *bool   `json:"is_active"`
}
