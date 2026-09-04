package services

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"
)

// ─── ตัวแปลงรูปใบหน้าเป็น embedding ───
//
// แยกเป็น interface เพราะโมเดลสำเร็จรูปของ InsightFace (buffalo_l) มี license
// เป็น non-commercial ถ้าวันหนึ่งต้องเปลี่ยนโมเดลหรือผู้ให้บริการ จะได้เปลี่ยน
// แค่ตัว implementation ไม่ต้องรื้อ worker และตรรกะเทียบใบหน้าที่เรียกใช้

// FaceEmbedResult คือผลจากการวิเคราะห์รูปหนึ่งใบ
//
// ⚠️ service ไม่ตัดสินว่ารูปนี้ผ่านหรือไม่ผ่าน — คืนข้อเท็จจริงมาให้ Go ตัดสินเอง
// (กี่หน้า คุณภาพเท่าไร) เพื่อให้เกณฑ์การตัดสินอยู่ที่เดียวและแก้ได้โดยไม่ต้อง deploy Python ใหม่
type FaceEmbedResult struct {
	Found     bool
	FaceCount int
	Embedding []float32
	Quality   float64
	Model     string
}

type FaceEngine interface {
	// Embed รับ "เนื้อไฟล์รูป" ดิบ ๆ (ไม่ใช่ base64 — ตัว implementation จัดการเอง)
	Embed(ctx context.Context, image []byte) (*FaceEmbedResult, error)
	// Enabled บอกว่าตั้งค่าครบพร้อมใช้งานไหม
	Enabled() bool
}

var (
	ErrFaceEngineDisabled  = errors.New("ยังไม่ได้ตั้งค่าบริการวิเคราะห์ใบหน้า")
	ErrFaceEngineBadResult = errors.New("บริการวิเคราะห์ใบหน้าคืนค่าที่ใช้ไม่ได้")
)

// faceEmbedDimensions คือจำนวนมิติที่คอลัมน์ vector(512) รับได้
// ถ้าเปลี่ยนโมเดลเป็นตัวที่คืนมิติอื่น ต้องแก้ทั้งค่านี้และชนิดคอลัมน์พร้อมกัน
const faceEmbedDimensions = 512

// faceEngineTimeout — เกินแล้วตอบ error ให้ระบบไปใช้ QR ต่อ ไม่ปล่อยให้รอค้าง
const faceEngineTimeout = 10 * time.Second

// HTTPFaceEngine คุยกับ Python face-service ผ่าน HTTP
type HTTPFaceEngine struct {
	baseURL string
	secret  string
	client  *http.Client
}

// NewHTTPFaceEngine อ่านค่าจาก environment
//
// ⚠️ FACE_SERVICE_URL ต้องเป็นที่อยู่ภายในเท่านั้น (private network ของ Railway
// หรือชื่อ service ใน docker compose) service นั้นห้ามมีโดเมนสาธารณะ
//
// ตั้งค่าไม่ครบจะคืน engine ที่ Enabled() = false แทนที่จะ panic
// เพื่อให้ระบบส่วนอื่น (เช่นเช็คชื่อด้วย QR) ยังทำงานได้ตามปกติ
func NewHTTPFaceEngine() *HTTPFaceEngine {
	e := &HTTPFaceEngine{
		baseURL: os.Getenv("FACE_SERVICE_URL"),
		secret:  os.Getenv("FACE_SERVICE_SECRET"),
		client:  &http.Client{Timeout: faceEngineTimeout},
	}
	if !e.Enabled() {
		log.Println("face-service ยังไม่ถูกตั้งค่า — รูปใบหน้าจะค้างที่สถานะ pending จนกว่าจะตั้งค่าครบ")
	}
	return e
}

func (e *HTTPFaceEngine) Enabled() bool {
	return e.baseURL != "" && e.secret != ""
}

type embedRequest struct {
	Image string `json:"image"`
}

type embedResponse struct {
	Found     bool      `json:"found"`
	FaceCount int       `json:"face_count"`
	Embedding []float32 `json:"embedding"`
	Quality   float64   `json:"quality"`
	Model     string    `json:"model"`
}

func (e *HTTPFaceEngine) Embed(ctx context.Context, image []byte) (*FaceEmbedResult, error) {
	if !e.Enabled() {
		return nil, ErrFaceEngineDisabled
	}

	body, err := json.Marshal(embedRequest{Image: base64.StdEncoding.EncodeToString(image)})
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, e.baseURL+"/embed", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Service-Key", e.secret)

	resp, err := e.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("เรียก face-service ไม่สำเร็จ: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("face-service ตอบ HTTP %d", resp.StatusCode)
	}

	var out embedResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, fmt.Errorf("%w: อ่าน response ไม่ได้", ErrFaceEngineBadResult)
	}

	// ตรวจสัญญาก่อนส่งต่อ — ถ้าโมเดลถูกเปลี่ยนแล้วคืนมิติไม่ตรง
	// การปล่อยผ่านจะทำให้เขียนลงคอลัมน์ vector(512) ไม่ได้และพังที่ชั้นฐานข้อมูลแทน
	// ซึ่งไล่หาต้นเหตุยากกว่ามาก
	if out.Found && len(out.Embedding) != faceEmbedDimensions {
		return nil, fmt.Errorf("%w: ได้ embedding %d มิติ แต่ต้องการ %d",
			ErrFaceEngineBadResult, len(out.Embedding), faceEmbedDimensions)
	}

	return &FaceEmbedResult{
		Found:     out.Found,
		FaceCount: out.FaceCount,
		Embedding: out.Embedding,
		Quality:   out.Quality,
		Model:     out.Model,
	}, nil
}

// ยืนยันตอนคอมไพล์ว่า implementation ยังตรงกับ interface
var _ FaceEngine = (*HTTPFaceEngine)(nil)
