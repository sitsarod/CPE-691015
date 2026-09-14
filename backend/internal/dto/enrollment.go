package dto

import (
	"time"

	"CPE-691015/internal/models"
)

// CreateEnrollmentReq รับข้อมูลตอนผู้ใช้กด "สมัครเรียน"
//
// CustomerID ที่ส่งเข้ามาคือ users.id (ค่าเดียวกับ user_id ใน localStorage และ JWT)
// ไม่ใช่ customers.id — ชั้น service จะแปลงให้เอง ดู EnrollmentService.toCustomerID
// (คงชื่อ json เป็น customer_id ไว้เพื่อไม่ให้ frontend ที่ใช้อยู่พัง)
type CreateEnrollmentReq struct {
    CustomerID uint `json:"customer_id" binding:"required"`
    PackageID  uint `json:"package_id" binding:"required"`

    // AcceptedTermsVersion = เลขเวอร์ชันข้อตกลงที่นักเรียนกดยอมรับ · ต้องตรงกับฉบับปัจจุบัน
    AcceptedTermsVersion string `json:"accepted_terms_version"`
}

type EnrollmentTermsSection struct {
    Heading string   `json:"heading"`
    Items   []string `json:"items"`
}

// EnrollmentTermsRes คือข้อตกลงการสมัครเรียนที่แสดงให้อ่านก่อนกดสมัคร
type EnrollmentTermsRes struct {
    Version  string                   `json:"version"`
    Title    string                   `json:"title"`
    Sections []EnrollmentTermsSection `json:"sections"`
}

// CreateEnrollmentRes ส่งข้อมูลกลับไปให้หน้าเว็บเพื่อพาไปหน้าชำระเงิน
type CreateEnrollmentRes struct {
    Message string               `json:"message"`
    Data    CreateEnrollmentData `json:"data"`
}

// CreateEnrollmentData โครงสร้างข้อมูลที่ส่งกลับไปใน Data
type CreateEnrollmentData struct {
    EnrollmentID uint   `json:"enrollment_id"`
    BillingID    *uint  `json:"billing_id"`
    Status       string `json:"status"`
    Waitlisted   bool   `json:"waitlisted"`
}

// UpdateEnrollmentReq รับข้อมูลตอนแอดมินต้องการแก้ไขสถานะหรือโควตา
// RejectEnrollmentReq เหตุผลที่แอดมินไม่รับคำขอ
//
// บังคับกรอกเพราะข้อความนี้ถูกส่งไปหานักเรียนตรง ๆ ผ่านการแจ้งเตือน
// ปฏิเสธแบบเงียบ ๆ = นักเรียนสมัครซ้ำแบบเดิมเข้ามาอีก
type RejectEnrollmentReq struct {
    Reason string `json:"reason" binding:"required,min=3,max=500"`
}

// ApproveEnrollmentReq — body ของการอนุมัติ ส่งมาหรือไม่ส่งก็ได้
type ApproveEnrollmentReq struct {
    AllowOverbook bool `json:"allow_overbook"`
}

type UpdateEnrollmentReq struct {
    Status             *string  `json:"status" binding:"omitempty,oneof=awaiting_payment active completed cancelled expired"`
    RemainingSessions  *float64 `json:"remaining_sessions" binding:"omitempty,min=0"`
}

// ─────────────────────────────────────────────────────────────────────────────
// DTO สำหรับหน้า "คอร์สของฉัน" ฝั่งผู้เรียน
//
// เดิม GetCustomerEnrollments คืน models.Enrollment ดิบ ซึ่งมีปัญหาสองข้อ:
//   1. ลาก relation ที่ไม่ได้ใช้ติดไปด้วย และถ้าวันไหนมีการ Preload("...User")
//      เพิ่มเข้ามา bcrypt hash จะรั่วทันที (models.User.Password ยังเป็น json:"password")
//   2. models.Course.LearningOutcomes ตั้ง json:"-" ไว้ (เพราะ DB เก็บเป็น text บรรทัดละข้อ)
//      ผู้เรียนจึงไม่มีทางเห็น "สิ่งที่จะได้เรียนรู้" ของคอร์สที่ตัวเองสมัคร
//
// DTO ชุดนี้แก้ทั้งสองข้อ โดยแปลง LearningOutcomes เป็น array ให้เรียบร้อย
// ─────────────────────────────────────────────────────────────────────────────

