package models

import (
	"gorm.io/gorm"
)

type InvoiceStatus string

const (
	InvoicePending  InvoiceStatus = "pending"
	InvoiceSuccess  InvoiceStatus = "success"
	InvoiceRejected InvoiceStatus = "rejected"
	InvoiceExpired  InvoiceStatus = "expired"
	InvoiceCancelled InvoiceStatus = "cancelled"
)

type PaymentMethod string

const (
	MethodQR           PaymentMethod = "qr"
	MethodBankTransfer PaymentMethod = "bank_transfer"
	MethodCard         PaymentMethod = "credit_card"
	MethodCash         PaymentMethod = "cash"
)

type Invoice struct {
	gorm.Model

	TotalAmount float64 `json:"invoicetotalamount"`

	Status InvoiceStatus `json:"invoicestatus" gorm:"default:'pending'"`

	// TransactionID เก็บเลขอ้างอิงการโอน (transRef) จากสลิป ใช้กันสลิปซ้ำ
	// ใช้ partial unique index (เฉพาะค่าที่ไม่ว่าง) เพราะใบแจ้งหนี้ที่ยังไม่ยืนยันจะมีค่าว่าง "" จำนวนมาก
	// ซึ่ง Postgres ถือว่าค่าว่างซ้ำกันได้ ต่างจาก NULL — ถ้าใส่ unique เฉย ๆ จะชนกันทันที
	TransactionID string `json:"transactionid" gorm:"index:idx_invoices_transaction_id,unique,where:transaction_id <> ''"`

	SlipImageUrl string `json:"slipurl"`

	Method PaymentMethod `json:"paymentmethod"`

	CustomerID uint  `json:"customer_id"`
	Customer   *User `json:"customer" gorm:"foreignKey:CustomerID"`

	PaymentItem []PaymentItem `json:"paymentitem" gorm:"foreignKey:InvoiceID"`
}
