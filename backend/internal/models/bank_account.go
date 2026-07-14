package models

import (
	"gorm.io/gorm"
)

type BankAccount struct {
	gorm.Model
	BankName    string `json:"bank_name" gorm:"not null"`
	AccountNo   string `json:"account_no" gorm:"unique;not null"`
	AccountName string `json:"account_name" gorm:"not null"`
	IsActive    bool   `json:"is_active" gorm:"default:false"`
}