// CustomerEnrollmentCourseDTO ข้อมูลคอร์สเท่าที่หน้า "คอร์สของฉัน" ต้องใช้
//
// การ์ดในหน้านั้นแสดงแค่ ชื่อคอร์ส / แพ็กเกจ / เวลาเรียน / ราคา จึงส่งเท่าที่ใช้จริง
// (รายละเอียดคอร์สแบบเต็มอยู่ที่หน้าเลือกคอร์สด้านล่างของหน้าเดียวกันอยู่แล้ว)
type CustomerEnrollmentCourseDTO struct {
    ID         uint   `json:"id"`
    CourseName string `json:"course_name"`
    ImageURL   string `json:"image_url"`
}

// CustomerEnrollmentPackageDTO แพ็กเกจที่ผู้เรียนสมัครไว้ พร้อมตารางเรียน
type CustomerEnrollmentPackageDTO struct {
    ID            uint                     `json:"id"`
    SessionsCount uint                     `json:"sessions_count"`
    HoursCount    uint                     `json:"hours_count"`
    Price         float64                  `json:"price"`
    Schedules     []PackageScheduleInfoDTO `json:"schedules"`
    Course        *CustomerEnrollmentCourseDTO `json:"course"`
}
func DaysLeft(expiresAt *time.Time) *int {
    if expiresAt == nil {
        return nil
    }
    remaining := time.Until(*expiresAt)
    if remaining <= 0 {
        zero := 0
        return &zero
    }
    days := int(remaining.Hours() / 24)
    if remaining.Hours() > float64(days*24) {
        days++
    }
    return &days
}
const GracePeriodDays = 7

func IsBillingOverdue(b *models.Billing) bool {
    if b == nil {
        return false
    }
    if b.Status == models.StatusPaid || b.Status == models.StatusWaitCheck {
        return false
    }
    return !b.DueDate.IsZero() && b.DueDate.Before(time.Now())
}

// CustomerEnrollmentDTO หนึ่งรายการในหน้า "คอร์สของฉัน"
type CustomerEnrollmentDTO struct {
    ID                uint      `json:"id"`
    Status            string    `json:"status"`
    EnrollmentDate    time.Time `json:"enrollment_date"`
    TotalSessions     uint      `json:"total_sessions"`
    RemainingSessions uint      `json:"remaining_sessions"`
    AgreedPrice       float64   `json:"agreed_price"`

    StartedAt *time.Time `json:"started_at"`
    ExpiresAt *time.Time `json:"expires_at"`
    DaysLeft  *int       `json:"days_left"`
    IsOverdue bool `json:"is_overdue"`

    CarriedOverSessions uint `json:"carried_over_sessions"`

    // เหตุผลที่คำขอถูกปฏิเสธ (มีค่าเฉพาะสถานะ rejected)
    RejectedReason string     `json:"rejected_reason,omitempty"`
    RejectedAt     *time.Time `json:"rejected_at,omitempty"`

    // AttendedSessions = TotalSessions - RemainingSessions
    //
    // ⚠️ ตอนนี้จะเป็น 0 เสมอ เพราะระบบยังไม่มี endpoint เช็คชื่อที่หัก remaining_sessions
    // (CODE_REVIEW ข้อ E6 — เลื่อนไว้) ค่านี้จะเริ่มขยับเมื่อทำระบบเช็คชื่อเสร็จ
    AttendedSessions uint `json:"attended_sessions"`

    BillingID *uint                         `json:"billing_id"`
    Package   *CustomerEnrollmentPackageDTO `json:"package"`
}

// EnrollmentRes โครงสร้างที่จะส่งกลับไปตอนดึงประวัติการลงทะเบียน
type EnrollmentRes struct {
    ID                 uint              `json:"id"`
    EnrollmentDate     time.Time         `json:"enrollment_date"`
    TotalSessions      uint              `json:"total_sessions"`
    RemainingSessions  uint              `json:"remaining_sessions"`
    Status             string            `json:"status"`
    BillingID          *uint             `json:"billing_id"`
    
    Schedules     []PackageScheduleInfoDTO `json:"schedules"`
}

// ─────────────────────────────────────────────────────────────────────────────
// DTO สำหรับหน้าแอดมิน "จัดการคำขอสมัครเรียน"
//
// ต้องแมปเป็น DTO ไม่ส่ง models.Enrollment ดิบ เพราะการแสดงชื่อผู้สมัครต้อง
// Preload("Customer.User") ซึ่งจะลาก models.User ทั้งก้อนออกไปด้วย และ
// models.User.Password ยังใช้ tag json:"password" อยู่ (ไม่ใช่ json:"-")
// ถ้าส่งดิบ bcrypt hash ของผู้ใช้ทุกคนจะรั่วออกไปที่ browser
// ─────────────────────────────────────────────────────────────────────────────

