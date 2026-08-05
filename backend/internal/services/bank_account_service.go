package services

import (
	"errors"
	"regexp"
	"strings"
	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
	"gorm.io/gorm"
)

// promptPayIDPattern ยอมรับเฉพาะตัวเลขล้วนความยาว 10 (เบอร์มือถือ),
// 13 (เลขบัตรประชาชน/ผู้เสียภาษี) หรือ 15 หลัก (เลข e-Wallet)
var promptPayIDPattern = regexp.MustCompile(`^[0-9]{10}$|^[0-9]{13}$|^[0-9]{15}$`)

// validatePromptPayID ตรวจรูปแบบเลขพร้อมเพย์ ปล่อยว่างได้ (บัญชีที่ใช้เฉพาะโอนเงิน)
// แต่ถ้ากรอกมาต้องเป็นรูปแบบที่ promptpay.io นำไปสร้าง QR ได้จริง
func validatePromptPayID(promptPayID string) error {
	trimmed := strings.TrimSpace(promptPayID)
	if trimmed == "" {
		return nil
	}
	if !promptPayIDPattern.MatchString(trimmed) {
		return errors.New("เลขพร้อมเพย์ไม่ถูกต้อง ต้องเป็นตัวเลขล้วน 10 หลัก (เบอร์มือถือ), 13 หลัก (เลขบัตรประชาชน) หรือ 15 หลัก (e-Wallet)")
	}
	return nil
}

type BankAccountService struct {
	db *gorm.DB
}

func NewBankAccountService(db *gorm.DB) *BankAccountService {
	return &BankAccountService{db: db}
}

// GetAllBankAccounts returns all bank accounts ordered by ID
func (s *BankAccountService) GetAllBankAccounts() ([]models.BankAccount, error) {
	var accounts []models.BankAccount
	err := s.db.Order("id ASC").Find(&accounts).Error
	return accounts, err
}

// GetActiveBankAccounts returns only the currently active bank account(s), safe for any authenticated user to read
func (s *BankAccountService) GetActiveBankAccounts() ([]models.BankAccount, error) {
	var accounts []models.BankAccount
	err := s.db.Where("is_active = ?", true).Order("id ASC").Find(&accounts).Error
	return accounts, err
}

// ToggleBankAccount sets the selected bank account as active, and all other bank accounts as inactive
func (s *BankAccountService) ToggleBankAccount(id uint) (*models.BankAccount, error) {
	var targetAccount models.BankAccount
	if err := s.db.First(&targetAccount, id).Error; err != nil {
		return nil, errors.New("ไม่พบข้อมูลบัญชีธนาคาร")
	}

	err := s.db.Transaction(func(tx *gorm.DB) error {
		// Set all accounts to inactive
		if err := tx.Model(&models.BankAccount{}).Where("1 = 1").Update("is_active", false).Error; err != nil {
			return err
		}

		// Set the target account to active
		if err := tx.Model(&models.BankAccount{}).Where("id = ?", id).Update("is_active", true).Error; err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	// Fetch updated account
	if err := s.db.First(&targetAccount, id).Error; err != nil {
		return nil, err
	}

	return &targetAccount, nil
}

// CreateBankAccount creates a new bank account
func (s *BankAccountService) CreateBankAccount(req dto.CreateBankAccountRequest) (*models.BankAccount, error) {
	// Validate PromptPay ID format (optional field)
	if err := validatePromptPayID(req.PromptPayID); err != nil {
		return nil, err
	}

	// Check if account number already exists
	var count int64
	s.db.Model(&models.BankAccount{}).Where("account_no = ?", req.AccountNo).Count(&count)
	if count > 0 {
		return nil, errors.New("เลขที่บัญชีนี้มีอยู่ในระบบแล้ว")
	}

	account := models.BankAccount{
		BankName:    req.BankName,
		AccountNo:   req.AccountNo,
		AccountName: req.AccountName,
		PromptPayID: strings.TrimSpace(req.PromptPayID),
		IsActive:    false, // Default to inactive on creation
	}

	if err := s.db.Create(&account).Error; err != nil {
		return nil, errors.New("ไม่สามารถบันทึกข้อมูลบัญชีธนาคารได้")
	}

	return &account, nil
}

// UpdateBankAccount updates bank account details
func (s *BankAccountService) UpdateBankAccount(id uint, req dto.UpdateBankAccountRequest) (*models.BankAccount, error) {
	var account models.BankAccount
	if err := s.db.First(&account, id).Error; err != nil {
		return nil, errors.New("ไม่พบข้อมูลบัญชีธนาคาร")
	}

	// Validate PromptPay ID format if provided in this update
	if req.PromptPayID != nil {
		if err := validatePromptPayID(*req.PromptPayID); err != nil {
			return nil, err
		}
	}

	// Check if updating to an already existing account number (excluding itself)
	if req.AccountNo != nil && *req.AccountNo != account.AccountNo {
		var count int64
		s.db.Model(&models.BankAccount{}).Where("account_no = ? AND id != ?", *req.AccountNo, id).Count(&count)
		if count > 0 {
			return nil, errors.New("เลขที่บัญชีนี้มีอยู่ในระบบแล้ว")
		}
	}

	err := s.db.Transaction(func(tx *gorm.DB) error {
		// Update details
		updates := make(map[string]interface{})
		if req.BankName != nil {
			updates["bank_name"] = *req.BankName
		}
		if req.AccountNo != nil {
			updates["account_no"] = *req.AccountNo
		}
		if req.AccountName != nil {
			updates["account_name"] = *req.AccountName
		}
		if req.PromptPayID != nil {
			updates["prompt_pay_id"] = strings.TrimSpace(*req.PromptPayID)
		}
		if req.AutoVerifyEnabled != nil {
			updates["auto_verify_enabled"] = *req.AutoVerifyEnabled
		}

		if len(updates) > 0 {
			if err := tx.Model(&account).Updates(updates).Error; err != nil {
				return err
			}
		}

		// Handle IsActive toggling logic if IsActive field is provided
		if req.IsActive != nil {
			if *req.IsActive {
				// Set all other accounts to inactive
				if err := tx.Model(&models.BankAccount{}).Where("id != ?", id).Update("is_active", false).Error; err != nil {
					return err
				}
				// Set this account to active
				if err := tx.Model(&account).Update("is_active", true).Error; err != nil {
					return err
				}
			} else {
				// Set this account to inactive
				if err := tx.Model(&account).Update("is_active", false).Error; err != nil {
					return err
				}
			}
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	// Fetch updated record
	if err := s.db.First(&account, id).Error; err != nil {
		return nil, err
	}

	return &account, nil
}

// DeleteBankAccount deletes a bank account record
func (s *BankAccountService) DeleteBankAccount(id uint) error {
	var account models.BankAccount
	if err := s.db.First(&account, id).Error; err != nil {
		return errors.New("ไม่พบข้อมูลบัญชีธนาคาร")
	}

	if account.IsActive {
		return errors.New("ไม่สามารถลบบัญชีธนาคารที่ตั้งเป็นบัญชีหลักได้")
	}

	if err := s.db.Unscoped().Delete(&account).Error; err != nil {
		return errors.New("ไม่สามารถลบข้อมูลบัญชีธนาคารได้")
	}

	return nil
}
