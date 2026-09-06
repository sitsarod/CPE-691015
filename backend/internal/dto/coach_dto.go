package dto

// Request สำหรับลงทะเบียนหรือสร้าง Coach (admin เป็นคนกรอกทั้งหมด รวมถึงระดับและค่าจ้างเริ่มต้น)
type CreateCoachRequest struct {
	UserID         uint    `json:"user_id" valid:"required~UserID is required"`
	Phone          string  `json:"phone" valid:"required~phone is required,numeric~เบอร์โทรต้องเป็นตัวเลข,stringlength(10|10)~เบอร์โทรต้องมี 10 หลัก"`
	LineID         string  `json:"lineId"`   // ไม่บังคับ
	Facebook       string  `json:"facebook"` // ไม่บังคับ
	Uid            string  `json:"uid" valid:"required~uid is required,numeric~เลขบัตรประชาชนต้องเป็นตัวเลข,stringlength(13|13)~เลขบัตรประชาชนต้องมี 13 หลัก"`
	Address        string  `json:"address" valid:"required~address is required"`
	BirthDate      string  `json:"birth_date" valid:"required~birthDate is required"` // รูปแบบ YYYY-MM-DD
	Nickname       string  `json:"nickname" valid:"required~nickname is required"`
	ProfilePicture string  `json:"profile_picture"` // optional — ค่อยให้โค้ชอัปโหลดเองในหน้าโปรไฟล์ทีหลัง
	Specialization string  `json:"specialization" valid:"required~specialization is required"`
	CoachLicense   string  `json:"coach_license" valid:"required~coachLicense is required"`
	BankAccount    string  `json:"bank_account" valid:"required~bankAccount is required"`
	PaymentInfo    string  `json:"payment_info" valid:"required~paymentInfo is required"`
	PromptPay      string  `json:"prompt_pay"`                                            // พร้อมเพย์ (ไม่บังคับ)
	PaymentType    string  `json:"payment_type" valid:"required~paymentType is required"` // "per_session" หรือ "monthly"
	PayRate        float64 `json:"pay_rate" valid:"required~payRate is required"`         // บาทต่อครั้ง (per_session) หรือ บาทต่อเดือน (monthly)
}

// UpdateCoachRequest คือข้อมูลที่ coach แก้ไขเองได้
//
// นโยบายของทีม: เจ้าตัวแก้ได้เฉพาะ "ช่องทางติดต่อ" ที่เปลี่ยนบ่อยและความเสี่ยงต่ำ
// ส่วนข้อมูลตัวตนและการเงินต้องให้แอดมินแก้ให้หลังตรวจหลักฐาน
// (ผ่าน PATCH /api/admin/users/:id)
//
// ⚠️ BankAccount กับ PaymentInfo เคยอยู่ในนี้ แต่ถูกย้ายออกโดยตั้งใจ
// เพราะเป็นเป้าหมายอันดับหนึ่งของคนที่ยึดบัญชีโค้ชได้ — เปลี่ยนเลขบัญชีปุ๊บ
// เงินเดือนเข้ากระเป๋าคนอื่นทันที และกว่าจะรู้ตัวก็สิ้นเดือนแล้ว
//
// ⚠️ Nickname ก็ถูกย้ายออกเช่นกัน เพราะเป็นชื่อที่ใช้อ้างอิงตัวตนในระบบ
// (โผล่ในตารางเช็คชื่อและใบเสร็จ) ถ้าเปลี่ยนเองได้จะสับสนว่าใครเป็นใคร
type UpdateCoachRequest struct {
	Phone          *string `json:"phone"`
	LineID         *string `json:"lineId"`
	Facebook       *string `json:"facebook"`
	Address        *string `json:"address"`
	ProfilePicture *string `json:"profile_picture"`
}

