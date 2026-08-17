package controllers

import (
	"errors"
	"fmt"
	"mime/multipart"
	"net/http"
)

// ─────────────────────────────────────────────────────────────────────────────
// ตรวจไฟล์ที่ผู้ใช้อัปโหลดก่อนบันทึกลงเครื่อง
//
// ─── ช่องโหว่ที่แก้ (stored XSS) ───
//
// โค้ดเดิมตั้งชื่อไฟล์ที่บันทึกโดยเอานามสกุลมาจากชื่อไฟล์ที่ client ส่งมาตรง ๆ
//
//	filename := fmt.Sprintf("face-%d-%d%s", id, time.Now().UnixNano(), filepath.Ext(file.Filename))
//
// แปลว่าอัปโหลดไฟล์ชื่อ evil.html ขึ้นมา จะได้ไฟล์ face-1-123.html บนเซิร์ฟเวอร์
// ซึ่งถูกเสิร์ฟออกไปที่ /uploads/faces/face-1-123.html ผ่าน r.Static
//
// นั่นคือ origin เดียวกับหน้าเว็บ สคริปต์ในไฟล์นั้นจึงอ่าน localStorage ได้
// ซึ่งเป็นที่ที่ระบบเก็บ token ไว้พอดี = ขโมยบัญชีคนที่หลอกให้เปิดลิงก์ได้
// ไฟล์ .svg ก็อันตรายแบบเดียวกันเพราะฝัง <script> ได้
//
// ─── วิธีแก้ ───
//
// ไม่เชื่อทั้งชื่อไฟล์และ Content-Type ที่ client ส่งมา เพราะปลอมได้ทั้งคู่
// แต่อ่านเนื้อไฟล์จริง 512 ไบต์แรกมาดูว่าเป็นอะไรกันแน่ แล้ว
// "ตั้งนามสกุลเองจากผลที่ตรวจได้" ไม่ใช่จากที่ผู้ใช้ส่งมา
//
// ผลพลอยได้คือกันไฟล์ที่เปลี่ยนนามสกุลมาหลอกด้วย เช่น evil.html ที่ถูกเปลี่ยน
// ชื่อเป็น photo.jpg จะถูกตรวจเจอว่าเนื้อในเป็น text/html แล้วปฏิเสธไป
// ─────────────────────────────────────────────────────────────────────────────

const (
	// MaxImageUploadBytes เพดานขนาดรูป — รูปถ่ายจากมือถือปกติไม่เกิน 5 MB
	// มีไว้กันคนอัปโหลดไฟล์ใหญ่ ๆ รัว ๆ จนดิสก์เต็ม
	MaxImageUploadBytes = 5 << 20 // 5 MB

	// MaxVideoUploadBytes เพดานขนาดวิดีโอฝึกซ้อม
	MaxVideoUploadBytes = 200 << 20 // 200 MB

	// sniffLen คือจำนวนไบต์ที่ต้องอ่านเพื่อเดาชนิดไฟล์
	// 512 เป็นค่าที่ http.DetectContentType กำหนดไว้ ไม่ควรเปลี่ยน
	sniffLen = 512
)

var (
	ErrUploadTooLarge   = errors.New("ไฟล์มีขนาดใหญ่เกินกำหนด")
	ErrUploadBadType    = errors.New("ชนิดไฟล์นี้ไม่รองรับ")
	ErrUploadUnreadable = errors.New("ไม่สามารถอ่านไฟล์ที่อัปโหลดได้")
)

// imageExtByType จับคู่ชนิดไฟล์ที่ตรวจได้ กับนามสกุลที่จะใช้บันทึกจริง
//
// ⚠️ อย่าเพิ่ม image/svg+xml เข้ามาเด็ดขาด — ไฟล์ SVG ฝัง <script> ได้
// จึงเป็นช่องทาง XSS เหมือนไฟล์ HTML ทั้งที่ดูเผิน ๆ เหมือนเป็นแค่รูป
var imageExtByType = map[string]string{
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/webp": ".webp",
	"image/gif":  ".gif",
}

