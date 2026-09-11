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

	// ผลตรวจสลิปอัตโนมัติ (SlipOK) — เก็บไว้ให้แอดมินเห็นตอนตรวจด้วยตนเอง
	// SlipOkChecked = ระบบ SlipOK ได้ตรวจใบนี้หรือยัง (false = บัญชีไม่ได้เปิด auto-verify จึงไม่เคยตรวจ)
	// SlipOkPassed  = ผลตรวจผ่านหรือไม่ · SlipOkMessage = ข้อความ/เหตุผลจาก SlipOK
	SlipOkChecked bool   `json:"slipok_checked" gorm:"default:false"`
	SlipOkPassed  bool   `json:"slipok_passed" gorm:"default:false"`
	SlipOkMessage string `json:"slipok_message"`

	// บัญชีปลายทางที่ลูกค้าโอนเข้า (snapshot ตอนแนบสลิป เผื่อบัญชีถูกแก้/ปิดภายหลัง)
	ReceivingBankName  string `json:"receiving_bank_name"`
	ReceivingAccountNo string `json:"receiving_account_no"`

	CustomerID uint  `json:"customer_id"`
	Customer   *User `json:"customer" gorm:"foreignKey:CustomerID"`

	// ConfirmedBy = แอดมินที่กด "อนุมัติยอดเงินโอน" จริง (nil = ระบบยืนยันอัตโนมัติผ่าน SlipOK)
	ConfirmedByID *uint `json:"confirmed_by_id"`
	ConfirmedBy   *User `json:"confirmed_by" gorm:"foreignKey:ConfirmedByID"`

	PaymentItem []PaymentItem `json:"paymentitem" gorm:"foreignKey:InvoiceID"`
}
