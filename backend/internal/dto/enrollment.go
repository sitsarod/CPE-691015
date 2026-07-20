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
}

// CreateEnrollmentRes ส่งข้อมูลกลับไปให้หน้าเว็บเพื่อพาไปหน้าชำระเงิน
type CreateEnrollmentRes struct {
    Message string               `json:"message"`
    Data    CreateEnrollmentData `json:"data"`
}

// CreateEnrollmentData โครงสร้างข้อมูลที่ส่งกลับไปใน Data
type CreateEnrollmentData struct {
    EnrollmentID uint  `json:"enrollment_id"`
    BillingID    *uint `json:"billing_id"`
}

// UpdateEnrollmentReq รับข้อมูลตอนแอดมินต้องการแก้ไขสถานะหรือโควตา
type UpdateEnrollmentReq struct {
    Status             *string  `json:"status" binding:"omitempty,oneof=active completed cancelled"`
    RemainingSessions  *float64 `json:"remaining_sessions" binding:"omitempty,min=0"`
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
}

// AdminEnrollmentPackageDTO ข้อมูลแพ็กเกจที่ผู้สมัครเลือก
type AdminEnrollmentPackageDTO struct {
    ID            uint                      `json:"id"`
    SessionsCount uint                      `json:"sessions_count"`
    Price         float64                   `json:"price"`
    Course        *AdminEnrollmentCourseDTO `json:"course"`
}

// AdminEnrollmentDTO หนึ่งแถวในตารางคำขอสมัครเรียน
type AdminEnrollmentDTO struct {
    ID                uint                        `json:"id"`
    EnrollmentDate    time.Time                   `json:"enrollment_date"`
    TotalSessions     uint                        `json:"total_sessions"`
    RemainingSessions uint                        `json:"remaining_sessions"`
    Status            string                      `json:"status"`
    BillingID         *uint                       `json:"billing_id"`
    Customer          *AdminEnrollmentCustomerDTO `json:"customer"`
    Package           *AdminEnrollmentPackageDTO  `json:"package"`
}

// ToAdminEnrollmentDTO แปลงหนึ่งรายการ (ต้อง Preload Customer.User และ Package.Course มาก่อน)
func ToAdminEnrollmentDTO(e *models.Enrollment) AdminEnrollmentDTO {
    item := AdminEnrollmentDTO{
        ID:                e.ID,
        EnrollmentDate:    e.EnrollmentDate,
        TotalSessions:     e.TotalSessions,
        RemainingSessions: e.RemainingSessions,
        Status:            string(e.Status),
        BillingID:         e.BillingID,
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
        }
        if e.Package.Course != nil {
            pkg.Course = &AdminEnrollmentCourseDTO{
                ID:         e.Package.Course.ID,
                CourseName: e.Package.Course.CourseName,
            }
        }
        item.Package = pkg
    }

    return item
}

// ToAdminEnrollmentDTOs แปลงทั้งรายการ
func ToAdminEnrollmentDTOs(enrollments []models.Enrollment) []AdminEnrollmentDTO {
    result := make([]AdminEnrollmentDTO, 0, len(enrollments))
    for i := range enrollments {
        result = append(result, ToAdminEnrollmentDTO(&enrollments[i]))
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