package models

import (
	"gorm.io/gorm"
)

type BankAccount struct {
	gorm.Model
	BankName    string `json:"bank_name" gorm:"not null"`
	AccountNo   string `json:"account_no" gorm:"unique;not null"`
	AccountName string `json:"account_name" gorm:"not null"`
	// PromptPayID คือเลขพร้อมเพย์สำหรับสร้าง QR สแกนจ่าย (คนละอย่างกับเลขบัญชี)
	// รับได้เฉพาะเบอร์มือถือ 10 หลัก, เลขบัตรประชาชน/ผู้เสียภาษี 13 หลัก หรือเลข e-Wallet 15 หลัก
	// ปล่อยว่างได้ หากบัญชีนี้ใช้เฉพาะการโอนเงินธนาคาร (ไม่สร้าง QR)
	PromptPayID       string `json:"promptpay_id" gorm:"default:''"`
	IsActive          bool   `json:"is_active" gorm:"default:false"`
	AutoVerifyEnabled bool   `json:"auto_verify_enabled" gorm:"default:false"` // เปิด/ปิดการตรวจสลิปอัตโนมัติผ่าน SlipOK สำหรับบัญชีนี้
}
