package services

import (
	"context"
	"errors"
	"log"
	"mime/multipart"
	"os"
	"strings"

	"github.com/cloudinary/cloudinary-go/v2"
	"github.com/cloudinary/cloudinary-go/v2/api/uploader"
)

// allowedSubfolders คือรายชื่อโฟลเดอร์ย่อยที่อนุญาตให้แยกเก็บได้
// เพื่อกันไม่ให้ผู้ใช้ส่งชื่อโฟลเดอร์มั่ว ๆ มาสร้างโฟลเดอร์เกะกะบน Cloudinary
var allowedSubfolders = map[string]bool{
	"profile": true,
	"slip":    true,
	"news":    true,
	"home":    true,
	"course":  true,
}

// CloudinaryService ห่อ SDK ของ Cloudinary สำหรับอัปโหลดไฟล์ขึ้นคลาวด์
type CloudinaryService struct {
	cld    *cloudinary.Cloudinary
	folder string
}

// NewCloudinaryService อ่านค่าตั้งจาก environment
//   - CLOUDINARY_URL (รูปแบบ cloudinary://<api_key>:<api_secret>@<cloud_name>)  หรือ
//   - CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET
//
// ถ้ายังไม่ได้ตั้งค่า จะคืน nil เพื่อให้ตัวเรียกใช้ fallback ไปเก็บไฟล์ในเครื่องแทน
func NewCloudinaryService() *CloudinaryService {
	var (
		cld *cloudinary.Cloudinary
		err error
	)

	if url := os.Getenv("CLOUDINARY_URL"); url != "" {
		cld, err = cloudinary.NewFromURL(url)
	} else {
		name := os.Getenv("CLOUDINARY_CLOUD_NAME")
		key := os.Getenv("CLOUDINARY_API_KEY")
		secret := os.Getenv("CLOUDINARY_API_SECRET")
		if name == "" || key == "" || secret == "" {
			log.Println("Cloudinary ยังไม่ถูกตั้งค่า — จะเก็บไฟล์อัปโหลดในเครื่องแทน (local /uploads)")
			return nil
		}
		cld, err = cloudinary.NewFromParams(name, key, secret)
	}

	if err != nil {
		log.Printf("เริ่มต้น Cloudinary ไม่สำเร็จ: %v — จะ fallback ไปเก็บไฟล์ในเครื่อง", err)
		return nil
	}

	folder := os.Getenv("CLOUDINARY_FOLDER")
	if folder == "" {
		folder = "koyama"
	}

	log.Println("เชื่อมต่อ Cloudinary สำเร็จ — ไฟล์อัปโหลดจะถูกเก็บบนคลาวด์")
	return &CloudinaryService{cld: cld, folder: folder}
}

// SanitizeSubfolder ตรวจว่าชื่อโฟลเดอร์ย่อยที่ส่งมาอยู่ในรายการที่อนุญาตไหม
// ถ้าไม่อยู่ (หรือว่าง) จะคืนค่าว่าง = เก็บที่โฟลเดอร์หลักตามเดิม
func SanitizeSubfolder(sub string) string {
	sub = strings.ToLower(strings.TrimSpace(sub))
	if allowedSubfolders[sub] {
		return sub
	}
	return ""
}

// UploadFile อัปโหลดไฟล์ (จาก multipart) ขึ้น Cloudinary แล้วคืน secure URL (https)
// ปล่อยให้ Cloudinary ตรวจชนิดไฟล์อัตโนมัติ (รูป/วิดีโอ/ไฟล์อื่น) และตั้งชื่อ public id ให้เอง
func (s *CloudinaryService) UploadFile(ctx context.Context, file multipart.File) (string, error) {
	return s.UploadFileToFolder(ctx, file, "")
}

// UploadFileToFolder เหมือน UploadFile แต่แยกเก็บลงโฟลเดอร์ย่อย (เช่น profile/slip/news)
// subfolder จะถูกกรองผ่าน SanitizeSubfolder ก่อน แล้วต่อท้ายโฟลเดอร์หลักเป็น "<หลัก>/<ย่อย>"
func (s *CloudinaryService) UploadFileToFolder(ctx context.Context, file multipart.File, subfolder string) (string, error) {
	folder := s.folder
	if sub := SanitizeSubfolder(subfolder); sub != "" {
		folder = s.folder + "/" + sub
	}

	useFilename := true
	uniqueFilename := true
	res, err := s.cld.Upload.Upload(ctx, file, uploader.UploadParams{
		Folder:         folder,
		ResourceType:   "auto",
		UseFilename:    &useFilename,
		UniqueFilename: &uniqueFilename,
	})
	if err != nil {
		return "", err
	}
	// Cloudinary SDK บางกรณีคืน error เป็น nil แต่แนบ error ไว้ใน body (เช่น API key/secret ผิด)
	if res.Error.Message != "" {
		return "", errors.New("cloudinary: " + res.Error.Message)
	}
	if res.SecureURL == "" {
		return "", errors.New("cloudinary: อัปโหลดไม่สำเร็จ (ไม่ได้รับ URL กลับมา ตรวจสอบ credential ใน .env)")
	}
	return res.SecureURL, nil
}
