package services

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"mime"
	"os"
	"path/filepath"
)

// privateMediaRoot คือโฟลเดอร์รากที่เก็บไฟล์ของระบบจำแนกนักเรียนในรูป/วิดีโอ
//
// ⚠️ ต้องอยู่นอก "./uploads" เสมอ — routes.go เปิด r.Static("/uploads", "./uploads")
// เสิร์ฟทุกไฟล์ในนั้นแบบ public ไม่เช็คสิทธิ์เลย ถ้าเผลอเอาไฟล์มาไว้ในนั้นเท่ากับ
// เปิดให้ใครก็เปิดดูได้ทันที (เนื้อหาผูกกับนักเรียนที่ consent เก็บข้อมูลใบหน้าไว้ตาม PDPA)
//
// ต้องเข้าถึงไฟล์ผ่าน MediaStorage.Open ที่ตัว controller เช็คสิทธิ์ก่อนเสมอเท่านั้น
const privateMediaRoot = "./private-media"

// LocalMediaStorage เก็บไฟล์ไว้ในดิสก์ของเครื่องที่รันเซิร์ฟเวอร์เอง ไม่ผ่าน third-party ใดๆ
//
// ข้อแลก: ถ้า deploy บนแพลตฟอร์มที่ดิสก์ของ container เป็น ephemeral (เช่น Railway ที่ไม่ได้
// ผูก persistent volume) ไฟล์จะหายทุกครั้งที่ redeploy — ต้องผูก volume เข้ากับ privateMediaRoot เอง
// ก่อนใช้งานจริงบน production
type LocalMediaStorage struct{}

func NewLocalMediaStorage() *LocalMediaStorage {
	return &LocalMediaStorage{}
}

func (s *LocalMediaStorage) dir(kind MediaKind) string {
	return filepath.Join(privateMediaRoot, string(kind))
}

// Save เขียนไฟล์ลงโฟลเดอร์ย่อยตาม kind ตั้งชื่อไฟล์แบบสุ่ม (กันเดา/ไล่ enumerate storage key)
func (s *LocalMediaStorage) Save(_ context.Context, kind MediaKind, file io.Reader, ext string) (string, error) {
	dir := s.dir(kind)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return "", fmt.Errorf("สร้างโฟลเดอร์เก็บไฟล์ไม่สำเร็จ: %w", err)
	}

	name, err := randomMediaFilename(ext)
	if err != nil {
		return "", err
	}

	dst, err := os.OpenFile(filepath.Join(dir, name), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o640)
	if err != nil {
		return "", fmt.Errorf("สร้างไฟล์ปลายทางไม่สำเร็จ: %w", err)
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		// เขียนไม่จบ ต้องไม่เหลือไฟล์ครึ่งๆ กลางๆ ค้างไว้ให้ใครมาเปิดแล้วได้ไฟล์เสีย
		os.Remove(filepath.Join(dir, name))
		return "", fmt.Errorf("บันทึกไฟล์ไม่สำเร็จ: %w", err)
	}

	return name, nil
}

// Open เปิดไฟล์ตาม storage key ให้ผู้เรียก stream กลับไป — ต้องปิด ReadCloser เอง
func (s *LocalMediaStorage) Open(_ context.Context, kind MediaKind, storageKey string) (io.ReadCloser, string, error) {
	path, err := s.safePath(kind, storageKey)
	if err != nil {
		return nil, "", err
	}

	f, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, "", ErrMediaNotFound
		}
		return nil, "", fmt.Errorf("เปิดไฟล์ไม่สำเร็จ: %w", err)
	}

	contentType := mime.TypeByExtension(filepath.Ext(storageKey))
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	return f, contentType, nil
}

// Delete ลบไฟล์จริง — ไม่พบไฟล์อยู่แล้วถือว่าสำเร็จ (idempotent เหมือน DestroyPrivateImage ของ Cloudinary)
func (s *LocalMediaStorage) Delete(_ context.Context, kind MediaKind, storageKey string) error {
	path, err := s.safePath(kind, storageKey)
	if err != nil {
		return err
	}
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("ลบไฟล์ไม่สำเร็จ: %w", err)
	}
	return nil
}

// safePath ต่อ path จาก storageKey อย่างปลอดภัย
//
// ⚠️ เทียบว่า filepath.Base(storageKey) เท่ากับ storageKey เป๊ะเท่านั้นถึงยอมรับ — storage key
// ที่ Save คืนให้เป็นชื่อไฟล์แบบแบน (ไม่มี "/") อยู่แล้ว ถ้าค่าที่ส่งเข้ามามีส่วนพาธปนอยู่
// (เช่นถูกแก้ในฐานข้อมูลให้เป็น "../../.env") แปลว่าไม่ใช่ค่าที่ระบบสร้างเอง ให้ปฏิเสธทันที
// ไม่ใช่แค่ตัดทิ้งเงียบๆ เพื่อกัน path traversal อ่าน/ลบไฟล์นอกโฟลเดอร์นี้
func (s *LocalMediaStorage) safePath(kind MediaKind, storageKey string) (string, error) {
	if storageKey == "" || filepath.Base(storageKey) != storageKey {
		return "", errors.New("storage key ไม่ถูกต้อง")
	}
	return filepath.Join(s.dir(kind), storageKey), nil
}

// randomMediaFilename สุ่มชื่อไฟล์จาก 16 ไบต์สุ่ม (crypto/rand เพราะเป็นค่าที่ใช้กันเดา/enumerate
// ไม่ใช่แค่สุ่มโชว์ผล) ต่อด้วยนามสกุลที่ตรวจแล้วจากเนื้อไฟล์จริง
func randomMediaFilename(ext string) (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("สุ่มชื่อไฟล์ไม่สำเร็จ: %w", err)
	}
	return hex.EncodeToString(buf) + ext, nil
}

// ยืนยันตอนคอมไพล์ว่า implementation ยังตรงกับ interface
var _ MediaStorage = (*LocalMediaStorage)(nil)
