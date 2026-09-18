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
	// AdminID = แอดมินที่ออกบิลใบนี้ (ผู้สร้าง) · UpdatedByID = แอดมินที่แก้ไขล่าสุด (nil = ยังไม่เคยถูกแก้)
	AdminID     *uint `json:"admin_id"`
	Admin       *User `json:"admin" gorm:"foreignKey:AdminID"`
	UpdatedByID *uint `json:"updated_by_id"`
	UpdatedBy   *User `json:"updated_by" gorm:"foreignKey:UpdatedByID"`

	// AttendanceSessionID มีค่า = บิลค่าสนามที่ออกจากรอบเช็คชื่อนั้น ใช้ยกเลิกทั้งรอบแล้วออกใหม่
	AttendanceSessionID *uint `json:"attendance_session_id" gorm:"index"`

	PaymentItem []PaymentItem `json:"paymentitem" gorm:"foreignKey:BillingID"`
	Enrollment  *Enrollment   `json:"enrollment" gorm:"foreignKey:BillingID"`
}
