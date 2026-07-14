package dto

import (
	"CPE-691015/internal/models"
	"time"
)

type CreateExpenseRequest struct {
	Amount      float64            `json:"expenseamount" binding:"required,gt=0"`
	Type        models.ExpenseType `json:"expensetype" binding:"required"`
	Description string             `json:"expensedescription"`
	Date        time.Time          `json:"expensedate" binding:"required"`
	CoachID     *uint              `json:"coach_id"`
	ReceiptURL  string             `json:"receipturl"`
}

type CoachMinDTO struct {
	ID        uint   `json:"id"`
	Nickname  string `json:"nickname"`
	FirstName string `json:"firstName,omitempty"`
	LastName  string `json:"lastName,omitempty"`
	Email     string `json:"email,omitempty"`
}

type ExpenseDTO struct {
	ID          uint               `json:"id"`
	Amount      float64            `json:"expenseamount"`
	Type        models.ExpenseType `json:"expensetype"`
	Description string             `json:"expensedescription"`
	Date        time.Time          `json:"expensedate"`
	CoachID     *uint              `json:"coach_id,omitempty"`
	Coach       *CoachMinDTO       `json:"coach,omitempty"`
	ReceiptURL  string             `json:"receipturl"`
	CreatedAt   time.Time          `json:"created_at"`
}

// Map models.Expense to ExpenseDTO
func ToExpenseDTO(e *models.Expense) *ExpenseDTO {
	if e == nil {
		return nil
	}

	dto := &ExpenseDTO{
		ID:          e.ID,
		Amount:      e.Amount,
		Type:        e.Type,
		Description: e.Description,
		Date:        e.Date,
		CoachID:     e.CoachID,
		ReceiptURL:  e.ReceiptURL,
		CreatedAt:   e.CreatedAt,
	}

	if e.Coach != nil {
		// Map min Coach info
		dto.Coach = &CoachMinDTO{
			ID:       e.Coach.ID,
			Nickname: e.Coach.Nickname,
		}
		if e.Coach.User != nil {
			dto.Coach.FirstName = e.Coach.User.FirstName
			dto.Coach.LastName = e.Coach.User.LastName
			dto.Coach.Email = e.Coach.User.Email
		}
	}

	return dto
}

func ToExpenseDTOs(expenses []models.Expense) []ExpenseDTO {
	dtos := make([]ExpenseDTO, 0)
	for _, e := range expenses {
		dtos = append(dtos, *ToExpenseDTO(&e))
	}
	return dtos
}
