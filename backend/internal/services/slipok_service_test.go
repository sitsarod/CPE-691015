package services

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

// writeTempUpload สร้างไฟล์ทดสอบไว้ใน ./uploads (ที่ loadSlipImage อ่านโดยตรงจากดิสก์)
// แล้วลบทิ้งอัตโนมัติเมื่อ test จบ
func writeTempUpload(t *testing.T, name string, content []byte) string {
	t.Helper()
	if err := os.MkdirAll("uploads", os.ModePerm); err != nil {
		t.Fatalf("failed to create uploads dir: %v", err)
	}
	path := filepath.Join("uploads", name)
	if err := os.WriteFile(path, content, 0o644); err != nil {
		t.Fatalf("failed to write temp upload: %v", err)
	}
	t.Cleanup(func() { _ = os.Remove(path) })
	return name
}

// รันได้ด้วย: go test ./internal/services/ -run TestVerifySlip -v
func newTestSlipOkService(t *testing.T, handler http.HandlerFunc) *SlipOkService {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)

	return &SlipOkService{
		apiKey:   "test-key",
		branchID: "test-branch",
		client:   server.Client(),
		baseURL:  server.URL + "/",
	}
}

func TestVerifySlipSuccessMatch(t *testing.T) {
	svc := newTestSlipOkService(t, func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("x-authorization"); got != "test-key" {
			t.Errorf("expected x-authorization header 'test-key', got %q", got)
		}
		if r.URL.Path != "/test-branch" {
			t.Errorf("expected path /test-branch, got %q", r.URL.Path)
		}

		_ = json.NewEncoder(w).Encode(map[string]any{
			"success": true,
			"data": map[string]any{
				"success":       true,
				"amount":        500.0,
				"transRef":      "REF12345",
				"receivingBank": "004",
				"receiver": map[string]any{
					"account": map[string]any{"value": "xxx-x-x1234-x"},
				},
			},
		})
	})

	// เขียนไฟล์สลิปปลอมไว้ใน ./uploads ชั่วคราว เพื่อให้ loadSlipImage อ่านเจอ (ไม่ต้องยิง HTTP จริง)
	tmpFile := writeTempUpload(t, "fake-slip.jpg", []byte("fake image bytes"))

	data, err := svc.VerifySlip("http://localhost:8000/uploads/"+tmpFile, 500)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !data.Success {
		t.Fatalf("expected data.Success=true")
	}
	if data.TransRef != "REF12345" {
		t.Errorf("expected transRef REF12345, got %q", data.TransRef)
	}
	if !MatchesBankAccount(data, "1234567891234") {
		t.Errorf("expected receiver account xxx-x-x1234-x to match account ending in 1234")
	}
}

func TestVerifySlipApiRejection(t *testing.T) {
	svc := newTestSlipOkService(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"success": false,
			"message": "ยอดเงินไม่ตรงกับสลิป",
		})
	})

	tmpFile := writeTempUpload(t, "fake-slip2.jpg", []byte("fake image bytes"))

	_, err := svc.VerifySlip("http://localhost:8000/uploads/"+tmpFile, 999)
	if err == nil {
		t.Fatal("expected error when SlipOK rejects the slip, got nil")
	}
}

func TestMatchesBankAccount(t *testing.T) {
	cases := []struct {
		name      string
		account   string
		proxy     string
		accountNo string
		promptPay string
		want      bool
	}{
		{"masked tail matches full account", "xxx-x-x1234-x", "", "0123456781234", "", true},
		{"masked tail matches short account", "xxxx1234", "", "1234", "", true},
		{"different tail digits", "xxx-x-x9999-x", "", "0123456781234", "", false},
		{"empty account falls back to proxy", "", "xxx-xxx-x789", "0123456789", "", true},
		{"empty account and proxy trust SlipOK's own validation", "", "", "0123456781234", "", true},
		{"empty expected identifiers never match", "xxx-x-x1234-x", "", "", "", false},
		{"exact match no masking", "0123456781234", "", "0123456781234", "", true},
		// พร้อมเพย์: SlipOK คืนค่ามาใน proxy (โชว์ท้าย) ต้องเทียบกับ PromptPayID ไม่ใช่เลขบัญชี
		{"promptpay proxy matches promptpay id not account", "", "XXXXXXXXX6371", "4812740589", "0898766371", true},
		{"promptpay proxy matches national id promptpay", "", "XXXXXXXXX6371", "4812740589", "1103700126371", true},
		{"promptpay proxy matches neither identifier", "", "XXXXXXXXX9999", "4812740589", "0898766371", false},
		{"promptpay id ignored when account matches", "1234", "", "1234", "0898766371", true},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			data := &SlipOkData{Receiver: SlipOkReceiver{
				Account: SlipOkReceiverAccount{Value: c.account},
				Proxy:   SlipOkReceiverAccount{Value: c.proxy},
			}}
			got := MatchesBankAccount(data, c.accountNo, c.promptPay)
			if got != c.want {
				t.Errorf("MatchesBankAccount(account=%q, proxy=%q, accountNo=%q, promptPay=%q) = %v, want %v", c.account, c.proxy, c.accountNo, c.promptPay, got, c.want)
			}
		})
	}
}
