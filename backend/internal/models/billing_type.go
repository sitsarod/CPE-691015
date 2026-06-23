package models

import (
	"gorm.io/gorm"
)

type BillingType struct {
	gorm.Model

	BillingTypeName string `json:"billingtypename"`

	Billing []Billing `json:"billing_item" gorm:"foreignKey:BillingTypeID"`
}
