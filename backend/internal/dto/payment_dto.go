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
}

// ToUserMinDTO maps models.User to UserMinDTO
func ToUserMinDTO(u *models.User) *UserMinDTO {
	if u == nil {
		return nil
	}
	return &UserMinDTO{
		ID:        u.ID,
		FirstName: u.FirstName,
		LastName:  u.LastName,
		Email:     u.Email,
		Role:      string(u.Role),
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
	AdminID       uint            `json:"admin_id"`
	Admin         *UserMinDTO     `json:"admin,omitempty"`
	SlipImageUrl  string          `json:"slipurl,omitempty"`
	InvoiceID     uint            `json:"invoice_id,omitempty"`
	CreatedAt     time.Time       `json:"created_at"`
}

// ToBillingDTO maps models.Billing to BillingDTO
func ToBillingDTO(b *models.Billing) *BillingDTO {
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
	if len(b.PaymentItem) > 0 && b.PaymentItem[0].Invoice != nil {
		dto.SlipImageUrl = b.PaymentItem[0].Invoice.SlipImageUrl
		dto.InvoiceID = b.PaymentItem[0].InvoiceID
	}

	return dto
}

// ToBillingDTOs maps a list of models.Billing to BillingDTOs
func ToBillingDTOs(billings []models.Billing) []BillingDTO {
	var dtos []BillingDTO
	for _, b := range billings {
		dtos = append(dtos, *ToBillingDTO(&b))
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
type CreateBillingRequest struct {
	CustomerIDs   []uint    `json:"customer_ids" binding:"required"`
	AdminID       uint      `json:"admin_id" binding:"required"`
	BillingTypeID uint      `json:"billingtype_id" binding:"required"`
	Description   string    `json:"billingdescription" binding:"required"`
	Amount        float64   `json:"billingamount" binding:"required"`
	DueDate       time.Time `json:"billingdue_date" binding:"required"`
}

// CreateSplitBillingRequest represents the request payload for splitting billing based on attendance
type CreateSplitBillingRequest struct {
	CourseID      uint      `json:"course_id" binding:"required"`
	Date          string    `json:"date" binding:"required"` // format: YYYY-MM-DD
	HourlyRate    float64   `json:"hourly_rate" binding:"required"`
	Hours         float64   `json:"hours" binding:"required"`
	AdminID       uint      `json:"admin_id" binding:"required"`
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
	Amount        *float64   `json:"billingamount"`
	DueDate       *time.Time `json:"billingdue_date"`
	Status        *string    `json:"billingstatus"`
	BillingTypeID *uint      `json:"billingtype_id"`
}