// AdminEnrollmentCustomerDTO ข้อมูลผู้สมัครเท่าที่หน้าแอดมินต้องใช้
type AdminEnrollmentCustomerDTO struct {
    FirstName string `json:"first_name"`
    LastName  string `json:"last_name"`
    Email     string `json:"email"`
    Nickname  string `json:"nickname"`
}

// AdminEnrollmentCourseDTO ชื่อคอร์สที่ผูกกับแพ็กเกจ
type AdminEnrollmentCourseDTO struct {
    ID         uint   `json:"id"`
    CourseName string `json:"course_name"`
    ImageURL   string `json:"image_url"`
}

// AdminEnrollmentPackageDTO ข้อมูลแพ็กเกจที่ผู้สมัครเลือก
type AdminEnrollmentPackageDTO struct {
    ID            uint                      `json:"id"`
    SessionsCount uint                      `json:"sessions_count"`
    Price         float64                   `json:"price"`
    IsTrial       bool                      `json:"is_trial"`
    Course        *AdminEnrollmentCourseDTO `json:"course"`
}

// AdminEnrollmentDTO หนึ่งแถวในตารางคำขอสมัครเรียน
type AdminEnrollmentDTO struct {
    ID                uint                        `json:"id"`
    EnrollmentDate    time.Time                   `json:"enrollment_date"`
    TotalSessions     uint                        `json:"total_sessions"`
    RemainingSessions uint                        `json:"remaining_sessions"`
    Status            string                      `json:"status"`
    AgreedPrice       float64                     `json:"agreed_price"`
    BillingID         *uint                       `json:"billing_id"`
    StartedAt *time.Time `json:"started_at"`
    ExpiresAt *time.Time `json:"expires_at"`
    DaysLeft  *int       `json:"days_left"`
    IsOverdue bool       `json:"is_overdue"`

    CarriedOverSessions uint `json:"carried_over_sessions"`

    Customer *AdminEnrollmentCustomerDTO `json:"customer"`
    Package  *AdminEnrollmentPackageDTO  `json:"package"`
}


func ToAdminEnrollmentDTO(e *models.Enrollment, carriedOver uint) AdminEnrollmentDTO {
    item := AdminEnrollmentDTO{
        ID:                e.ID,
        EnrollmentDate:    e.EnrollmentDate,
        TotalSessions:     e.TotalSessions,
        RemainingSessions: e.RemainingSessions,
        Status:            string(e.Status),
        AgreedPrice:       e.AgreedPrice,
        BillingID:         e.BillingID,
        StartedAt:         e.StartedAt,
        ExpiresAt:         e.ExpiresAt,
        DaysLeft:          DaysLeft(e.ExpiresAt),
        IsOverdue:         IsBillingOverdue(e.Billing),
        CarriedOverSessions: carriedOver,
    }

    if e.Customer != nil {
        customer := &AdminEnrollmentCustomerDTO{
            Nickname: e.Customer.Nickname,
        }
        if e.Customer.User != nil {
            customer.FirstName = e.Customer.User.FirstName
            customer.LastName = e.Customer.User.LastName
            customer.Email = e.Customer.User.Email
        }
        item.Customer = customer
    }

    if e.Package != nil {
        pkg := &AdminEnrollmentPackageDTO{
            ID:            e.Package.ID,
            SessionsCount: e.Package.SessionsCount,
            Price:         e.Package.Price,
            IsTrial:       e.Package.IsTrial,
        }
        if e.Package.Course != nil {
            pkg.Course = &AdminEnrollmentCourseDTO{
                ID:         e.Package.Course.ID,
                CourseName: e.Package.Course.CourseName,
                ImageURL:   e.Package.Course.ImageURL,
            }
        }
        item.Package = pkg
    }

    return item
}

// ToAdminEnrollmentDTOs แปลงทั้งรายการ
func ToAdminEnrollmentDTOs(enrollments []models.Enrollment, carriedOver map[uint]uint) []AdminEnrollmentDTO {
    result := make([]AdminEnrollmentDTO, 0, len(enrollments))
    for i := range enrollments {
        e := &enrollments[i]
        result = append(result, ToAdminEnrollmentDTO(e, carriedOver[e.ID]))
    }
    return result
}

// PackageInfoRes โครงสร้างย่อยของแพ็กเกจ
type PackageInfoRes struct {
    ID            uint    `json:"id"`
    CourseID      uint    `json:"course_id"`
    Price         float64 `json:"price"`
    SessionsCount uint    `json:"sessions_count"`
    CourseName    string  `json:"course_name"`
    DayOfWeek     string  `json:"day_of_week"`
    StartTime     string  `json:"start_time"`
    EndTime       string  `json:"end_time"`
}