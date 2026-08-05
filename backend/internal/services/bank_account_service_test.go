package services

import "testing"

// TestValidatePromptPayID ตรวจว่ากติกาเลขพร้อมเพย์ยอมรับ/ปฏิเสธค่าได้ถูกต้อง
// รับได้เฉพาะตัวเลขล้วน 10 (เบอร์มือถือ), 13 (เลขบัตรประชาชน/ผู้เสียภาษี) หรือ 15 หลัก (e-Wallet)
// และปล่อยว่างได้ (บัญชีที่ใช้เฉพาะการโอนเงิน)
func TestValidatePromptPayID(t *testing.T) {
	tests := []struct {
		name      string
		input     string
		wantError bool
	}{
		// กรณีที่ควรผ่าน
		{"empty is allowed", "", false},
		{"whitespace only is treated as empty", "   ", false},
		{"mobile 10 digits", "0812345678", false},
		{"national/tax id 13 digits", "1234567890123", false},
		{"e-wallet 15 digits", "123456789012345", false},
		{"valid value with surrounding spaces", "  0812345678  ", false},

		// กรณีที่ควรถูกปฏิเสธ
		{"too short (9 digits)", "081234567", true},
		{"11 digits", "08123456789", true},
		{"12 digits", "081234567890", true},
		{"14 digits", "12345678901234", true},
		{"16 digits", "1234567890123456", true},
		{"contains letters", "08123abc78", true},
		{"contains hyphens", "081-234-5678", true},
		{"contains internal space", "0812 345678", true},
		{"plus country code prefix", "+66812345678", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validatePromptPayID(tt.input)
			if tt.wantError && err == nil {
				t.Errorf("validatePromptPayID(%q) = nil, want error", tt.input)
			}
			if !tt.wantError && err != nil {
				t.Errorf("validatePromptPayID(%q) = %v, want nil", tt.input, err)
			}
		})
	}
}