// videoExtByType จับคู่ชนิดวิดีโอที่รองรับกับนามสกุลที่จะใช้บันทึก
//
// หมายเหตุ: ไฟล์ .mov ส่วนใหญ่ใช้โครงสร้างเดียวกับ mp4 จึงถูกตรวจเป็น video/mp4
// แล้วบันทึกเป็น .mp4 ซึ่งเปิดดูได้ปกติ ไม่ถือว่าผิด
var videoExtByType = map[string]string{
	"video/mp4":  ".mp4",
	"video/webm": ".webm",
	"video/avi":  ".avi",
}

// ValidateImageUpload ตรวจว่าไฟล์เป็นรูปจริงและขนาดไม่เกิน แล้วคืนนามสกุลที่ควรใช้บันทึก
//
// ห้ามเอา filepath.Ext(fh.Filename) ไปใช้ ให้ใช้ค่าที่ฟังก์ชันนี้คืนมาเท่านั้น
func ValidateImageUpload(fh *multipart.FileHeader) (string, error) {
	return validateUpload(fh, MaxImageUploadBytes, imageExtByType)
}

// ValidateVideoUpload ตรวจว่าไฟล์เป็นวิดีโอจริงและขนาดไม่เกิน แล้วคืนนามสกุลที่ควรใช้บันทึก
func ValidateVideoUpload(fh *multipart.FileHeader) (string, error) {
	return validateUpload(fh, MaxVideoUploadBytes, videoExtByType)
}

// validateUpload ตรวจขนาดและชนิดไฟล์จากเนื้อไฟล์จริง
func validateUpload(fh *multipart.FileHeader, maxBytes int64, allowed map[string]string) (string, error) {
	if fh.Size > maxBytes {
		return "", fmt.Errorf("%w (สูงสุด %d MB)", ErrUploadTooLarge, maxBytes>>20)
	}
	if fh.Size == 0 {
		return "", ErrUploadUnreadable
	}

	// เปิดไฟล์เพื่ออ่านหัวไฟล์เท่านั้น แล้วปิดทันที
	// ตัวที่บันทึกจริง (SaveUploadedFile) จะเปิดใหม่เอง จึงไม่ต้องกังวลเรื่องตำแหน่งอ่าน
	src, err := fh.Open()
	if err != nil {
		return "", ErrUploadUnreadable
	}
	defer src.Close()

	head := make([]byte, sniffLen)
	n, err := src.Read(head)
	if n == 0 && err != nil {
		return "", ErrUploadUnreadable
	}

	// DetectContentType ดูจากลายเซ็นไบต์ต้นไฟล์ ไม่ได้ดูชื่อไฟล์หรือ header ที่ client ส่งมา
	// ไฟล์ที่ไม่รู้จักจะได้ application/octet-stream ซึ่งไม่อยู่ใน allowed อยู่แล้ว
	detected := http.DetectContentType(head[:n])

	ext, ok := allowed[detected]
	if !ok {
		return "", fmt.Errorf("%w (ตรวจพบว่าเป็น %s)", ErrUploadBadType, detected)
	}
	return ext, nil
}

// UploadErrorStatus แปลง error จากการตรวจไฟล์เป็น HTTP status ที่ตรงความหมาย
//
// ทั้งหมดเป็น 4xx เพราะเป็นความผิดของสิ่งที่ผู้ใช้ส่งมา ไม่ใช่ระบบพัง
// (413 มีความหมายเฉพาะว่า "ไฟล์ใหญ่เกิน" ซึ่งช่วยให้ผู้ใช้รู้ว่าต้องย่อไฟล์ก่อน)
func UploadErrorStatus(err error) int {
	switch {
	case errors.Is(err, ErrUploadTooLarge):
		return http.StatusRequestEntityTooLarge
	default:
		return http.StatusBadRequest
	}
}
