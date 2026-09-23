package dto

import (
	"CPE-691015/internal/models"
	"time"
)

// UserMinDTO represents a simplified user model for payment responses
type UserMinDTO struct {
	ID        uint   `json:"id"`
	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`
	Email     string `json:"email"`
	Role      string `json:"role"`
	Nickname  string `json:"nickname"`
}

// ToUserMinDTO maps models.User to UserMinDTO
func ToUserMinDTO(u *models.User) *UserMinDTO {
	if u == nil {
		return nil
	}
	nickname := ""
	if u.Customer != nil {
		nickname = u.Customer.Nickname
	}
	return &UserMinDTO{
		ID:        u.ID,
		FirstName: u.FirstName,
		LastName:  u.LastName,
		Email:     u.Email,
		Role:      string(u.Role),
		Nickname:  nickname,
	}
}

// BillingTypeDTO represents a billing type response
type BillingTypeDTO struct {
	ID              uint   `json:"id"`
	BillingTypeName string `json:"billingtypename"`
}

// ToBillingTypeDTO maps models.BillingType to BillingTypeDTO
func ToBillingTypeDTO(bt *models.BillingType) *BillingTypeDTO {
	if bt == nil {
		return nil
	}
	return &BillingTypeDTO{
		ID:              bt.ID,
		BillingTypeName: bt.BillingTypeName,
	}
}

// BillingDTO represents a billing item response
type BillingDTO struct {
	ID            uint            `json:"id"`
	Description   string          `json:"billingdescription"`
	Amount        float64         `json:"billingamount"`
	DueDate       time.Time       `json:"billingdue_date"`
	Status        string          `json:"billingstatus"`
	BillingTypeID uint            `json:"billingtype_id"`
	BillingType   *BillingTypeDTO `json:"billing_type,omitempty"`
	CustomerID    uint            `json:"customer_id"`
	Customer      *UserMinDTO     `json:"customer,omitempty"`
	AdminID       *uint           `json:"admin_id"`
	Admin         *UserMinDTO     `json:"admin,omitempty"`
	// UpdatedBy = แอดมินที่แก้ไขบิลล่าสุด (nil = ยังไม่เคยถูกแก้หลังออกบิล)
	UpdatedBy     *UserMinDTO     `json:"updated_by,omitempty"`
	SlipImageUrl  string          `json:"slipurl,omitempty"`
	InvoiceID     uint            `json:"invoice_id,omitempty"`
	// PaymentMethod = วิธีชำระเงินของใบแจ้งหนี้ที่ผูกกับบิลนี้ (qr/bank_transfer/credit_card/cash)
	// ใช้ให้หน้าบ้านแยกได้ว่าเป็นการรับเงินสด เพื่อขึ้นป้ายกำกับให้ชัด
	PaymentMethod string          `json:"paymentmethod,omitempty"`
	TransactionID string          `json:"transactionid,omitempty"`
	// ผลตรวจสลิปอัตโนมัติ (SlipOK) ของใบแจ้งหนี้ที่ผูกกับบิลนี้
	SlipOkChecked bool   `json:"slipok_checked"`
	SlipOkPassed  bool   `json:"slipok_passed"`
	SlipOkMessage string `json:"slipok_message,omitempty"`
	// บัญชีปลายทางที่ลูกค้าโอนเข้า (snapshot ตอนแนบสลิป)
	ReceivingBankName  string `json:"receiving_bank_name,omitempty"`
	ReceivingAccountNo string `json:"receiving_account_no,omitempty"`
	// ConfirmedBy = แอดมินที่กดอนุมัติการชำระเงินจริง (nil = ระบบยืนยันอัตโนมัติ)
	ConfirmedBy *UserMinDTO `json:"confirmed_by,omitempty"`
	CreatedAt   time.Time   `json:"created_at"`
	// PaidAt = เวลาที่ยืนยันการชำระเงินจริง (invoice.UpdatedAt ตอนสถานะเป็น success)
	// ใช้สำหรับจัดยอดรายรับให้อยู่ในช่วงเวลาที่จ่ายจริง ไม่ใช่วันที่ออกบิล
	PaidAt *time.Time `json:"paid_at,omitempty"`
}

// ToBillingDTO maps models.Billing to BillingDTO
func ToBillingDTO(b *models.Billing) *BillingDTO {
	if b == nil {
		return nil
	}

	// Find the latest active invoice if present to keep default behavior
	var latestInvoice *models.Invoice
	if len(b.PaymentItem) > 0 {
		selectedIndex := -1
		for i := len(b.PaymentItem) - 1; i >= 0; i-- {
			if b.PaymentItem[i].Invoice != nil {
				if b.PaymentItem[i].Invoice.Status != models.InvoiceCancelled {
					selectedIndex = i
					break
				}
			}
		}
		if selectedIndex == -1 {
			selectedIndex = len(b.PaymentItem) - 1
		}
		latestInvoice = b.PaymentItem[selectedIndex].Invoice
	}

	return toBillingDTOWithInvoice(b, latestInvoice)
}

// toBillingDTOWithInvoice maps models.Billing to BillingDTO with a specific invoice reference
func toBillingDTOWithInvoice(b *models.Billing, invoice *models.Invoice) *BillingDTO {
	if b == nil {
		return nil
	}

	dto := &BillingDTO{
		ID:            b.ID,
		Description:   b.Description,
		Amount:        b.Amount,
		DueDate:       b.DueDate,
		Status:        string(b.Status),
		BillingTypeID: b.BillingTypeID,
		CustomerID:    b.CustomerID,
		AdminID:       b.AdminID,
		CreatedAt:     b.CreatedAt,
	}

	if b.BillingType != nil {
		dto.BillingType = ToBillingTypeDTO(b.BillingType)
	}
	if b.Customer != nil {
		dto.Customer = ToUserMinDTO(b.Customer)
	}
	if b.Admin != nil {
		dto.Admin = ToUserMinDTO(b.Admin)
	}
	if b.UpdatedBy != nil {
		dto.UpdatedBy = ToUserMinDTO(b.UpdatedBy)
	}

	if invoice != nil {
		dto.InvoiceID = invoice.ID
		dto.SlipImageUrl = invoice.SlipImageUrl
		dto.PaymentMethod = string(invoice.Method)
		dto.TransactionID = invoice.TransactionID
		dto.SlipOkChecked = invoice.SlipOkChecked
		dto.SlipOkPassed = invoice.SlipOkPassed
		dto.SlipOkMessage = invoice.SlipOkMessage
		dto.ReceivingBankName = invoice.ReceivingBankName
		dto.ReceivingAccountNo = invoice.ReceivingAccountNo
		if invoice.ConfirmedBy != nil {
			dto.ConfirmedBy = ToUserMinDTO(invoice.ConfirmedBy)
		}

		// Derive status from the invoice status for this specific transaction mapping
		if invoice.Status == models.InvoiceSuccess {
			dto.Status = "paid"
			// invoice.UpdatedAt = เวลาที่ยืนยันการชำระเงิน (Save ตอน ConfirmPayment)
			paidAt := invoice.UpdatedAt
			dto.PaidAt = &paidAt
		} else if invoice.Status == models.InvoicePending {
			if invoice.SlipImageUrl != "" {
				dto.Status = "waitcheck"
			} else {
				dto.Status = "unfunded"
			}
		} else if invoice.Status == models.InvoiceRejected {
			dto.Status = "unfunded"
		} else if invoice.Status == models.InvoiceCancelled {
			dto.Status = "unfunded"
		}
	}

	return dto
}

// ToBillingDTOs maps a list of models.Billing to BillingDTOs
func ToBillingDTOs(billings []models.Billing) []BillingDTO {
	var dtos []BillingDTO
	for _, b := range billings {
		if len(b.PaymentItem) > 0 {
			// If linked to invoices, create a DTO for each invoice it belongs to
			var lastCancelled *models.Invoice
			added := false
			for _, item := range b.PaymentItem {
				if item.Invoice != nil {
					// Skip cancelled invoices to keep the list clean
					if item.Invoice.Status == models.InvoiceCancelled {
						lastCancelled = item.Invoice
						continue
					}
					dtos = append(dtos, *toBillingDTOWithInvoice(&b, item.Invoice))
					added = true
				}
			}
			// If every invoice for this billing was cancelled, still surface it as
			// unfunded instead of silently dropping the billing from the list.
			if !added {
				dtos = append(dtos, *toBillingDTOWithInvoice(&b, lastCancelled))
			}
		} else {
			// If not linked to any invoice, just map it directly
			dtos = append(dtos, *toBillingDTOWithInvoice(&b, nil))
		}
	}
	return dtos
}

// PaymentItemDTO represents a payment item response
type PaymentItemDTO struct {
	ID        uint        `json:"id"`
	InvoiceID uint        `json:"invoice_id"`
	BillingID uint        `json:"billing_id"`
	Billing   *BillingDTO `json:"billing,omitempty"`
}

// ToPaymentItemDTO maps models.PaymentItem to PaymentItemDTO
func ToPaymentItemDTO(pi *models.PaymentItem) *PaymentItemDTO {
	if pi == nil {
		return nil
	}
	dto := &PaymentItemDTO{
		ID:        pi.ID,
		InvoiceID: pi.InvoiceID,
		BillingID: pi.BillingID,
	}
	if pi.Billing != nil {
		dto.Billing = ToBillingDTO(pi.Billing)
	}
	return dto
}

// InvoiceDTO represents an invoice response
// RejectPaymentReq เหตุผลที่แอดมินปฏิเสธสลิป
//
// บังคับกรอกเพราะข้อความนี้ถูกส่งไปหาลูกค้าตรง ๆ ผ่านการแจ้งเตือน
// และแสดงในประวัติใบแจ้งหนี้ — ปฏิเสธแบบเงียบ ๆ = ลูกค้าส่งสลิปเดิมซ้ำเข้ามาอีก
type RejectPaymentReq struct {
	Reason string `json:"reason" binding:"required,min=3,max=500"`
}

type InvoiceDTO struct {
	ID            uint             `json:"id"`
	TotalAmount   float64          `json:"invoicetotalamount"`
	Status        string           `json:"invoicestatus"`
	TransactionID string           `json:"transactionid"`
	SlipImageUrl  string           `json:"slipurl"`
	Method        string           `json:"paymentmethod"`
	CustomerID    uint             `json:"customer_id"`
	Customer      *UserMinDTO      `json:"customer,omitempty"`
	PaymentItems  []PaymentItemDTO `json:"paymentitems"`
	CreatedAt     time.Time        `json:"created_at"`

	// เหตุผล/เวลาที่ถูกปฏิเสธ — มีค่าเฉพาะใบที่สถานะ rejected
	RejectReason string     `json:"reject_reason,omitempty"`
	RejectedAt   *time.Time `json:"rejected_at,omitempty"`
}

// ToInvoiceDTO maps models.Invoice to InvoiceDTO
func ToInvoiceDTO(i *models.Invoice) *InvoiceDTO {
	if i == nil {
		return nil
	}

	var items []PaymentItemDTO
	for _, item := range i.PaymentItem {
		items = append(items, *ToPaymentItemDTO(&item))
	}

	dto := &InvoiceDTO{
		ID:            i.ID,
		TotalAmount:   i.TotalAmount,
		Status:        string(i.Status),
		TransactionID: i.TransactionID,
		SlipImageUrl:  i.SlipImageUrl,
		Method:        string(i.Method),
		CustomerID:    i.CustomerID,
		PaymentItems:  items,
		CreatedAt:     i.CreatedAt,
		RejectReason:  i.RejectReason,
		RejectedAt:    i.RejectedAt,
	}

	if i.Customer != nil {
		dto.Customer = ToUserMinDTO(i.Customer)
	}

	return dto
}

// ToInvoiceDTOs maps a list of models.Invoice to InvoiceDTOs
func ToInvoiceDTOs(invoices []models.Invoice) []InvoiceDTO {
	var dtos []InvoiceDTO
	for _, i := range invoices {
		dtos = append(dtos, *ToInvoiceDTO(&i))
	}
	return dtos
}

// CreateBillingRequest represents the request payload for creating bulk or single billing
//
// ไม่มี admin_id ในนี้โดยตั้งใจ — คนออกบิลถูกอ้างจาก JWT ที่ฝั่ง controller เสมอ
// (เดิมรับจาก body ทำให้ปลอมว่าใครเป็นคนออกบิลได้ แม้ route จะเป็น adminOnly ก็ตาม)
type CreateBillingRequest struct {
	CustomerIDs   []uint    `json:"customer_ids" binding:"required"`
	BillingTypeID uint      `json:"billingtype_id" binding:"required"`
	Description   string    `json:"billingdescription" binding:"required"`
	// gt=0 กันยอดติดลบ/ศูนย์ (เดิมใช้แค่ required ทำให้ยอดติดลบผ่าน แล้วไปลดยอดรวมของ invoice ได้)
	Amount        float64   `json:"billingamount" binding:"required,gt=0"`
	DueDate       time.Time `json:"billingdue_date" binding:"required"`
}

// CreateSplitBillingRequest represents the request payload for splitting billing based on attendance
//
// ไม่มี admin_id ในนี้โดยตั้งใจ — คนออกบิลถูกอ้างจาก JWT ที่ฝั่ง controller เสมอ
type CreateSplitBillingRequest struct {
	CourseID      uint      `json:"course_id" binding:"required"`
	Date          string    `json:"date" binding:"required"` // format: YYYY-MM-DD
	// gt=0 กันอัตรา/จำนวนติดลบ ที่จะทำให้ยอดหารเฉลี่ยติดลบ
	HourlyRate    float64   `json:"hourly_rate" binding:"required,gt=0"`
	Hours         float64   `json:"hours" binding:"required,gt=0"`
	BillingTypeID uint      `json:"billingtype_id" binding:"required"`
	Description   string    `json:"billingdescription" binding:"required"`
	DueDate       time.Time `json:"billingdue_date" binding:"required"`
}

// CreateInvoiceRequest represents the request payload for creating a new invoice
type CreateInvoiceRequest struct {
	CustomerID uint   `json:"customer_id" binding:"required"`
	BillingIDs []uint `json:"billing_ids" binding:"required"`
	Method     string `json:"payment_method" binding:"required"`
}

// UploadSlipRequest represents the request payload for uploading a payment slip
type UploadSlipRequest struct {
	SlipURL string `json:"slip_url" binding:"required"`
}

// UpdateBillingRequest represents the request payload for updating billing details
type UpdateBillingRequest struct {
	Description   *string    `json:"billingdescription"`
	// omitempty = แก้เฉพาะเมื่อส่งมา, gt=0 = ถ้าส่งมาต้องเป็นบวก (กันแก้ยอดเป็นติดลบ)
	Amount        *float64   `json:"billingamount" binding:"omitempty,gt=0"`
	DueDate       *time.Time `json:"billingdue_date"`
	Status        *string    `json:"billingstatus"`
	BillingTypeID *uint      `json:"billingtype_id"`
}

