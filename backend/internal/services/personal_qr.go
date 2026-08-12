package services

import (
	"crypto/rand"
	"encoding/base64"
	"errors"

	"CPE-691015/internal/models"

	"gorm.io/gorm"
)

// QR ประจำตัว — ใช้ร่วมกันทั้งนักเรียน (customers) และโค้ช (coaches)
//
// เดิมโค้ดสร้างรหัสจาก "QR_" + อีเมล ซึ่งคำนวณย้อนกลับได้ ใครรู้อีเมลของเพื่อน
// ก็ปลอม QR แล้วเช็คชื่อแทนได้ ตอนนี้เปลี่ยนมาใช้ค่าสุ่มจาก crypto/rand แล้ว
//
// นิยามของค่านี้: เป็นรหัสประจำตัว "ถาวร" ของแต่ละคน
// ออกครั้งเดียวตอนสร้างบัญชี แล้วไม่เปลี่ยนเองอีกเลย
// จะเปลี่ยนก็ต่อเมื่อมีคนสั่งออกใบใหม่ (กรณี QR หลุดหรือทำบัตรหาย)
//
// ทั้งสองบทบาทใช้ namespace เดียวกัน คือค่าไม่ซ้ำกันข้ามทั้งสองตาราง
// เพื่อให้เครื่องสแกนตัวเดียวอ่านได้ทั้งนักเรียนและโค้ชโดยไม่ต้องสลับโหมด
// และไม่มีทางที่ QR ใบเดียวจะชี้ไปหาคนสองคน

// QRCodePrefix คำนำหน้าของ QR ประจำตัว ใช้ให้ฝั่งสแกนแยกออกว่าเป็น QR ของระบบนี้
const QRCodePrefix = "QR_"

// qrTokenBytes จำนวนไบต์สุ่มของ QR ประจำตัว
//
// 16 ไบต์ = 128 บิต ระดับเดียวกับ UUIDv4 เดาไม่ได้ด้วยกำลังคำนวณที่มีอยู่จริง
// encode เป็น base64 แบบ URL-safe แล้วได้สตริงยาว 22 ตัวอักษร รวมคำนำหน้าเป็น 25 ตัว
// ซึ่งสั้นพอให้ QR ขนาด 256px ยังสแกนง่าย
const qrTokenBytes = 16

// qrMaxRetry จำนวนครั้งที่ยอมสุ่มใหม่เมื่อบังเอิญได้ค่าซ้ำกับที่มีอยู่แล้ว
//
// โอกาสที่ค่าสุ่ม 128 บิตจะชนกันนั้นต่ำจนแทบไม่ต้องคิดถึง แต่คอลัมน์ personal_qr_code
// เป็น unique ที่ระดับฐานข้อมูล ถ้าชนขึ้นมาจริงจะกลายเป็น error 500 ตอนสมัครสมาชิก
// จึงกันไว้ด้วยการวนสุ่มใหม่ ราคาถูกกว่าปล่อยให้ผู้ใช้สมัครไม่ผ่าน
const qrMaxRetry = 5

// ErrQRGenerateFailed ถูกคืนเมื่อสุ่ม QR ไม่สำเร็จจนครบจำนวนครั้งที่กำหนด
var ErrQRGenerateFailed = errors.New("ไม่สามารถสร้างรหัส QR ประจำตัวได้")

// newQRToken สุ่มค่า QR หนึ่งค่า โดยยังไม่ตรวจว่าซ้ำกับในฐานข้อมูลหรือไม่
//
// ⚠️ ใช้ crypto/rand เท่านั้น ห้ามเปลี่ยนไปใช้ math/rand เด็ดขาด
// เพราะ math/rand เดาค่าถัดไปได้ถ้ารู้ค่าก่อนหน้า ซึ่งทำให้ QR ของคนอื่นถูกคำนวณล่วงหน้าได้
func newQRToken() (string, error) {
	b := make([]byte, qrTokenBytes)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return QRCodePrefix + base64.RawURLEncoding.EncodeToString(b), nil
}

// GenerateUniqueQRCode สุ่ม QR ประจำตัวที่ยังไม่มีใครใช้ในฐานข้อมูล
//
// ⚠️ ห้ามคำนวณค่านี้จากข้อมูลที่คนอื่นรู้ได้ เช่น อีเมล ชื่อ หรือเลขบัตรประชาชน
// เพราะ QR ทำหน้าที่เป็นความลับที่ใช้ยืนยันตัวตนตอนเช็คชื่อ ถ้าคำนวณย้อนกลับได้
// ใครที่รู้ข้อมูลตั้งต้นจะเช็คชื่อแทนเจ้าของได้ทันที
func GenerateUniqueQRCode(db *gorm.DB) (string, error) {
	for i := 0; i < qrMaxRetry; i++ {
		code, err := newQRToken()
		if err != nil {
			return "", err
		}

		taken, err := qrCodeTaken(db, code)
		if err != nil {
			return "", err
		}
		if !taken {
			return code, nil
		}
	}
	return "", ErrQRGenerateFailed
}

// qrCodeTaken เช็คว่าค่านี้ถูกใช้ไปแล้วหรือยัง โดยดูทั้งตารางลูกค้าและตารางโค้ช
//
// ต้องใช้ Unscoped เพราะแถวที่ถูก soft delete ไปแล้วยังกินค่า unique อยู่
// ถ้าไม่ใส่จะสุ่มได้ค่าที่ชนกับคนที่ลบไปแล้ว แล้วไปพังตอน INSERT แทน
func qrCodeTaken(db *gorm.DB, code string) (bool, error) {
	var n int64

	if err := db.Unscoped().Model(&models.Customer{}).
		Where("personal_qr_code = ?", code).Count(&n).Error; err != nil {
		return false, err
	}
	if n > 0 {
		return true, nil
	}

	if err := db.Unscoped().Model(&models.Coach{}).
		Where("personal_qr_code = ?", code).Count(&n).Error; err != nil {
		return false, err
	}
	return n > 0, nil
}

// ReissueCustomerQRCode ออก QR ประจำตัวใบใหม่ให้ลูกค้าที่ระบุ (ใบเดิมใช้ไม่ได้ทันที)
//
// ใช้เมื่อ QR หลุด เช่น ถูกถ่ายรูปส่งต่อกัน หรือทำบัตรหาย
// customerID คือ customers.id ไม่ใช่ users.id
func ReissueCustomerQRCode(db *gorm.DB, customerID uint) (string, error) {
	return reissue(db, &models.Customer{}, customerID)
}

// ReissueCoachQRCode ออก QR ประจำตัวใบใหม่ให้โค้ชที่ระบุ (ใบเดิมใช้ไม่ได้ทันที)
//
// coachID คือ coaches.id ไม่ใช่ users.id
func ReissueCoachQRCode(db *gorm.DB, coachID uint) (string, error) {
	return reissue(db, &models.Coach{}, coachID)
}

func reissue(db *gorm.DB, model any, id uint) (string, error) {
	code, err := GenerateUniqueQRCode(db)
	if err != nil {
		return "", err
	}

	res := db.Model(model).Where("id = ?", id).Update("personal_qr_code", code)
	if res.Error != nil {
		return "", res.Error
	}
	if res.RowsAffected == 0 {
		return "", gorm.ErrRecordNotFound
	}
	return code, nil
}