// UpdateCoachBankRequest คือการแก้ข้อมูลรับเงินของโค้ช ซึ่งต้องยืนยันรหัสผ่านก่อน
//
// แยกออกจาก UpdateCoachRequest โดยตั้งใจ เพราะสองอย่างนี้มีระดับความเสี่ยงต่างกันมาก
// เบอร์โทรกรอกผิดแล้วแก้ใหม่ได้ แต่เลขบัญชีผิด (หรือถูกคนอื่นเปลี่ยน) = เงินเดือน
// เข้ากระเป๋าคนอื่น และกว่าจะรู้ตัวก็สิ้นเดือนแล้ว
//
// การขอรหัสผ่านซ้ำตรงนี้คือ "step-up authentication" — ป้องกันกรณีที่คนร้าย
// ได้ session ของโค้ชไป (เครื่องเปิดค้างไว้ / token ถูกขโมย) แต่ไม่รู้รหัสผ่าน
// เพราะการมี token อย่างเดียวยังไม่พอจะเปลี่ยนปลายทางเงินได้
//
// ⚠️ CurrentPassword ต้องไม่ถูกเขียนลง log หรือส่งกลับใน response เด็ดขาด
type UpdateCoachBankRequest struct {
	// CurrentPassword คือรหัสผ่านปัจจุบันของเจ้าของบัญชี ใช้ยืนยันตัวตนซ้ำเท่านั้น
	// ไม่ได้เอาไปเปลี่ยนรหัสผ่านใด ๆ
	CurrentPassword string `json:"currentPassword" binding:"required"`

	BankAccount string `json:"bank_account" binding:"required"`
	PaymentInfo string `json:"payment_info" binding:"required"`
	PromptPay   string `json:"prompt_pay"` // พร้อมเพย์ (ไม่บังคับ) — แก้พร้อมข้อมูลบัญชี
}

// Request สำหรับ admin แก้ไขระดับ (specialization), ใบรับรองผู้ฝึกสอน (coach_license),
// ประเภทการจ่ายเงิน (payment_type) และอัตราค่าจ้าง (pay_rate) ของ coach
// แยกออกจาก UpdateCoachRequest โดยตั้งใจ เพื่อไม่ให้ coach เรียก endpoint เดียวกันแล้วแก้ค่าพวกนี้ได้เอง
type AdminUpdateCoachRequest struct {
	Specialization *string  `json:"specialization"`
	CoachLicense   *string  `json:"coach_license"`
	PaymentType    *string  `json:"payment_type"`
	PayRate        *float64 `json:"pay_rate"`
}

// Response สำหรับส่งข้อมูลโค้ชกลับไปแสดงหน้าบ้าน (ใช้กับหน้า list, ซ่อนฟิลด์อ่อนไหวออก)
type CoachResponse struct {
	ID             uint   `json:"id"`
	UserID         uint   `json:"user_id"`
	FirstName      string `json:"firstName"`
	LastName       string `json:"lastName"`
	Email          string `json:"email"`
	Nickname       string `json:"nickname"`
	Specialization string `json:"specialization"`
	CoachLicense   string `json:"coach_license"`
	ProfilePicture string `json:"profile_picture"`
	Phone          string `json:"phone"`
	LineID         string `json:"lineId"`
	Facebook       string `json:"facebook"`
	Status         string `json:"status"`
}

type CoachDetailResponse struct {
	ID             uint    `json:"id"`
	UserID         uint    `json:"user_id"`
	FirstName      string  `json:"first_name"`
	LastName       string  `json:"last_name"`
	Email          string  `json:"email"`
	Nickname       string  `json:"nickname"`
	Phone          string  `json:"phone"`
	LineID         string  `json:"lineId"`
	Facebook       string  `json:"facebook"`
	Uid            string  `json:"uid"`
	Address        string  `json:"address"`
	BirthDate      string  `json:"birth_date"`
	Specialization string  `json:"specialization"`
	CoachLicense   string  `json:"coach_license"`
	ProfilePicture string  `json:"profile_picture"`
	BankAccount    string  `json:"bank_account"`
	PaymentInfo    string  `json:"payment_info"`
	PromptPay      string  `json:"prompt_pay"`
	PaymentType    string  `json:"payment_type"` // แสดงได้ (read-only) แต่แก้ผ่าน endpoint นี้ไม่ได้
	PayRate        float64 `json:"pay_rate"`     // แสดงได้ (read-only) แต่แก้ผ่าน endpoint นี้ไม่ได้
	Bio            string  `json:"bio"`          // รายละเอียดเพิ่มเติม แสดงตอนคลิกโค้ชในหน้าแรก
	HomeImage      string  `json:"home_image"`   // รูปการ์ดโค้ชหน้าแรก (แอดมินตั้งเอง) — ใช้ prefill ฟอร์มแก้ไข

	// PersonalQRCode คือ QR ประจำตัวไว้สแกนเช็คชื่อเข้างาน
	//
	// ตั้งใจใส่ไว้เฉพาะใน response ตัวรายละเอียด (ซึ่งเรียกได้เฉพาะเจ้าของกับ admin)
	// ไม่ใส่ใน CoachResponse ที่ใช้กับหน้า list เพราะค่านี้เป็นความลับ
	// ไม่ควรหลุดไปกับ payload ของรายชื่อโค้ชทั้งหมด
	PersonalQRCode string `json:"personalQR"`

	// MemberCode คือรหัสประจำตัวแบบอ่านออกพูดได้ เช่น KYC0001
	// ไม่ใช่ความลับ (ต่างจาก PersonalQRCode) จึงแสดงได้ตามปกติ
	MemberCode string `json:"memberCode"`
}

