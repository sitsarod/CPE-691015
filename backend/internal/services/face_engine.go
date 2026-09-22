package services

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
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

// FaceEmbedAllResult คือผลจากการวิเคราะห์ "ทุกใบหน้า" ในรูปหนึ่งใบ
//
// ใช้ตอนแท็กนักเรียนในรูปหมู่ที่มีหลายคน — ต่างจาก Embed ที่คืนใบหน้าเดียว
// (ใบที่ใหญ่ที่สุด) ซึ่งออกแบบมาสำหรับเช็คชื่อทีละคน
type FaceEmbedAllResult struct {
	FaceCount int
	Faces     []DetectedFaceEmbedding
	Model     string
	// FallbackFrame มีค่าเฉพาะวิดีโอที่ "ไม่เจอใบหน้าเลยสักหน้าเดียว" (Faces ว่างเปล่า) — เฟรม
	// ตัวแทนหนึ่งเฟรมจากคลิป (ไม่มี bbox กำกับ เพราะไม่เจอตำแหน่งใบหน้าให้อ้างอิง) ให้โค้ช/แอดมิน
	// เห็นอย่างน้อยว่าคลิปนี้มีเนื้อหาอะไร ดีกว่าไม่มีอะไรให้ดูอ้างอิงเลย (ดู DetectStudentsInVideo)
	FallbackFrame string
}

// DetectedFaceEmbedding คือหนึ่งใบหน้าที่เจอในรูป/วิดีโอ — ยังไม่รู้ว่าเป็นใคร
type DetectedFaceEmbedding struct {
	Embedding []float32
	Quality   float64
	// BBox คือกรอบใบหน้า [x1, y1, x2, y2] เป็นพิกเซล — ของรูปต้นฉบับ (ฝั่งรูป) หรือของ FrameImage
	// ด้านล่าง (ฝั่งวิดีโอ — bbox สเกลตามรูปที่ย่อแล้ว ไม่ใช่เฟรมต้นฉบับ) ใช้วาดกรอบ/ชื่อทับตอน
	// โค้ชตรวจทาน (ไม่ได้ฝังลงไฟล์จริง) nil ได้ถ้า face-service รุ่นเก่าไม่ส่งมา
	BBox []float64
	// FrameImage คือเฟรมวิดีโอที่ย่อขนาดแล้ว (JPEG base64) ที่ตรวจพบหน้านี้ — มีเฉพาะที่มาจาก
	// วิดีโอ (EmbedAllVideo) ฝั่งรูปปล่อยว่างเสมอเพราะหน้าเว็บมีไฟล์รูปต้นฉบับอยู่แล้ว
	// วาดกรอบทับเองได้โดยไม่ต้องใช้ค่านี้ (bbox ข้างบนอ้างอิงรูปนี้เสมอ)
	FrameImage string
}

