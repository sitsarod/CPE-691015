package models

import (
	"gorm.io/gorm"
	"time"
)

type CustomerStatus string
type Gender string

const (
	CustomerStatusActive   CustomerStatus = "active"
	CustomerStatusInactive CustomerStatus = "inactive"

)

const (
	GenderMale   = "male"
	GenderFemale = "female"
)

type Customer struct {
	gorm.Model
	UserID            uint            `json:"user_id" valid:"required~UserID is required"`
    User              *User           `json:"user" ` 
    Nickname          string          `json:"nickname" gorm:"type:varchar(10)" valid:"required~nickname is required"`
    BirthDate         time.Time       `json:"birthDate" valid:"required~Birth date is required"`
	Gender            Gender          `json:"gender" gorm:"type:varchar(10);check:gender IN ('male', 'female')" valid:"required~Gender is required,in(male|female)~Gender must be either 'male' or 'female'"`
    PhoneNumber       string          `json:"phoneNumber" valid:"required~Phone number is required,numeric~Phone number must contain only numbers,length(10)~Invalid phone number length"`
    // LineID / Facebook เป็นช่องทางติดต่อเสริม ไม่บังคับกรอก
    LineID              string          `json:"lineId" gorm:"type:varchar(100)"`
    Facebook            string          `json:"facebook" gorm:"type:varchar(255)"`
    ParentEmail       string          `json:"parentEmail" valid:"email~Invalid parent email format,optional"`
    ParentPhoneNumber string          `json:"parentPhoneNumber" valid:"numeric~Parent phone number must contain only numbers,optional"`
    PersonalQRCode    string          `json:"personalQR" gorm:"unique" valid:"required~Personal QR Code is required"`

    // MemberCode คือรหัสประจำตัวแบบอ่านออกพูดได้ เช่น KYS0001
    //
    // ⚠️ ทำหน้าที่ "อ้างอิงถึงคน" เท่านั้น ห้ามใช้ยืนยันตัวตนแทน PersonalQRCode
    // เพราะเป็นเลขเรียงกันที่เดาต่อได้ (ดูเหตุผลเต็มใน services/member_code.go)
    MemberCode        string          `json:"memberCode" gorm:"type:varchar(16);index"`
    Status            CustomerStatus  `json:"status" gorm:"default:'active'" valid:"required~Status is required"`

    // FaceConsentStatus คือสถานะความยินยอมให้เก็บข้อมูลใบหน้า (ข้อมูลชีวภาพ)
    //
    // เป็นค่าที่ denormalize มาจากแถวล่าสุดของตาราง biometric_consents โดยตั้งใจ
    // เพราะตอนเช็คชื่อต้องอ่านค่านี้ทุกครั้ง ไม่ควรต้องไล่หาแถวล่าสุดของตาราง audit
    //
    // ⚠️ กติกา: การเขียน biometric_consents และการอัปเดตฟิลด์นี้ ต้องอยู่ใน
    // transaction เดียวกันเสมอ มิฉะนั้นสองแหล่งจะไม่ตรงกัน (ดู services/consent_service.go)
    FaceConsentStatus FaceConsentStatus `json:"face_consent_status" gorm:"type:varchar(20);default:'unknown'"`


	Photos            	[]Photo 		`json:"photo" gorm:"foreignKey:CustomerID"`
	Evaluations       	[]Evaluation    `json:"evaluation" gorm:"foreignKey:CustomerID"`
	Reviews           	[]Review        `json:"reviews" gorm:"foreignKey:CustomerID"`
	DetectedVideos    	[]DetectedVideo `json:"detectedVideo" gorm:"foreignKey:CustomerID"`
	Enrollments    		[]Enrollment    `json:"enrollment" gorm:"foreignKey:CustomerID"`

	
}

