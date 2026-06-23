package models

import (
	"gorm.io/gorm"
)


type PaymentItem struct {
	gorm.Model

	InvoiceID uint  `json:"invoice_id"`
	Invoice   *Invoice `json:"invoice" gorm:"foreignKey:InvoiceID"`

	BillingID uint  `json:"billing_id"`
	Billing   *Billing `json:"billing" gorm:"foreignKey:BillingID"`
}