type FaceEngine interface {
	// Embed รับ "เนื้อไฟล์รูป" ดิบ ๆ (ไม่ใช่ base64 — ตัว implementation จัดการเอง)
	Embed(ctx context.Context, image []byte) (*FaceEmbedResult, error)
	// EmbedAll คืนทุกใบหน้าที่เจอในรูป (ไม่ใช่แค่ใบที่ใหญ่ที่สุดเหมือน Embed)
	EmbedAll(ctx context.Context, image []byte) (*FaceEmbedAllResult, error)
	// EmbedAllVideo เหมือน EmbedAll แต่รับ "เนื้อไฟล์วิดีโอ" ดิบ ๆ — face-service สุ่มตรวจ
	// หลายเฟรมแล้วรวมใบหน้าที่เจอทั้งหมดเป็นลิสต์เดียว (รูปแบบผลลัพธ์เหมือน EmbedAll ทุกอย่าง)
	EmbedAllVideo(ctx context.Context, video []byte) (*FaceEmbedAllResult, error)
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

// faceEngineVideoTimeout — วิดีโอหนักได้ถึง 200MB และต้องถอดหลายเฟรมมาตรวจ (ดู
// MAX_VIDEO_SAMPLE_FRAMES ฝั่ง Python) ช้ากว่ารูปเดี่ยวมาก ใช้ client แยกต่างหากจาก
// faceEngineTimeout เพื่อไม่ให้กระทบเวลารอของเช็คชื่อ/แท็กรูปที่ต้องไวกว่านี้มาก
const faceEngineVideoTimeout = 90 * time.Second

// HTTPFaceEngine คุยกับ Python face-service ผ่าน HTTP
type HTTPFaceEngine struct {
	baseURL     string
	secret      string
	client      *http.Client
	videoClient *http.Client
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
		baseURL:     os.Getenv("FACE_SERVICE_URL"),
		secret:      os.Getenv("FACE_SERVICE_SECRET"),
		client:      &http.Client{Timeout: faceEngineTimeout},
		videoClient: &http.Client{Timeout: faceEngineVideoTimeout},
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

type embedAllResponse struct {
	FaceCount int    `json:"face_count"`
	Model     string `json:"model"`
	Faces     []struct {
		Embedding  []float32 `json:"embedding"`
		Quality    float64   `json:"quality"`
		BBox       []float64 `json:"bbox"`
		FrameImage string    `json:"frame_image"` // มีค่าเฉพาะที่มาจาก /embed-all-video
	} `json:"faces"`
	FallbackFrame string `json:"fallback_frame"` // มีค่าเฉพาะ /embed-all-video ตอน Faces ว่างเปล่า
}

// postJSON ยิงรูป/วิดีโอไปที่ path ที่กำหนดแล้ว decode ผลลงใน out
// (ใช้ร่วมกันทั้ง /embed, /embed-all, /embed-all-video — ต่างกันแค่ path, client (timeout
// ต่างกันสำหรับวิดีโอ) และรูปแบบผลลัพธ์)
func (e *HTTPFaceEngine) postJSON(ctx context.Context, client *http.Client, path string, payload []byte, out any) error {
	if !e.Enabled() {
		return ErrFaceEngineDisabled
	}

	body, err := json.Marshal(embedRequest{Image: base64.StdEncoding.EncodeToString(payload)})
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, e.baseURL+path, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Service-Key", e.secret)

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("เรียก face-service ไม่สำเร็จ: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		// อ่าน body มาด้วย (จำกัดไว้กันตอบกลับมาใหญ่ผิดปกติ) — detail จาก HTTPException ฝั่ง Python
		// (เช่น "video too large" ต่างจาก "invalid base64") ช่วยไล่สาเหตุได้ตรงกว่าดูแค่ status code เปล่า ๆ
		detail, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return fmt.Errorf("face-service ตอบ HTTP %d: %s", resp.StatusCode, detail)
	}

	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return fmt.Errorf("%w: อ่าน response ไม่ได้", ErrFaceEngineBadResult)
	}
	return nil
}

func (e *HTTPFaceEngine) Embed(ctx context.Context, image []byte) (*FaceEmbedResult, error) {
	var out embedResponse
	if err := e.postJSON(ctx, e.client, "/embed", image, &out); err != nil {
		return nil, err
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

// EmbedAll คืนทุกใบหน้าที่เจอในรูป
//
// ⚠️ หน้าที่มิติไม่ตรงจะถูก "ข้าม" ไม่ใช่ทำให้ทั้งรูปล้มเหลว — ต่างจาก Embed ที่ผลลัพธ์
// มีใบเดียวจึงต้องล้มทั้งคำขอ ที่นี่รูปหนึ่งใบมีหลายหน้า การทิ้งทั้งรูปเพราะหน้าเดียวเพี้ยน
// ทำให้โค้ชแท็กคนที่เหลือไม่ได้เลยทั้งที่ข้อมูลใช้ได้
func (e *HTTPFaceEngine) EmbedAll(ctx context.Context, image []byte) (*FaceEmbedAllResult, error) {
	var out embedAllResponse
	if err := e.postJSON(ctx, e.client, "/embed-all", image, &out); err != nil {
		return nil, err
	}
	return parseEmbedAllResponse(out), nil
}

// EmbedAllVideo เหมือน EmbedAll แต่รับวิดีโอ — ใช้ videoClient (timeout ยาวกว่ามาก) เพราะ
// face-service ต้องถอดหลายเฟรมมาตรวจ ไม่ใช่แค่รูปเดียว ช้ากว่าปกติมาก
func (e *HTTPFaceEngine) EmbedAllVideo(ctx context.Context, video []byte) (*FaceEmbedAllResult, error) {
	var out embedAllResponse
	if err := e.postJSON(ctx, e.videoClient, "/embed-all-video", video, &out); err != nil {
		return nil, err
	}
	return parseEmbedAllResponse(out), nil
}

// parseEmbedAllResponse กรองหน้าที่มิติ embedding ไม่ตรงทิ้ง (โมเดลถูกเปลี่ยนโดยไม่รู้ตัว) —
// ใช้ร่วมกันทั้ง EmbedAll (รูป) และ EmbedAllVideo (วิดีโอ) เพราะรูปแบบผลลัพธ์เหมือนกันทุกอย่าง
//
// ⚠️ หน้าที่มิติไม่ตรงจะถูก "ข้าม" ไม่ใช่ทำให้ทั้งคำขอล้มเหลว — รูป/วิดีโอมีได้หลายหน้า
// การทิ้งทั้งหมดเพราะหน้าเดียวเพี้ยนทำให้โค้ชแท็กคนที่เหลือไม่ได้เลยทั้งที่ข้อมูลใช้ได้
func parseEmbedAllResponse(out embedAllResponse) *FaceEmbedAllResult {
	faces := make([]DetectedFaceEmbedding, 0, len(out.Faces))
	for _, f := range out.Faces {
		if len(f.Embedding) != faceEmbedDimensions {
			continue
		}
		faces = append(faces, DetectedFaceEmbedding{Embedding: f.Embedding, Quality: f.Quality, BBox: f.BBox, FrameImage: f.FrameImage})
	}

	return &FaceEmbedAllResult{
		FaceCount:     out.FaceCount,
		Faces:         faces,
		Model:         out.Model,
		FallbackFrame: out.FallbackFrame,
	}
}

// ยืนยันตอนคอมไพล์ว่า implementation ยังตรงกับ interface
var _ FaceEngine = (*HTTPFaceEngine)(nil)
