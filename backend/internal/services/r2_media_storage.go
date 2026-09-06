package services

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"mime"
	"os"
	"path/filepath"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/feature/s3/manager"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	s3types "github.com/aws/aws-sdk-go-v2/service/s3/types"
)

// R2MediaStorage เก็บไฟล์รูป/วิดีโอโพสต์ (RawPhoto/RawVideo) บน Cloudflare R2
//
// เลือก R2 แทน Cloudinary ที่ระบบอื่นใช้อยู่แล้วด้วยเหตุผลสองข้อ:
//  1. ไฟล์กลุ่มนี้ถูกลบทิ้งเองภายใน 7 วัน (DeleteOldRawPhotos/DeleteOldRawVideos) ไม่ใช่ข้อมูล
//     ถาวรแบบรูปโปรไฟล์/รูปใบหน้า แยก account ออกมาไม่ให้แย่ง quota เดียวกัน
//  2. วิดีโอโพสต์หนักได้ถึง ~200MB และถูกดาวน์โหลดผ่านปุ่มในแท็บ Posts บ่อย — R2 ไม่คิดค่า
//     egress ต่างจาก Cloudinary/S3 ทั่วไปที่คิดค่าดาวน์โหลดตามปริมาณ
//
// R2 คุยด้วย S3 API ได้ตรง ๆ (S3-compatible) จึงใช้ aws-sdk-go-v2/service/s3 ชี้ endpoint
// ไปที่ R2 แทน ไม่ต้องพึ่ง SDK เฉพาะของ Cloudflare
type R2MediaStorage struct {
	client *s3.Client
	bucket string
}

// NewR2MediaStorage อ่านค่าตั้งจาก environment — ตั้งไม่ครบคืน nil เพื่อให้ผู้เรียก fallback
// ไปเก็บไฟล์ในเครื่องแทน (เหมือน NewHTTPFaceEngine/NewCloudinaryService)
//
// ตัวแปรที่ต้องตั้ง: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
func NewR2MediaStorage() *R2MediaStorage {
	accountID := os.Getenv("R2_ACCOUNT_ID")
	accessKeyID := os.Getenv("R2_ACCESS_KEY_ID")
	secretAccessKey := os.Getenv("R2_SECRET_ACCESS_KEY")
	bucket := os.Getenv("R2_BUCKET")

	if accountID == "" || accessKeyID == "" || secretAccessKey == "" || bucket == "" {
		return nil
	}

	// R2 ใช้ region "auto" เสมอ (ไม่มีแนวคิดหลาย region แบบ S3 จริง) และ endpoint เป็นรูปแบบ
	// เฉพาะที่ผูกกับ account ID — ดู https://developers.cloudflare.com/r2/api/s3/api/
	endpoint := fmt.Sprintf("https://%s.r2.cloudflarestorage.com", accountID)

	cfg, err := awsconfig.LoadDefaultConfig(context.Background(),
		awsconfig.WithRegion("auto"),
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(accessKeyID, secretAccessKey, "")),
	)
	if err != nil {
		log.Printf("ตั้งค่า R2 ไม่สำเร็จ (โหลด AWS config ล้มเหลว): %v", err)
		return nil
	}

	client := s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(endpoint)
		// R2 ไม่รองรับ virtual-hosted-style bucket URL แบบ S3 จริง ต้องบังคับ path-style
		o.UsePathStyle = true
	})

	return &R2MediaStorage{client: client, bucket: bucket}
}

// objectKey ต่อ storage key (ชื่อไฟล์สุ่มที่ Save คืนให้) เข้ากับ MediaKind ให้กลายเป็น
// "object key" เต็มรูปแบบที่ R2/S3 ใช้อ้างอิงไฟล์จริงในถัง เช่น "photo-posts/ab12cd34.jpg"
//
// ต่างจาก LocalMediaStorage ที่ต้องเก็บชื่อไฟล์แบบแบน (กัน path traversal บนดิสก์จริง)
// แต่ S3/R2 ไม่มีแนวคิด "ออกนอกโฟลเดอร์" — object key ที่มี "/" ก็แค่ทำให้ดูเหมือนมีโฟลเดอร์ย่อย
// เฉย ๆ ไม่ได้เปิดช่องให้เข้าถึงไฟล์อื่นนอกถังได้
func (s *R2MediaStorage) objectKey(kind MediaKind, storageKey string) string {
	return fmt.Sprintf("%s/%s", kind, storageKey)
}