// โครงสร้างย่อยของวันและเวลาว่างแต่ละช่วง
type AvailabilityDetail struct {
	DayOfWeek string `json:"day_of_week" valid:"required~dayOfWeek is required"` // เช่น "Monday", "Tuesday"
	StartTime string `json:"start_time" valid:"required~startTime is required"`   // เช่น "09:00"
	EndTime   string `json:"end_time" valid:"required~endTime is required"`       // เช่น "12:00"
}

// Request เมื่อโค้ชกดยืนยันตารางเวลาว่างทั้งหมดเข้ามา
type UpdateCoachAvailabilityRequest struct {
	Availabilities []AvailabilityDetail `json:"availabilities" valid:"required"`
}

// Response สำหรับส่งตารางเวลาว่างกลับไปให้หน้าบ้านหรือ Admin ดู
type CoachAvailabilityResponse struct {
	CoachID        uint                 `json:"coach_id"`
	Nickname       string               `json:"nickname"`
	Availabilities []AvailabilityDetail `json:"availabilities"`
}

// Request เมื่อ Admin เป็นคนสร้างตารางงานให้โค้ช
type CreateWorkScheduleRequest struct {
	CoachID     uint   `json:"coach_id" valid:"required~coachId is required"`
	CourseID    uint   `json:"course_id" valid:"required~courseId is required"`
	Date        string `json:"date" valid:"required~date is required"` // รูปแบบ YYYY-MM-DD
	StartTime   string `json:"start_time" valid:"required~startTime is required"`
	EndTime     string `json:"end_time" valid:"required~endTime is required"`
	CourtNumber string `json:"court_number"` // optional — เว้นว่างได้ (ยังไม่ระบุสนาม)
	Description string `json:"description"`
	// IgnoreAvailability = โหมดฉุกเฉิน: ข้ามการเช็คว่าโค้ชว่างหรือไม่ (แต่ยังเช็คเวลาชน/สนามซ้อน)
	// ใช้กรณีไม่มีโค้ชคนไหนว่างตรงเวลาเลย แต่แอดมินจำเป็นต้องมอบหมาย
	IgnoreAvailability bool `json:"ignore_availability"`
	// อ้างอิงคาบเรียนของ package ที่กำลัง assign (optional — คาบที่สร้างแบบเก่ายังไม่มีค่าเหล่านี้)
	PackageID         *uint `json:"package_id"`
	PackageScheduleID *uint `json:"package_schedule_id"`
}

// โครงสร้างคาบเรียน 1 คาบในสัปดาห์ (ขยายจาก PackageSchedule เป็นวันที่จริง) สำหรับหน้า assign แบบ session-centric
type WeekSessionCoach struct {
	WorkScheduleID uint   `json:"work_schedule_id"`
	CoachID        uint   `json:"coach_id"`
	CoachName      string `json:"coach_name"`
	CourtNumber    string `json:"court_number"`

	// true = มอบหมายนอกกฎปกติ (แอดมินติ๊กฉุกเฉิน หรือโค้ชสแกนเองหน้างาน)
	IsEmergency bool `json:"is_emergency"`
}

type WeekSessionResponse struct {
	PackageID         uint               `json:"package_id"`
	PackageScheduleID uint               `json:"package_schedule_id"`
	CourseID          uint               `json:"course_id"`
	CourseName        string             `json:"course_name"`
	Date              string             `json:"date"` // YYYY-MM-DD
	DayOfWeek         string             `json:"day_of_week"`
	StartTime         string             `json:"start_time"`
	EndTime           string             `json:"end_time"`
	AssignedCoaches   []WeekSessionCoach `json:"assigned_coaches"`

	// GoingCount = จำนวนนักเรียนที่ "ยืนยันมาเรียน" (ClassConfirmation going) ของคลาสนี้
	// TotalCount = จำนวนนักเรียนที่มีสิทธิ์เรียนคาบนี้ทั้งหมด (canAttend)
	// รวมข้าม package ของคอร์สเดียวกัน/เวลาเดียวกันแล้ว (ตามคีย์ merge)
	GoingCount int `json:"going_count"`
	TotalCount int `json:"total_count"`
}

// Response สำหรับแสดงผลปฏิทินงานของโค้ชคนนั้นๆ
type WorkScheduleResponse struct {
	ID          uint   `json:"id"`
	Date        string `json:"date"`
	StartTime   string `json:"start_time"`
	EndTime     string `json:"end_time"`
	CourtNumber string `json:"court_number"`
	CourseName  string `json:"course_name,omitempty"` 
	Description string `json:"description"`
}