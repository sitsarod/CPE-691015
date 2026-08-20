package services

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"CPE-691015/internal/models"
)

// ─────────────────────────────────────────────────────────────────────────────
// PhotoFilePath
// ─────────────────────────────────────────────────────────────────────────────

func TestPhotoFilePathFromURL(t *testing.T) {
	got := PhotoFilePath("http://localhost:8000/uploads/faces/face-1-123.jpg")
	want := filepath.Join(facesDir, "face-1-123.jpg")

	if got != want {
		t.Fatalf("ควรได้ %s แต่ได้ %s", want, got)
	}
}

// URL ที่ไม่มีไฟล์ให้ลบต้องคืนค่าว่าง ไม่ใช่พาธมั่ว ๆ
func TestPhotoFilePathReturnsEmptyForNonLocal(t *testing.T) {
	cases := []struct {
		name string
		url  string
	}{
		{"ค่าว่าง", ""},
		{"ช่องว่างล้วน", "   "},
		{"ไฟล์บน Cloudinary", "https://res.cloudinary.com/demo/image/upload/v1/koyama/a.jpg"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := PhotoFilePath(tc.url); got != "" {
				t.Fatalf("ควรได้ค่าว่าง แต่ได้ %s", got)
			}
		})
	}
}

// URL ที่พยายามไต่ออกนอกโฟลเดอร์ต้องถูกตัดเหลือแค่ชื่อไฟล์
//
// ถ้าเทสนี้พัง = คนที่แก้ค่าในฐานได้จะสั่งลบไฟล์นอกโฟลเดอร์รูปได้
// เช่น .env หรือไฟล์ระบบ
func TestPhotoFilePathBlocksTraversal(t *testing.T) {
	evil := []string{
		"http://localhost:8000/uploads/faces/../../../.env",
		"../../../../etc/passwd",
		"/etc/shadow",
	}

	for _, url := range evil {
		got := PhotoFilePath(url)
		if got == "" {
			continue // ถูกปฏิเสธไปแล้ว ก็ถือว่าปลอดภัย
		}

		cleaned := filepath.Clean(got)
		if !strings.HasPrefix(cleaned, filepath.Clean(facesDir)) {
			t.Fatalf("%s หลุดออกนอกโฟลเดอร์รูป: %s", url, cleaned)
		}
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// RemovePhotoFiles
// ─────────────────────────────────────────────────────────────────────────────

// ไฟล์ที่ไม่มีอยู่แล้วต้องไม่ทำให้พัง (เช่นถูกลบไปก่อนหน้า หรือรันซ้ำ)
func TestRemovePhotoFilesToleratesMissing(t *testing.T) {
	// ไม่ควร panic และไม่ควรค้าง
	RemovePhotoFiles([]string{
		"http://localhost:8000/uploads/faces/ไม่มีไฟล์นี้.jpg",
		"",
		"https://res.cloudinary.com/demo/image/upload/v1/a.jpg",
	})
}

// ไฟล์ที่มีอยู่จริงต้องถูกลบออกไป
func TestRemovePhotoFilesDeletesRealFile(t *testing.T) {
	if err := os.MkdirAll(facesDir, 0o755); err != nil {
		t.Fatalf("สร้างโฟลเดอร์ทดสอบไม่สำเร็จ: %v", err)
	}

	path := filepath.Join(facesDir, "test-delete-me.jpg")
	if err := os.WriteFile(path, []byte("ไฟล์ทดสอบ"), 0o644); err != nil {
		t.Fatalf("สร้างไฟล์ทดสอบไม่สำเร็จ: %v", err)
	}
	// กันไฟล์และโฟลเดอร์ค้างถ้าเทสพังกลางคัน
	// (เทสรันในโฟลเดอร์ internal/services โฟลเดอร์ uploads จึงถูกสร้างที่นั่น
	//  ถ้าไม่เก็บกวาดจะมีโฟลเดอร์เปล่าโผล่ใน git status ทุกครั้งที่รันเทส)
	t.Cleanup(func() {
		_ = os.Remove(path)
		_ = os.Remove(facesDir)
		_ = os.Remove(filepath.Dir(facesDir))
	})

	RemovePhotoFiles([]string{"http://localhost:8000/uploads/faces/test-delete-me.jpg"})

	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("ไฟล์ต้องถูกลบไปแล้ว แต่ยังอยู่: %v", err)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// ลบแถวในฐานข้อมูล
// ─────────────────────────────────────────────────────────────────────────────

// ลบรูปของผู้เรียนต้องคืน URL ของไฟล์ที่ต้องตามลบ และต้องลบแถวออกจริง
func TestDeleteCustomerPhotosReturnsFilesAndHardDeletes(t *testing.T) {
	db := newTestDB(t, &models.Photo{})

	db.Create(&models.Photo{CustomerID: 1, PhotoURL: "http://x/uploads/faces/a.jpg"})
	db.Create(&models.Photo{CustomerID: 1, PhotoURL: "http://x/uploads/faces/b.jpg"})
	db.Create(&models.Photo{CustomerID: 2, PhotoURL: "http://x/uploads/faces/c.jpg"})

	files, err := DeleteCustomerPhotos(db, 1)
	if err != nil {
		t.Fatalf("ลบไม่สำเร็จ: %v", err)
	}
	if len(files) != 2 {
		t.Fatalf("ควรคืนไฟล์ 2 รายการ แต่ได้ %d", len(files))
	}

	// ต้องเป็น hard delete — soft delete เท่ากับยังเก็บข้อมูลชีวภาพไว้
	var remaining int64
	db.Unscoped().Model(&models.Photo{}).Where("customer_id = ?", 1).Count(&remaining)
	if remaining != 0 {
		t.Fatalf("แถวต้องถูกลบออกจริง (hard delete) แต่ยังเหลือ %d", remaining)
	}

	// ของคนอื่นต้องไม่โดนหางเลข
	var other int64
	db.Model(&models.Photo{}).Where("customer_id = ?", 2).Count(&other)
	if other != 1 {
		t.Fatalf("รูปของผู้เรียนคนอื่นต้องอยู่ครบ แต่เหลือ %d", other)
	}
}

func TestDeleteCoachPhotos(t *testing.T) {
	db := newTestDB(t, &models.Photo{})

	db.Create(&models.Photo{CoachID: 5, PhotoURL: "http://x/uploads/faces/coach.jpg"})

	files, err := DeleteCoachPhotos(db, 5)
	if err != nil {
		t.Fatalf("ลบไม่สำเร็จ: %v", err)
	}
	if len(files) != 1 {
		t.Fatalf("ควรคืนไฟล์ 1 รายการ แต่ได้ %d", len(files))
	}

	var remaining int64
	db.Unscoped().Model(&models.Photo{}).Where("coach_id = ?", 5).Count(&remaining)
	if remaining != 0 {
		t.Fatalf("แถวต้องถูกลบออกจริง แต่ยังเหลือ %d", remaining)
	}
}

// คนที่ไม่มีรูปเลยต้องไม่ error
func TestDeletePhotosWithNoRows(t *testing.T) {
	db := newTestDB(t, &models.Photo{})

	files, err := DeleteCustomerPhotos(db, 999)
	if err != nil {
		t.Fatalf("ไม่ควร error: %v", err)
	}
	if len(files) != 0 {
		t.Fatalf("ควรได้รายการว่าง แต่ได้ %d", len(files))
	}
}
