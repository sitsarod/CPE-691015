package services

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"testing"
)

// cleanupPrivateMediaRoot ล้างโฟลเดอร์ทดสอบทิ้งหลังแต่ละเทส กันโฟลเดอร์เปล่าค้างใน
// internal/services (ที่ที่เทสรันจริง) โผล่ใน git status — เหตุผลเดียวกับใน photo_storage_test.go
func cleanupPrivateMediaRoot(t *testing.T) {
	t.Cleanup(func() {
		_ = os.RemoveAll(privateMediaRoot)
	})
}

func TestLocalMediaStorageSaveOpenDelete(t *testing.T) {
	cleanupPrivateMediaRoot(t)
	s := NewLocalMediaStorage()
	ctx := context.Background()

	want := []byte("เนื้อไฟล์ทดสอบ")
	key, err := s.Save(ctx, MediaKindPhotoPost, bytes.NewReader(want), ".jpg")
	if err != nil {
		t.Fatalf("Save ไม่สำเร็จ: %v", err)
	}
	if key == "" {
		t.Fatal("ควรได้ storage key แต่ได้ค่าว่าง")
	}

	rc, contentType, err := s.Open(ctx, MediaKindPhotoPost, key)
	if err != nil {
		t.Fatalf("Open ไม่สำเร็จ: %v", err)
	}
	got, err := io.ReadAll(rc)
	rc.Close()
	if err != nil {
		t.Fatalf("อ่านไฟล์ไม่สำเร็จ: %v", err)
	}
	if !bytes.Equal(got, want) {
		t.Fatalf("เนื้อไฟล์ไม่ตรง ได้ %q ต้องการ %q", got, want)
	}
	if contentType != "image/jpeg" {
		t.Fatalf("content type ควรเป็น image/jpeg แต่ได้ %s", contentType)
	}

	if err := s.Delete(ctx, MediaKindPhotoPost, key); err != nil {
		t.Fatalf("Delete ไม่สำเร็จ: %v", err)
	}

	if _, _, err := s.Open(ctx, MediaKindPhotoPost, key); !errors.Is(err, ErrMediaNotFound) {
		t.Fatalf("หลังลบแล้วควรได้ ErrMediaNotFound แต่ได้ %v", err)
	}
}

// storage key ที่ไม่ตรงกับรูปแบบที่ระบบสร้างเอง (เช่นถูกแก้ในฐานข้อมูลให้ไต่พาธออกนอกโฟลเดอร์)
// ต้องถูกปฏิเสธเสมอ — ถ้าเทสนี้พัง = อ่าน/ลบไฟล์นอกโฟลเดอร์ private-media ได้ เช่น .env
func TestLocalMediaStorageRejectsPathTraversal(t *testing.T) {
	cleanupPrivateMediaRoot(t)
	s := NewLocalMediaStorage()
	ctx := context.Background()

	evil := []string{
		"../../../../etc/passwd",
		"../secret.env",
		"a/b.jpg",
		"/etc/shadow",
		"",
	}

	for _, key := range evil {
		if _, _, err := s.Open(ctx, MediaKindPhotoPost, key); err == nil {
			t.Fatalf("Open(%q) ควรถูกปฏิเสธ แต่ผ่าน", key)
		}
		if err := s.Delete(ctx, MediaKindPhotoPost, key); err == nil {
			t.Fatalf("Delete(%q) ควรถูกปฏิเสธ แต่ผ่าน", key)
		}
	}
}

func TestLocalMediaStorageOpenMissingReturnsErrMediaNotFound(t *testing.T) {
	cleanupPrivateMediaRoot(t)
	s := NewLocalMediaStorage()

	_, _, err := s.Open(context.Background(), MediaKindVideo, "ไม่มีไฟล์นี้จริง.mp4")
	if !errors.Is(err, ErrMediaNotFound) {
		t.Fatalf("ควรได้ ErrMediaNotFound แต่ได้ %v", err)
	}
}

// ลบไฟล์ที่ไม่มีอยู่แล้ว (ถูกลบไปก่อนหน้า/รันซ้ำ) ต้องไม่ error — idempotent
func TestLocalMediaStorageDeleteMissingIsIdempotent(t *testing.T) {
	cleanupPrivateMediaRoot(t)
	s := NewLocalMediaStorage()

	if err := s.Delete(context.Background(), MediaKindVideo, "ไม่มีไฟล์นี้จริง.mp4"); err != nil {
		t.Fatalf("ลบไฟล์ที่ไม่มีอยู่ไม่ควร error แต่ได้: %v", err)
	}
}

// สองไฟล์คนละ kind กัน ตั้งชื่อเดียวกันก็ไม่ชนกัน เพราะแยกโฟลเดอร์ย่อยตาม kind
func TestLocalMediaStorageSeparatesKinds(t *testing.T) {
	cleanupPrivateMediaRoot(t)
	s := NewLocalMediaStorage()
	ctx := context.Background()

	photoKey, err := s.Save(ctx, MediaKindPhotoPost, bytes.NewReader([]byte("photo")), ".jpg")
	if err != nil {
		t.Fatalf("Save photo ไม่สำเร็จ: %v", err)
	}

	// เปิดคีย์ของรูปผ่านฝั่งวิดีโอต้องไม่เจอ (คนละโฟลเดอร์กัน)
	if _, _, err := s.Open(ctx, MediaKindVideo, photoKey); !errors.Is(err, ErrMediaNotFound) {
		t.Fatalf("ควรได้ ErrMediaNotFound เพราะคนละ kind กัน แต่ได้ %v", err)
	}
}
