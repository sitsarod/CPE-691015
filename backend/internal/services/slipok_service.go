package services

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// maxSlipImageBytes จำกัดขนาดรูปสลิปที่ดึงจาก Cloudinary มาตรวจ (กันไฟล์ใหญ่ผิดปกติ)
const maxSlipImageBytes = 10 << 20 // 10 MB

// SlipOkReceiverAccount คือเลขบัญชีปลายทางที่ SlipOK ส่งกลับมา (บาง digit จะถูก mask)
type SlipOkReceiverAccount struct {
	Value string `json:"value"`
}

type SlipOkReceiver struct {
	DisplayName string                `json:"displayName"`
	Account     SlipOkReceiverAccount `json:"account"`
	// Proxy คือกรณีโอนผ่านพร้อมเพย์ (เบอร์โทร/เลขบัตร ปชช./e-wallet) แทนเลขบัญชีธนาคารตรง ๆ
	// SlipOK จะคืนค่ามาใน proxy แทน account เสมอในกรณีนี้ ต้องเช็คทั้งสองฟิลด์
	Proxy SlipOkReceiverAccount `json:"proxy"`
}

// SlipOkData คือผลลัพธ์การตรวจสลิปจาก SlipOK
type SlipOkData struct {
	Success       bool           `json:"success"`
	Message       string         `json:"message"`
	ReceivingBank string         `json:"receivingBank"`
	SendingBank   string         `json:"sendingBank"`
	TransRef      string         `json:"transRef"`
	TransDate     string         `json:"transDate"`
	TransTime     string         `json:"transTime"`
	Amount        float64        `json:"amount"`
	Receiver      SlipOkReceiver `json:"receiver"`
}

type slipOkResponse struct {
	Success bool       `json:"success"`
	Message string     `json:"message"`
	Data    SlipOkData `json:"data"`
}

const slipOkBaseURL = "https://api.slipok.com/api/line/apikey/"

// SlipOkService เรียกใช้ SlipOK API เพื่อตรวจสอบความถูกต้องของสลิปโอนเงิน
type SlipOkService struct {
	apiKey   string
	branchID string
	client   *http.Client
	baseURL  string // แยกออกมาเป็น field เพื่อให้ test แทนที่ด้วย httptest server ได้ ไม่ต้องยิง SlipOK จริง
	// cloudName = ชื่อ Cloudinary cloud ของสถาบัน (ตั้งเมื่อ deploy เก็บสลิปบน Cloudinary)
	// ใช้อนุญาตให้ดึงรูปสลิปจาก Cloudinary ของเราเองมาตรวจ นอกจากไฟล์ใน /uploads
	cloudName string
}

func NewSlipOkService() *SlipOkService {
	return &SlipOkService{
		apiKey:   os.Getenv("SLIPOK_API_KEY"),
		branchID: os.Getenv("SLIPOK_BRANCH_ID"),
		client:   &http.Client{Timeout: 15 * time.Second},
		baseURL:  slipOkBaseURL,
	}
}

// WithCloudName บอก service ว่า cloud ของสถาบันชื่ออะไร เพื่อให้ดึงสลิปจาก Cloudinary มาตรวจได้
// (เรียกตอน wire router เมื่อ Cloudinary ถูกตั้งค่า) คืน service ตัวเดิมเพื่อ chain ต่อได้
func (s *SlipOkService) WithCloudName(name string) *SlipOkService {
	s.cloudName = name
	return s
}

// Enabled บอกว่าตั้งค่า SlipOK ไว้ครบหรือยัง
func (s *SlipOkService) Enabled() bool {
	return s.apiKey != "" && s.branchID != ""
}

