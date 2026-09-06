package services

import (
	"context"
	"errors"
	"io"
	"log"
)

// ─── ที่เก็บไฟล์ของระบบจำแนกนักเรียนในรูป/วิดีโอ (RawPhoto/RawVideo) ───
//
// แยกเป็น interface (แบบเดียวกับ FaceEngine ใน face_engine.go) เพื่อให้สลับที่เก็บได้
// โดยไม่ต้องรื้อ controller — วันนี้เก็บในเครื่อง (LocalMediaStorage) ถ้าวันหนึ่งย้ายขึ้น
// คลาวด์เจ้าไหน (เช่น S3-compatible อย่าง R2/B2) แค่เพิ่ม implementation ใหม่มาเสียบแทนที่นี่

// MediaKind บอกว่าไฟล์นี้เป็นรูปโพสต์หรือวิดีโอ ใช้แยกโฟลเดอร์ย่อยของแต่ละที่เก็บ
type MediaKind string

const (
	MediaKindPhotoPost MediaKind = "photo-posts"
	MediaKindVideo     MediaKind = "videos"
)

// ErrMediaNotFound คืนเมื่อ storage key ที่ให้มาไม่มีไฟล์จริงอยู่ (ถูกลบไปแล้ว/ไม่เคยมี)
var ErrMediaNotFound = errors.New("ไม่พบไฟล์สื่อที่ระบุ")

// MediaStorage คือหน้าสัญญาที่ controller คุยด้วย ไม่ต้องรู้ว่าไฟล์ไปอยู่ที่ไหนจริง
type MediaStorage interface {
	// Save เขียนไฟล์ลงที่เก็บ แล้วคืน storage key ที่ใช้เปิด/ลบไฟล์นี้ทีหลัง
	//
	// ext ต้องมาจาก controllers.ValidateImageUpload/ValidateVideoUpload เท่านั้น
	// (ตรวจชนิดไฟล์จากเนื้อไฟล์จริงมาแล้ว ไม่ใช่นามสกุลที่ผู้ใช้ตั้งชื่อมาเอง)
	Save(ctx context.Context, kind MediaKind, file io.Reader, ext string) (storageKey string, err error)

	// Open คืนเนื้อไฟล์ + content type ให้ผู้เรียก stream กลับไป — ต้องปิด ReadCloser เองเสมอ
	Open(ctx context.Context, kind MediaKind, storageKey string) (io.ReadCloser, string, error)

	// Delete ลบไฟล์จริงตาม storage key — ไม่พบไฟล์อยู่แล้วถือว่าสำเร็จ (idempotent)
	Delete(ctx context.Context, kind MediaKind, storageKey string) error
}

// NewMediaStorage เลือกที่เก็บไฟล์ตาม environment ที่ตั้งไว้ — ใช้จุดเดียวนี้จากทั้ง
// routes.go และ cmd/serve/main.go (background cleanup job) กันไม่ให้ทั้งสองที่เลือกคนละอย่างกัน
//
// ตั้งค่า R2 ครบ (ดู r2_media_storage.go) จะใช้ R2 ซึ่งอยู่ถาวรข้ามการ redeploy
// ไม่ตั้งค่าไว้เลย fallback ไปเก็บดิสก์เครื่อง (LocalMediaStorage) — ใช้ได้เฉพาะ dev เท่านั้น
// เพราะดิสก์ของ container ส่วนใหญ่เป็น ephemeral ไฟล์จะหายทุกครั้งที่ redeploy
func NewMediaStorage() MediaStorage {
	if r2 := NewR2MediaStorage(); r2 != nil {
		log.Println("ใช้ Cloudflare R2 เป็นที่เก็บไฟล์รูป/วิดีโอโพสต์")
		return r2
	}
	log.Println("ยังไม่ได้ตั้งค่า R2 (R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_BUCKET) — " +
		"ใช้ดิสก์เครื่องเก็บไฟล์รูป/วิดีโอโพสต์ชั่วคราวแทน (ไม่เหมาะกับ production)")
	return NewLocalMediaStorage()
}
