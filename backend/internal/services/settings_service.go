package services

import (
	"errors"
	"fmt"
	"strconv"

	"CPE-691015/internal/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ─── ค่าตั้งค่าระดับองค์กร ───────────────────────────────────────────────────
//
// ทุกค่าในไฟล์นี้เคยอยู่ใน localStorage ของเบราว์เซอร์แต่ละเครื่อง
// ซึ่งทำให้แอดมินแต่ละคนเห็นกฎไม่ตรงกัน (ดูคอมเมนต์ใน models/app_setting.go)

const (
	// SettingStudentsPerCoach = โค้ช 1 คนต่อนักเรียนกี่คน (ใช้แนะนำจำนวนโค้ชต่อคาบ)
	SettingStudentsPerCoach = "students_per_coach"

	// DefaultStudentsPerCoach ต้องตรงกับค่าเริ่มต้นฝั่งหน้าเว็บ (lib/coachRatio.ts)
	DefaultStudentsPerCoach = 6

	// เพดานกันคนกรอกเลขที่ทำให้คำแนะนำไร้ความหมาย
	maxStudentsPerCoach = 100
)

var ErrInvalidSettingValue = errors.New("ค่าที่ตั้งไม่ถูกต้อง")

type SettingsService struct {
	db *gorm.DB
}

func NewSettingsService(db *gorm.DB) *SettingsService {
	return &SettingsService{db: db}
}

// GetStudentsPerCoach คืนค่าที่ตั้งไว้ หรือค่าเริ่มต้นถ้ายังไม่เคยตั้ง/ค่าเสีย
//
// ไม่คืน error เมื่ออ่านไม่ได้โดยตั้งใจ — นี่เป็นค่าที่ใช้ "แนะนำ" จำนวนโค้ช
// ไม่ใช่ค่าที่ตัดสินเรื่องเงินหรือสิทธิ์ หน้าจัดตารางไม่ควรพังทั้งหน้า
// เพราะอ่านค่าแนะนำไม่ได้
func (s *SettingsService) GetStudentsPerCoach() int {
	var row models.AppSetting
	if err := s.db.First(&row, "key = ?", SettingStudentsPerCoach).Error; err != nil {
		return DefaultStudentsPerCoach
	}

	n, err := strconv.Atoi(row.Value)
	if err != nil || n <= 0 || n > maxStudentsPerCoach {
		return DefaultStudentsPerCoach
	}
	return n
}

// SetStudentsPerCoach บันทึกค่าใหม่ (admin เท่านั้น — ตรวจสิทธิ์ที่ชั้น route)
//
// ⚠️ ตรวจช่วงที่รับได้ที่นี่ ไม่ใช่ที่หน้าเว็บ
// ค่านี้เคยอยู่ในเบราว์เซอร์จึง "ตรวจที่หน้าเว็บก็พอ" แต่พอย้ายมาเป็นค่ากลาง
// ที่ทุกคนใช้ร่วมกัน ใครยิง API ตรงก็เปลี่ยนกฎของทั้งองค์กรได้
func (s *SettingsService) SetStudentsPerCoach(value int, actorUserID uint) (int, error) {
	if value <= 0 || value > maxStudentsPerCoach {
		return 0, fmt.Errorf("%w: อัตราส่วนต้องเป็นจำนวนเต็ม 1-%d", ErrInvalidSettingValue, maxStudentsPerCoach)
	}

	row := models.AppSetting{
		Key:             SettingStudentsPerCoach,
		Value:           strconv.Itoa(value),
		UpdatedByUserID: &actorUserID,
	}

	// upsert — ค่าหนึ่ง key มีได้แถวเดียว และสองคนกดบันทึกพร้อมกันต้องไม่พัง
	if err := s.db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "key"}},
		DoUpdates: clause.AssignmentColumns([]string{"value", "updated_by_user_id", "updated_at"}),
	}).Create(&row).Error; err != nil {
		return 0, errors.New("ไม่สามารถบันทึกค่าตั้งค่าได้")
	}

	return value, nil
}
