package services

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// stubSlipTransport แทน network จริง: คำขอไป res.cloudinary.com คืนรูปสลิป,
// คำขออื่น (SlipOK API) คืน JSON ที่กำหนด — นับจำนวนครั้งที่ดึงรูปด้วย
type stubSlipTransport struct {
	imageBytes  []byte
	slipOkJSON  []byte
	imageFetches *int
}

func (st stubSlipTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	rec := httptest.NewRecorder()
	if r.URL.Host == "res.cloudinary.com" {
		if st.imageFetches != nil {
			*st.imageFetches++
		}
		rec.WriteHeader(http.StatusOK)
		_, _ = rec.Write(st.imageBytes)
	} else {
		rec.WriteHeader(http.StatusOK)
		_, _ = rec.Write(st.slipOkJSON)
	}
	return rec.Result(), nil
}

func newCloudinarySlipOkService(cloudName string, transport http.RoundTripper) *SlipOkService {
	return &SlipOkService{
		apiKey:    "test-key",
		branchID:  "test-branch",
		baseURL:   "https://slipok.test/api/",
		cloudName: cloudName,
		client:    &http.Client{Transport: transport},
	}
}

// isOwnCloudinaryURL ต้องตรวจแบบ parse จริง (host/scheme/path) ไม่ใช่ substring ที่หลอกได้
func TestIsOwnCloudinaryURL(t *testing.T) {
	cases := []struct {
		name      string
		url       string
		cloudName string
		want      bool
	}{
		{"own cloud https", "https://res.cloudinary.com/koyama/image/upload/v1/slip/x.jpg", "koyama", true},
		{"foreign cloud", "https://res.cloudinary.com/attacker/image/upload/x.jpg", "koyama", false},
		{"http not https", "http://res.cloudinary.com/koyama/slip/x.jpg", "koyama", false},
		{"attacker host embeds substring", "https://attacker.com/res.cloudinary.com/koyama/x.jpg", "koyama", false},
		{"subdomain spoof", "https://res.cloudinary.com.attacker.com/koyama/x.jpg", "koyama", false},
		{"empty cloud name", "https://res.cloudinary.com/koyama/x.jpg", "", false},
		{"garbage url", "://bad", "koyama", false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := isOwnCloudinaryURL(c.url, c.cloudName); got != c.want {
				t.Fatalf("isOwnCloudinaryURL(%q, %q) = %v, want %v", c.url, c.cloudName, got, c.want)
			}
		})
	}
}

// VerifySlip ต้องดึงรูปสลิปจาก Cloudinary ของสถาบันมาตรวจได้ (auto-verify รองรับ Cloudinary)
func TestVerifySlip_FetchesFromOwnCloudinary(t *testing.T) {
	fetches := 0
	slipOkJSON, _ := json.Marshal(map[string]any{
		"success": true,
		"data": map[string]any{
			"success":  true,
			"amount":   500.0,
			"transRef": "REF-CLOUD",
			"receiver": map[string]any{"account": map[string]any{"value": "xxx-x-x1234-x"}},
		},
	})
	svc := newCloudinarySlipOkService("koyama", stubSlipTransport{
		imageBytes:   []byte("cloudinary image bytes"),
		slipOkJSON:   slipOkJSON,
		imageFetches: &fetches,
	})

	data, err := svc.VerifySlip("https://res.cloudinary.com/koyama/image/upload/v1/slip/abc.jpg", 500)
	if err != nil {
		t.Fatalf("VerifySlip กับสลิป Cloudinary ควรสำเร็จ แต่ได้ error: %v", err)
	}
	if !data.Success || data.TransRef != "REF-CLOUD" {
		t.Fatalf("ผลตรวจไม่ถูกต้อง: %+v", data)
	}
	if fetches != 1 {
		t.Fatalf("ควรดึงรูปจาก Cloudinary 1 ครั้ง แต่ดึง %d ครั้ง", fetches)
	}
}

// VerifySlip ต้องไม่ยอมดึงรูปจาก Cloudinary cloud อื่น (กัน SSRF) — ไม่มีการ fetch เกิดขึ้น
func TestVerifySlip_RejectsForeignCloudinary(t *testing.T) {
	fetches := 0
	svc := newCloudinarySlipOkService("koyama", stubSlipTransport{
		imageBytes:   []byte("x"),
		slipOkJSON:   []byte(`{"success":true}`),
		imageFetches: &fetches,
	})

	_, err := svc.VerifySlip("https://res.cloudinary.com/attacker/image/upload/x.jpg", 500)
	if err == nil {
		t.Fatal("สลิปจาก cloud อื่นควรถูกปฏิเสธ แต่กลับสำเร็จ")
	}
	if fetches != 0 {
		t.Fatalf("ต้องไม่ดึงรูปจาก cloud อื่นเลย แต่ดึง %d ครั้ง", fetches)
	}
}

// ไฟล์สลิปจาก Cloudinary ที่ใหญ่เกินเพดาน ต้องถูกปฏิเสธ
func TestVerifySlip_RejectsOversizedCloudinarySlip(t *testing.T) {
	big := bytes.Repeat([]byte("a"), maxSlipImageBytes+10)
	svc := newCloudinarySlipOkService("koyama", stubSlipTransport{
		imageBytes: big,
		slipOkJSON: []byte(`{"success":true}`),
	})

	if _, err := svc.VerifySlip("https://res.cloudinary.com/koyama/slip/big.jpg", 500); err == nil {
		t.Fatal("ไฟล์ใหญ่เกินกำหนดควรถูกปฏิเสธ แต่กลับสำเร็จ")
	}
}