// VerifySlip ส่งรูปสลิปที่ slipURL ไปตรวจสอบกับ SlipOK พร้อมยอดเงินที่คาดไว้ (ใส่ 0 ถ้าไม่ต้องการเช็คยอด)
func (s *SlipOkService) VerifySlip(slipURL string, expectedAmount float64) (*SlipOkData, error) {
	if !s.Enabled() {
		return nil, errors.New("ยังไม่ได้ตั้งค่า SLIPOK_API_KEY / SLIPOK_BRANCH_ID")
	}

	imageBytes, filename, err := s.loadSlipImage(slipURL)
	if err != nil {
		return nil, err
	}

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	part, err := writer.CreateFormFile("files", filename)
	if err != nil {
		return nil, err
	}
	if _, err := part.Write(imageBytes); err != nil {
		return nil, err
	}

	_ = writer.WriteField("log", "true")
	if expectedAmount > 0 {
		_ = writer.WriteField("amount", strconv.FormatFloat(expectedAmount, 'f', -1, 64))
	}

	if err := writer.Close(); err != nil {
		return nil, err
	}

	endpoint := s.baseURL + s.branchID
	req, err := http.NewRequest(http.MethodPost, endpoint, &body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("x-authorization", s.apiKey)

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, errors.New("ไม่สามารถเชื่อมต่อ SlipOK ได้: " + err.Error())
	}
	defer resp.Body.Close()

	var result slipOkResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, errors.New("ไม่สามารถอ่านผลตรวจสอบจาก SlipOK ได้")
	}

	if !result.Success {
		msg := result.Message
		if msg == "" {
			msg = result.Data.Message
		}
		if msg == "" {
			msg = "SlipOK ตรวจสอบสลิปไม่ผ่าน"
		}
		return nil, errors.New(msg)
	}

	return &result.Data, nil
}

// MatchesBankAccount ตรวจว่าผู้รับปลายทางที่ SlipOK ส่งกลับ (เลขบัญชี หรือพร้อมเพย์ proxy ที่ถูก mask บางส่วน)
// ตรงกับบัญชีที่ระบบตั้งไว้หรือไม่ โดยเทียบจากชุดตัวเลขที่มองเห็นได้เท่านั้น
// ถ้า SlipOK ไม่คืนทั้งเลขบัญชีและ proxy มาเลย (พบได้กับบางธนาคาร/บาง proxy type) จะเชื่อผลตรวจของ SlipOK เอง
// เพราะตอนเรียกได้ส่ง log=true ไปแล้ว ซึ่ง SlipOK จะตรวจกับบัญชีที่ผูกไว้ในระบบ SlipOK ให้อยู่แล้ว
func MatchesBankAccount(data *SlipOkData, expectedAccountNo string) bool {
	expectedDigits := digitsOnly(expectedAccountNo)
	if expectedDigits == "" {
		return false
	}

	if accountDigits := digitsOnly(data.Receiver.Account.Value); accountDigits != "" {
		return digitsSuffixMatch(accountDigits, expectedDigits)
	}
	if proxyDigits := digitsOnly(data.Receiver.Proxy.Value); proxyDigits != "" {
		return digitsSuffixMatch(proxyDigits, expectedDigits)
	}

	return true
}

func digitsSuffixMatch(a, b string) bool {
	return strings.HasSuffix(a, b) || strings.HasSuffix(b, a)
}