// Save อัปโหลดไฟล์ขึ้น R2 — ใช้ manager.Uploader เพราะรองรับไฟล์ใหญ่ (วิดีโอถึง ~200MB)
// ด้วย multipart upload อัตโนมัติ ไม่ต้องอ่านทั้งไฟล์เข้าหน่วยความจำก่อน
func (s *R2MediaStorage) Save(ctx context.Context, kind MediaKind, file io.Reader, ext string) (string, error) {
	name, err := randomMediaFilename(ext)
	if err != nil {
		return "", err
	}

	contentType := mime.TypeByExtension(ext)
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	// manager.Uploader ขึ้น deprecated แทนที่ด้วย feature/s3/transfermanager แล้ว แต่ยังใช้งานได้ปกติ
	// เลือกใช้ตัวนี้ต่อเพราะเสถียรกว่า (transfermanager เพิ่งออกมาไม่นาน) จัดการ multipart ให้เอง
	// อยู่แล้วสำหรับไฟล์ใหญ่ (วิดีโอโพสต์ถึง ~200MB) — ย้ายทีหลังได้เมื่อ transfermanager นิ่งกว่านี้
	uploader := manager.NewUploader(s.client) //nolint:staticcheck // ดูเหตุผลด้านบน
	_, err = uploader.Upload(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(s.bucket),
		Key:         aws.String(s.objectKey(kind, name)),
		Body:        file,
		ContentType: aws.String(contentType),
	})
	if err != nil {
		return "", fmt.Errorf("อัปโหลดไฟล์ขึ้น R2 ไม่สำเร็จ: %w", err)
	}

	return name, nil
}

// Open ดึงเนื้อไฟล์จาก R2 — ผู้เรียกต้องปิด ReadCloser เอง (เหมือน LocalMediaStorage.Open)
func (s *R2MediaStorage) Open(ctx context.Context, kind MediaKind, storageKey string) (io.ReadCloser, string, error) {
	if storageKey == "" {
		return nil, "", errors.New("storage key ไม่ถูกต้อง")
	}

	out, err := s.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(s.objectKey(kind, storageKey)),
	})
	if err != nil {
		var noSuchKey *s3types.NoSuchKey
		if errors.As(err, &noSuchKey) {
			return nil, "", ErrMediaNotFound
		}
		return nil, "", fmt.Errorf("เปิดไฟล์จาก R2 ไม่สำเร็จ: %w", err)
	}

	contentType := aws.ToString(out.ContentType)
	if contentType == "" {
		contentType = mime.TypeByExtension(filepath.Ext(storageKey))
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	return out.Body, contentType, nil
}

// Delete ลบไฟล์จาก R2 — S3 API เป็น idempotent อยู่แล้ว (ลบ key ที่ไม่มีอยู่จริงก็ตอบสำเร็จ)
// ตรงกับสัญญาของ interface ที่ไม่ถือว่า "ไม่พบไฟล์" เป็น error
func (s *R2MediaStorage) Delete(ctx context.Context, kind MediaKind, storageKey string) error {
	if storageKey == "" {
		return errors.New("storage key ไม่ถูกต้อง")
	}

	_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(s.objectKey(kind, storageKey)),
	})
	if err != nil {
		return fmt.Errorf("ลบไฟล์จาก R2 ไม่สำเร็จ: %w", err)
	}
	return nil
}

// ยืนยันตอนคอมไพล์ว่า implementation ยังตรงกับ interface
var _ MediaStorage = (*R2MediaStorage)(nil)
