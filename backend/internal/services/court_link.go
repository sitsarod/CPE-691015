package services

import (
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"

	"CPE-691015/internal/models"

	"gorm.io/gorm"
)

// การผูกคาบสอนกับตาราง courts — ตัดสินสนามซ้อนด้วย court_id ส่วน court_number เก็บไว้อ่านย้อนหลัง

// ต้องเท่ากับขนาดคอลัมน์ courts.name และ work_schedules.court_number
const maxCourtNameLen = 50

var (
	ErrCourtNameTooLong   = fmt.Errorf("ชื่อสนามยาวได้ไม่เกิน %d ตัวอักษร", maxCourtNameLen)
	ErrCourtNameDuplicate = errors.New("มีสนามชื่อนี้อยู่แล้ว")
	ErrCourtInactive      = errors.New("สนามนี้ปิดใช้งานอยู่ เลือกสนามอื่นหรือเปิดใช้งานก่อน")
	ErrCourtInUse         = errors.New("สนามนี้ยังมีคาบสอนในอนาคตผูกอยู่")
)

// normalizeCourtName ทำให้ชื่อสนามเทียบกันได้: ตัด/ยุบช่องว่าง และตัดศูนย์นำหน้าของชื่อที่เป็นตัวเลขล้วน
func normalizeCourtName(name string) string {
	name = strings.Join(strings.Fields(name), " ")
	if name == "" {
		return ""
	}
	if isAllDigits(name) {
		trimmed := strings.TrimLeft(name, "0")
		if trimmed == "" {
			return "0"
		}
		return trimmed
	}
	return name
}

func validateCourtNameLength(name string) error {
	if utf8.RuneCountInString(name) > maxCourtNameLen {
		return ErrCourtNameTooLong
	}
	return nil
}

// ensureCourtNameUnique กันชื่อซ้ำหลัง normalize ("1" กับ "01" นับว่าซ้ำ) · excludeID = สนามที่กำลังแก้
func ensureCourtNameUnique(tx *gorm.DB, name string, excludeID uint) error {
	var courts []models.Court
	if err := tx.Where("id <> ?", excludeID).Find(&courts).Error; err != nil {
		return err
	}
	wanted := normalizeCourtName(name)
	for _, c := range courts {
		if normalizeCourtName(c.Name) == wanted {
			return fmt.Errorf("%w (%q)", ErrCourtNameDuplicate, c.Name)
		}
	}
	return nil
}

// resolveCourt หาสนามจาก id หรือจากชื่อ · ไม่ระบุสนามคืน (nil, "", nil)
// ชื่อที่ไม่ตรงกับสนามไหนเก็บเป็นข้อความเฉย ๆ ไม่สร้างสนามใหม่ให้
func resolveCourt(tx *gorm.DB, courtID *uint, courtName string) (*uint, string, error) {
	if courtID != nil && *courtID != 0 {
		var court models.Court
		if err := tx.First(&court, *courtID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil, "", errors.New("ไม่พบสนามที่ระบุ")
			}
			return nil, "", err
		}
		id := court.ID
		return &id, court.Name, nil
	}

	wanted := normalizeCourtName(courtName)
	if wanted == "" {
		return nil, "", nil
	}

	var courts []models.Court
	if err := tx.Order("id ASC").Find(&courts).Error; err != nil {
		return nil, "", err
	}
	for i := range courts {
		if normalizeCourtName(courts[i].Name) == wanted {
			id := courts[i].ID
			return &id, courts[i].Name, nil
		}
	}

	name := strings.TrimSpace(courtName)
	if err := validateCourtNameLength(name); err != nil {
		return nil, "", err
	}
	return nil, name, nil
}

// ensureCourtUsable กันเลือกสนามที่ปิดใช้งาน · keep = สนามเดิมของคาบ (แก้คาบเดิมได้แม้สนามถูกปิดทีหลัง)
func ensureCourtUsable(tx *gorm.DB, courtID, keep *uint) error {
	if courtID == nil {
		return nil
	}
	if keep != nil && *keep == *courtID {
		return nil
	}
	var court models.Court
	if err := tx.Select("id", "is_active").First(&court, *courtID).Error; err != nil {
		return err
	}
	if !court.IsActive {
		return ErrCourtInactive
	}
	return nil
}

// sameCourt บอกว่าสนามที่ส่งมาเป็นสนามเดิมของคาบหรือไม่
func sameCourt(oldID *uint, oldName string, newID *uint, newName string) bool {
	if oldID != nil || newID != nil {
		return oldID != nil && newID != nil && *oldID == *newID
	}
	return normalizeCourtName(oldName) == normalizeCourtName(newName)
}

// BackfillWorkScheduleCourtIDs เติม court_id ให้คาบเก่าที่มีแต่ชื่อสนาม (เรียกจาก cmd/migrate รันซ้ำได้)
// ชื่อซ้ำกันผูกกับสนาม id ต่ำสุด ให้ตรงกับ resolveCourt
func BackfillWorkScheduleCourtIDs(db *gorm.DB) (linked int, unmatched int, err error) {
	var courts []models.Court
	if err := db.Order("id ASC").Find(&courts).Error; err != nil {
		return 0, 0, err
	}
	byName := make(map[string]uint, len(courts))
	for i := range courts {
		key := normalizeCourtName(courts[i].Name)
		if _, seen := byName[key]; key != "" && !seen {
			byName[key] = courts[i].ID
		}
	}

	var rows []models.WorkSchedule
	if err := db.Where("court_id IS NULL AND COALESCE(court_number, '') <> ''").
		Find(&rows).Error; err != nil {
		return 0, 0, err
	}

	for i := range rows {
		id, ok := byName[normalizeCourtName(rows[i].Courtnumber)]
		if !ok {
			unmatched++
			continue
		}
		if err := db.Model(&models.WorkSchedule{}).Where("id = ?", rows[i].ID).
			UpdateColumn("court_id", id).Error; err != nil {
			return linked, unmatched, err
		}
		linked++
	}
	return linked, unmatched, nil
}

// DuplicateCourtNames คืนกลุ่มสนามที่ชื่อซ้ำกันหลัง normalize (ข้อมูลที่สร้างก่อนมีด่านกันชื่อซ้ำ)
// ⚠️ สนามซ้ำถูกมองเป็นคนละสนาม จองทับกันได้ — ต้องให้แอดมินรวมเอง
func DuplicateCourtNames(db *gorm.DB) ([][]models.Court, error) {
	var courts []models.Court
	if err := db.Order("id ASC").Find(&courts).Error; err != nil {
		return nil, err
	}
	groups := make(map[string][]models.Court)
	order := make([]string, 0)
	for _, c := range courts {
		key := normalizeCourtName(c.Name)
		if _, seen := groups[key]; !seen {
			order = append(order, key)
		}
		groups[key] = append(groups[key], c)
	}
	var out [][]models.Court
	for _, key := range order {
		if len(groups[key]) > 1 {
			out = append(out, groups[key])
		}
	}
	return out, nil
}
