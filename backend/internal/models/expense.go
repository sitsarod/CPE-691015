package models

import (
	"time"
	"gorm.io/gorm"
)

type ExpenseType string

const (
	ExpenseTypeCoach       ExpenseType = "coach_wages"
	ExpenseTypeCourt       ExpenseType = "court_rental"
	ExpenseTypeEquipment   ExpenseType = "equipment"
	ExpenseTypeAdvertising ExpenseType = "advertising"
	ExpenseTypeOther       ExpenseType = "other"
)

type Expense struct {
	gorm.Model
	Amount      float64     `gorm:"type:decimal(10,2);not null" json:"expenseamount"`
	Type        ExpenseType `gorm:"type:varchar(50);not null" json:"expensetype"`
	Description string      `gorm:"type:text" json:"expensedescription"`
	Date        time.Time   `gorm:"not null" json:"expensedate"`
	CoachID     *uint       `json:"coach_id"`
	Coach       *Coach      `gorm:"foreignKey:CoachID" json:"coach,omitempty"`
	ReceiptURL  string      `gorm:"type:varchar(255)" json:"receipturl"`
}
