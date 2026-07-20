package dto

import "time"

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