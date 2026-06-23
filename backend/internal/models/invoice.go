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
)

type PaymentMethod string

const (
	MethodQR         PaymentMethod = "qr"
	MethodCash       PaymentMethod = "cash"
	MethodMasterCard PaymentMethod = "mastercard"
)

type Invoice struct {
	gorm.Model

	TotalAmount float64 `json:"invoicetotalamount"`

	Status InvoiceStatus `json:"invoicestatus" gorm:"default:'pending'"`

	TransactionID string `json:"transactionid"`

	SlipImageUrl string `json:"slipurl"`

	Method PaymentMethod `json:"paymentmethod"`

	CustomerID uint  `json:"customer_id"`
	Customer   *User `json:"customer" gorm:"foreignKey:CustomerID"`

	PaymentItem []PaymentItem `json:"paymentitem" gorm:"foreignKey:InvoiceID"`
}
