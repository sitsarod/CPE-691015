package services

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/cloudinary/cloudinary-go/v2"
	"github.com/cloudinary/cloudinary-go/v2/api"
	"github.com/cloudinary/cloudinary-go/v2/api/uploader"
)

// allowedSubfolders คือรายชื่อโฟลเดอร์ย่อยที่อนุญาตให้แยกเก็บได้
// เพื่อกันไม่ให้ผู้ใช้ส่งชื่อโฟลเดอร์มั่ว ๆ มาสร้างโฟลเดอร์เกะกะบน Cloudinary
//
// ⚠️ ห้ามเพิ่ม "faces" — รายการนี้ใช้กับเส้นทางอัปโหลดสาธารณะ (UploadFileToFolder)
// รูปใบหน้าต้องผ่าน UploadPrivateImage เท่านั้น
var allowedSubfolders = map[string]bool{
	"profile": true,
	"slip":    true,
	"news":    true,
	"home":    true,
	"chat":    true,
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

// CloudName คืนชื่อ cloud ที่ตั้งค่าไว้ (ใช้ตรวจว่า URL สลิปมาจาก Cloudinary ของสถาบันจริง)
// คืนค่าว่างถ้ายังไม่ได้เชื่อมต่อ Cloudinary
func (s *CloudinaryService) CloudName() string {
	if s == nil || s.cld == nil {
		return ""
	}
	return s.cld.Config.Cloud.CloudName
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

// ─── โหมด authenticated — สำหรับข้อมูลชีวภาพเท่านั้น ───
//
// เมธอดข้างบนอัปแบบ type=upload ซึ่งได้ URL สาธารณะ ใครมีลิงก์ก็เปิดได้
// ยอมรับได้กับรูปโปรไฟล์ แต่กับรูปใบหน้าคือรั่วข้อมูลอ่อนไหวตาม PDPA ม.26
//
// ชุดข้างล่างจึงบังคับ type=authenticated ไว้ในตัวฟังก์ชัน ไม่รับเป็นพารามิเตอร์
// และคืน public_id ไม่ใช่ URL (URL ของ authenticated asset ต้อง sign ใหม่ทุกครั้ง)

const faceRootFolder = "faces"

// kind แยกโฟลเดอร์ของนักเรียนกับโค้ชออกจากกัน — id ของสองตารางชนกันได้
func (s *CloudinaryService) FaceEnrollmentFolder(kind string, subjectID uint) string {
	return fmt.Sprintf("%s/%s/enrollment/%s/%d", s.folder, faceRootFolder, kind, subjectID)
}

// UploadPrivateImage อัปโหลดรูปแบบ authenticated แล้วคืน public_id
//
// ⚠️ folder ต้องมาจาก FaceEnrollmentFolder เท่านั้น ห้ามรับค่าจากผู้ใช้
// ผู้เรียกต้องตรวจขนาด/ชนิดไฟล์มาก่อน
func (s *CloudinaryService) UploadPrivateImage(ctx context.Context, file io.Reader, folder string) (string, error) {
	useFilename := false   // ชื่อไฟล์ของผู้ใช้อาจมีข้อมูลส่วนตัว
	uniqueFilename := true // ให้สุ่มชื่อ เดา public_id ของคนอื่นไม่ได้
	overwrite := false

	res, err := s.cld.Upload.Upload(ctx, file, uploader.UploadParams{
		Folder: folder,
		// ค่านี้หลุดเป็น upload เมื่อไหร่ ภาพใบหน้ากลายเป็นสาธารณะทันที
		Type:           api.Authenticated,
		ResourceType:   "image",
		UseFilename:    &useFilename,
		UniqueFilename: &uniqueFilename,
		Overwrite:      &overwrite,
	})
	if err != nil {
		return "", err
	}
	if res.Error.Message != "" {
		return "", errors.New("cloudinary: " + res.Error.Message)
	}
	if res.PublicID == "" {
		return "", errors.New("cloudinary: อัปโหลดไม่สำเร็จ (ไม่ได้รับ public_id กลับมา)")
	}

	// ตรวจผลที่ได้จริง ไม่ใช่เชื่อว่าที่ส่งไปมีผล — ถ้าโหมดหลุด ภาพใบหน้าเปิดสาธารณะได้แล้ว
	// ต้องลบทิ้งทันที ดีกว่าปล่อยให้แถวในฐานชี้ไปหาภาพที่ใครก็เปิดได้
	if res.Type != api.Authenticated {
		_ = s.DestroyPrivateImage(ctx, res.PublicID)
		return "", fmt.Errorf("cloudinary: อัปโหลดได้โหมด %q แทนที่จะเป็น authenticated — ยกเลิกแล้ว", res.Type)
	}

	return res.PublicID, nil
}

// DestroyPrivateImage ลบไฟล์ออกจาก Cloudinary จริง ๆ
//
// ⚠️ ต้องระบุ Type ให้ตรงกับตอนอัปโหลด ไม่งั้นหาไฟล์ไม่เจอแล้วคืน "not found"
// แบบเงียบ ๆ ทั้งที่ไฟล์ยังอยู่
func (s *CloudinaryService) DestroyPrivateImage(ctx context.Context, publicID string) error {
	if strings.TrimSpace(publicID) == "" {
		return nil
	}

	invalidate := true // ล้าง cache ที่ CDN ด้วย ไม่งั้นสำเนาเดิมยังเปิดได้อีกพักใหญ่
	res, err := s.cld.Upload.Destroy(ctx, uploader.DestroyParams{
		PublicID:     publicID,
		Type:         api.Authenticated,
		ResourceType: "image",
		Invalidate:   &invalidate,
	})
	if err != nil {
		return err
	}
	if res.Error.Message != "" {
		return errors.New("cloudinary: " + res.Error.Message)
	}
	// "not found" = ไฟล์ไม่อยู่แล้ว ซึ่งคือผลลัพธ์ที่ต้องการอยู่ดี
	if res.Result != "ok" && res.Result != "not found" {
		return fmt.Errorf("cloudinary: ลบไฟล์ไม่สำเร็จ (result=%s)", res.Result)
	}
	return nil
}

// DestroyPublicAsset ลบไฟล์ "สาธารณะ" (type=upload) ออกจาก Cloudinary เช่นไฟล์แนบในแชท
// ต่างจาก DestroyPrivateImage ตรงที่ไม่ได้ล็อก type=authenticated และรับ resourceType ได้
// (image/video/raw) เพราะไฟล์แนบแชทมีได้หลายชนิด — resourceType ต้องตรงกับตอนอัปโหลด
// ไม่งั้น Cloudinary หาไม่เจอแล้วคืน "not found" ทั้งที่ไฟล์ยังอยู่
func (s *CloudinaryService) DestroyPublicAsset(ctx context.Context, publicID, resourceType string) error {
	if strings.TrimSpace(publicID) == "" {
		return nil
	}
	if resourceType == "" {
		resourceType = "image"
	}

	invalidate := true // ล้าง cache ที่ CDN ด้วย ไม่งั้นสำเนาเดิมยังเปิดได้อีกพักใหญ่
	res, err := s.cld.Upload.Destroy(ctx, uploader.DestroyParams{
		PublicID:     publicID,
		Type:         "upload",
		ResourceType: resourceType,
		Invalidate:   &invalidate,
	})
	if err != nil {
		return err
	}
	if res.Error.Message != "" {
		return errors.New("cloudinary: " + res.Error.Message)
	}
	if res.Result != "ok" && res.Result != "not found" {
		return fmt.Errorf("cloudinary: ลบไฟล์ไม่สำเร็จ (result=%s)", res.Result)
	}
	return nil
}

// CloudinaryAssetFromURL แยก public_id และ resource_type ออกจาก URL สาธารณะของ Cloudinary
// รูปแบบ: https://res.cloudinary.com/<cloud>/<resource_type>/upload/v<version>/<folder...>/<name>.<ext>
// คืน ok=false ถ้าไม่ใช่ลิงก์ Cloudinary (เช่น ไฟล์เก็บในเครื่อง http://host/uploads/chat/..)
//
// อาศัยข้อเท็จจริงว่าเส้นทางอัปโหลดของเรา (UploadFileToFolder) ไม่ใส่ transformation
// จึงมีแค่ segment เวอร์ชัน (vNNN) คั่นก่อน public_id เสมอ
func CloudinaryAssetFromURL(u string) (publicID, resourceType string, ok bool) {
	if !strings.Contains(u, "res.cloudinary.com") {
		return "", "", false
	}
	marker := "/upload/"
	i := strings.Index(u, marker)
	if i < 0 {
		return "", "", false
	}

	// resource_type = path segment สุดท้ายก่อน "/upload/"
	prefix := u[:i]
	slash := strings.LastIndex(prefix, "/")
	if slash < 0 {
		return "", "", false
	}
	resourceType = prefix[slash+1:]

	rest := u[i+len(marker):]
	if q := strings.IndexByte(rest, '?'); q >= 0 {
		rest = rest[:q]
	}

	segs := strings.Split(rest, "/")
	kept := make([]string, 0, len(segs))
	for _, seg := range segs {
		// ข้าม segment เวอร์ชัน "vNNN" ที่อยู่หน้าสุด
		if len(kept) == 0 && len(seg) > 1 && seg[0] == 'v' && isAllDigits(seg[1:]) {
			continue
		}
		kept = append(kept, seg)
	}
	joined := strings.Join(kept, "/")
	if dot := strings.LastIndex(joined, "."); dot >= 0 {
		joined = joined[:dot] // ตัดนามสกุลไฟล์ออกจาก public_id
	}
	if joined == "" || resourceType == "" {
		return "", "", false
	}
	return joined, resourceType, true
}

// DownloadPrivateImage ดึงไฟล์มาให้ backend stream ต่อเอง — ผู้เรียกต้องปิด ReadCloser เสมอ
//
// ⚠️ ตั้งใจไม่คืน signed URL ให้ client เพราะเป็นลิงก์ที่ใครถือก็เปิดได้จนกว่าจะหมดอายุ
// ถ้าหลุดออกนอกระบบก็คุมไม่ได้แล้ว ให้ backend ถือคนเดียวแล้ว proxy เนื้อไฟล์กลับไปแทน
// (เรียกน้อยมาก มีแค่ตอนแอดมินเปิดดูตอนตรวจรูป จึงไม่กระทบ bandwidth)
func (s *CloudinaryService) DownloadPrivateImage(ctx context.Context, publicID string) (io.ReadCloser, string, error) {
	img, err := s.cld.Image(publicID)
	if err != nil {
		return nil, "", err
	}
	img.DeliveryType = api.Authenticated
	img.Config.URL.SignURL = true

	signedURL, err := img.String()
	if err != nil {
		return nil, "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, signedURL, nil)
	if err != nil {
		return nil, "", err
	}

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, "", err
	}
	if resp.StatusCode != http.StatusOK {
		resp.Body.Close()
		return nil, "", fmt.Errorf("cloudinary: ดึงไฟล์ไม่สำเร็จ (HTTP %d)", resp.StatusCode)
	}

	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	return resp.Body, contentType, nil
}