func digitsOnly(s string) string {
	var b strings.Builder
	for _, r := range s {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// loadSlipImage โหลดไฟล์สลิปมาตรวจ รองรับสองแหล่งเก็บที่ระบบใช้จริง:
//   1. ไฟล์ในเครื่อง (โฟลเดอร์ ./uploads) — อ่านจากดิสก์ตรง ๆ
//   2. Cloudinary ของสถาบัน — ดึงผ่าน HTTP หลังตรวจ host/scheme/path เข้มก่อน (กัน SSRF)
//
// ⚠️ ตั้งใจไม่ fetch URL ภายนอกตามอำเภอใจ เพราะ slip_url มาจาก client ได้โดยตรง
// ถ้าเอาไป http.Get ตรง ๆ ผู้ใช้จะชี้ไปยังปลายทางภายใน (เช่น metadata endpoint / บริการหลังบ้าน)
// แล้วให้เซิร์ฟเวอร์ยิงแทนได้ = ช่องโหว่ SSRF จึงยอมให้ดึงได้เฉพาะ Cloudinary cloud ของเราเท่านั้น
func (s *SlipOkService) loadSlipImage(slipURL string) ([]byte, string, error) {
	// (1) ไฟล์ในเครื่อง
	if _, relative, found := strings.Cut(slipURL, "/uploads/"); found {
		// filepath.Clean บนพาธที่ขึ้นต้นด้วย "/" จะ resolve ../ ทั้งหมดแล้วบังคับให้อยู่ใต้ราก
		// กัน path traversal ไต่ออกนอก uploads (เช่น /uploads/../../.env)
		relative = filepath.Clean("/" + relative)
		localPath := filepath.Join("uploads", relative)
		data, err := os.ReadFile(localPath)
		if err != nil {
			return nil, "", errors.New("ไม่สามารถอ่านรูปสลิปเพื่อตรวจสอบได้")
		}
		return data, filepath.Base(localPath), nil
	}

	// (2) Cloudinary ของสถาบัน (ตรวจเข้มก่อน fetch)
	if isOwnCloudinaryURL(slipURL, s.cloudName) {
		return s.fetchRemoteSlip(slipURL)
	}

	return nil, "", errors.New("ที่อยู่สลิปไม่ถูกต้อง ต้องเป็นไฟล์ที่อัปโหลดในระบบเท่านั้น")
}

// fetchRemoteSlip ดึงรูปสลิปจาก URL (ที่ถูกตรวจว่าเป็น Cloudinary ของเราแล้ว) มาเป็น bytes
// พร้อมจำกัดขนาดกันไฟล์ใหญ่ผิดปกติ
func (s *SlipOkService) fetchRemoteSlip(rawURL string) ([]byte, string, error) {
	req, err := http.NewRequest(http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, "", errors.New("ที่อยู่สลิปไม่ถูกต้อง")
	}

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, "", errors.New("ไม่สามารถดึงรูปสลิปจาก Cloudinary เพื่อตรวจสอบได้")
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, "", errors.New("ไม่สามารถดึงรูปสลิปจาก Cloudinary เพื่อตรวจสอบได้")
	}

	// อ่านเกินเพดานไป 1 ไบต์เพื่อตรวจจับว่าไฟล์ใหญ่เกินกำหนด
	data, err := io.ReadAll(io.LimitReader(resp.Body, maxSlipImageBytes+1))
	if err != nil {
		return nil, "", errors.New("ไม่สามารถอ่านรูปสลิปเพื่อตรวจสอบได้")
	}
	if len(data) > maxSlipImageBytes {
		return nil, "", errors.New("ไฟล์สลิปมีขนาดใหญ่เกินกำหนด")
	}

	// ตั้งชื่อไฟล์จาก path ของ URL (SlipOK ต้องการชื่อไฟล์ในฟอร์ม multipart)
	name := "slip.jpg"
	if u, err := url.Parse(rawURL); err == nil {
		if base := path.Base(u.Path); base != "." && base != "/" && base != "" {
			name = base
		}
	}
	return data, name, nil
}

// isOwnCloudinaryURL ตรวจว่า URL เป็นของ Cloudinary cloud ที่ระบุแบบเข้มงวด
//
// parse จริงแล้วเทียบ scheme/host/path (ไม่ใช้ strings.Contains ที่หลอกได้ด้วย
// URL แบบ https://attacker.com/res.cloudinary.com/<cloud>/x.jpg) — สำคัญเพราะฟังก์ชันนี้
// เป็นด่านตัดสินว่าจะยอมให้เซิร์ฟเวอร์ยิง HTTP ไปที่ URL นั้นหรือไม่ (กัน SSRF)
func isOwnCloudinaryURL(rawURL, cloudName string) bool {
	if cloudName == "" {
		return false
	}
	u, err := url.Parse(rawURL)
	if err != nil {
		return false
	}
	return u.Scheme == "https" &&
		u.Host == "res.cloudinary.com" &&
		strings.HasPrefix(u.Path, "/"+cloudName+"/")
}
