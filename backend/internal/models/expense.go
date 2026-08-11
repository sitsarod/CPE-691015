package models

import (
	"time"
	"gorm.io/gorm"
)

type ExpenseType string

const (
	ExpenseTypeCoach       ExpenseType = "coach_wages"  // ค่าจ้างโค้ชตามคาบสอน (คำนวณอัตโนมัติ)
	ExpenseTypeCoachOther  ExpenseType = "coach_other"  // รายได้ส่วนอื่นที่จ่ายให้โค้ช (โบนัส/อื่น ๆ กรอกเอง) แยกออกจากค่าจ้างเพื่อทำ dashboard
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
