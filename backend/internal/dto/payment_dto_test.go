package dto

import (
	"CPE-691015/internal/models"
	"testing"
	"time"

	"gorm.io/gorm"
)

func TestToUserMinDTO(t *testing.T) {
	t.Run("nil user", func(t *testing.T) {
		got := ToUserMinDTO(nil)
		if got != nil {
			t.Errorf("expected nil, got %v", got)
		}
	})

	t.Run("valid user", func(t *testing.T) {
		user := &models.User{
			Model: gorm.Model{
				ID: 10,
			},
			Role:      models.CustomerRole,
			FirstName: "John",
			LastName:  "Doe",
			Email:     "john@example.com",
			Password:  "hashedpassword", // Should not be in DTO
		}

		dto := ToUserMinDTO(user)
		if dto == nil {
			t.Fatal("expected non-nil DTO")
		}
		if dto.ID != 10 {
			t.Errorf("expected ID 10, got %d", dto.ID)
		}
		if dto.FirstName != "John" {
			t.Errorf("expected FirstName John, got %s", dto.FirstName)
		}
		if dto.LastName != "Doe" {
			t.Errorf("expected LastName Doe, got %s", dto.LastName)
		}
		if dto.Email != "john@example.com" {
			t.Errorf("expected Email john@example.com, got %s", dto.Email)
		}
		if dto.Role != string(models.CustomerRole) {
			t.Errorf("expected Role customer, got %s", dto.Role)
		}
	})
}

func TestToBillingDTO(t *testing.T) {
	now := time.Now()
	adminID := uint(4)
	billing := &models.Billing{
		Model: gorm.Model{
			ID: 1,
		},
		Description: "Court Rental Fee",
		Amount:      150.00,
		DueDate:     now,
		Status:      models.StatusUnfunded,
		BillingTypeID: 2,
		BillingType: &models.BillingType{
			Model: gorm.Model{
				ID: 2,
			},
			BillingTypeName: "Court Fee",
		},
		CustomerID: 3,
		Customer: &models.User{
			Model: gorm.Model{
				ID: 3,
			},
			FirstName: "Alice",
			LastName:  "Smith",
			Email:     "alice@example.com",
			Role:      models.CustomerRole,
		},
		AdminID: &adminID,
		Admin: &models.User{
			Model: gorm.Model{
				ID: 4,
			},
			FirstName: "Bob",
			LastName:  "Admin",
			Email:     "bob@example.com",
			Role:      models.AdminRole,
		},
	}

	dto := ToBillingDTO(billing)
	if dto == nil {
		t.Fatal("expected non-nil DTO")
	}

	if dto.ID != 1 {
		t.Errorf("expected ID 1, got %d", dto.ID)
	}
	if dto.Description != "Court Rental Fee" {
		t.Errorf("expected description, got %s", dto.Description)
	}
	if dto.Amount != 150.00 {
		t.Errorf("expected amount 150, got %f", dto.Amount)
	}
	if !dto.DueDate.Equal(now) {
		t.Errorf("expected due date %v, got %v", now, dto.DueDate)
	}
	if dto.Status != string(models.StatusUnfunded) {
		t.Errorf("expected status unfunded, got %s", dto.Status)
	}
	if dto.BillingType == nil || dto.BillingType.BillingTypeName != "Court Fee" {
		t.Errorf("expected billing type name 'Court Fee', got %v", dto.BillingType)
	}
	if dto.Customer == nil || dto.Customer.FirstName != "Alice" {
		t.Errorf("expected customer Alice, got %v", dto.Customer)
	}
	if dto.Admin == nil || dto.Admin.FirstName != "Bob" {
		t.Errorf("expected admin Bob, got %v", dto.Admin)
	}
}

func TestToInvoiceDTO(t *testing.T) {
	invoice := &models.Invoice{
		Model: gorm.Model{
			ID: 5,
		},
		TotalAmount:   300.00,
		Status:        models.InvoicePending,
		TransactionID: "TXN12345",
		SlipImageUrl:  "http://example.com/slip.jpg",
		Method:        models.MethodQR,
		CustomerID:    3,
		Customer: &models.User{
			Model: gorm.Model{
				ID: 3,
			},
			FirstName: "Alice",
			LastName:  "Smith",
			Email:     "alice@example.com",
			Role:      models.CustomerRole,
		},
		PaymentItem: []models.PaymentItem{
			{
				Model: gorm.Model{
					ID: 8,
				},
				InvoiceID: 5,
				BillingID: 1,
				Billing: &models.Billing{
					Model: gorm.Model{
						ID: 1,
					},
					Description: "Court Rental Fee",
					Amount:      300.00,
					Status:      models.StatusUnfunded,
				},
			},
		},
	}

	dto := ToInvoiceDTO(invoice)
	if dto == nil {
		t.Fatal("expected non-nil DTO")
	}

	if dto.ID != 5 {
		t.Errorf("expected ID 5, got %d", dto.ID)
	}
	if dto.TotalAmount != 300.00 {
		t.Errorf("expected total amount 300, got %f", dto.TotalAmount)
	}
	if dto.Status != string(models.InvoicePending) {
		t.Errorf("expected status pending, got %s", dto.Status)
	}
	if dto.Method != string(models.MethodQR) {
		t.Errorf("expected method qr, got %s", dto.Method)
	}
	if dto.Customer == nil || dto.Customer.FirstName != "Alice" {
		t.Errorf("expected customer Alice, got %v", dto.Customer)
	}
	if len(dto.PaymentItems) != 1 {
		t.Fatalf("expected 1 payment item, got %d", len(dto.PaymentItems))
	}
	if dto.PaymentItems[0].Billing == nil || dto.PaymentItems[0].Billing.Description != "Court Rental Fee" {
		t.Errorf("expected inner billing description 'Court Rental Fee', got %v", dto.PaymentItems[0].Billing)
	}
}
