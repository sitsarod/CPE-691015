package services

import (
	"context"
	"errors"
	"io"
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
