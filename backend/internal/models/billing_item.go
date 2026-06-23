package models

import (
	"time"

	"gorm.io/gorm"
)

type BillingStatus string

const (
	StatusPaid      BillingStatus = "paid"
	StatusUnfunded  BillingStatus = "unfunded"
	StatusOverdue   BillingStatus = "overdue"
	StatusWaitCheck BillingStatus = "waitcheck"
)

type Billing struct {
	gorm.Model

	Description string    `json:"billingdescription"`
	Amount      float64   `json:"billingamount"`
	DueDate     time.Time `json:"billingdue_date"`

	Status BillingStatus `json:"billingstatus" gorm:"default:'unfunded'"`

	BillingTypeID uint         `json:"billingtype_id" valid:"required~BillingTypeID is required"`
	BillingType   *BillingType `json:"-" gorm:"foreignKey:BillingTypeID"`

	CustomerID uint  `json:"customer_id"`
	Customer   *User `json:"customer" gorm:"foreignKey:CustomerID"`

	AdminID uint  `json:"admin_id"`
	Admin   *User `json:"admin" gorm:"foreignKey:AdminID"`

	PaymentItem []PaymentItem `json:"paymentitem" gorm:"foreignKey:BillingID"`
}
