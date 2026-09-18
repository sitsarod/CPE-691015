package services

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strconv"
	"strings"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var (
	ErrLegalDocUnknown = errors.New("ไม่พบเอกสารที่ต้องการแก้ไข")
	ErrLegalDocInvalid = errors.New("เนื้อหาเอกสารไม่ถูกต้อง")
)

var legalDocKeys = []models.LegalDocumentKey{models.LegalDocFaceConsent, models.LegalDocEnrollmentTerms}

type LegalDocumentService struct {
	db *gorm.DB
}

func NewLegalDocumentService(db *gorm.DB) *LegalDocumentService {
	return &LegalDocumentService{db: db}
}

func defaultFaceConsentContent() dto.FaceConsentContent {
	p := FaceConsentPolicy(dto.DataControllerContact{})
	return dto.FaceConsentContent{
		Title:            p.Title,
		Summary:          p.Summary,
		DataCollected:    p.DataCollected,
		Purposes:         p.Purposes,
		NotUsedFor:       p.NotUsedFor,
		Disclosure:       p.Disclosure,
		Retention:        p.Retention,
		Rights:           p.Rights,
		DeclineNotice:    p.DeclineNotice,
		WithdrawalNotice: p.WithdrawalNotice,
	}
}

func defaultEnrollmentTermsContent() dto.EnrollmentTermsContent {
	t := EnrollmentTerms()
	return dto.EnrollmentTermsContent{Title: t.Title, Sections: t.Sections}
}

func legalDocDefaults(key models.LegalDocumentKey) (string, any, error) {
	switch key {
	case models.LegalDocFaceConsent:
		return models.FaceConsentPolicyVersion, defaultFaceConsentContent(), nil
	case models.LegalDocEnrollmentTerms:
		return EnrollmentTermsVersion, defaultEnrollmentTermsContent(), nil
	}
	return "", nil, ErrLegalDocUnknown
}

// currentLegalRevision คืนฉบับล่าสุดของเอกสาร · ยังไม่มีในฐานจะบันทึกฉบับตั้งต้นจากข้อความในโค้ดให้ก่อน
func currentLegalRevision(db *gorm.DB, key models.LegalDocumentKey) (*models.LegalDocumentRevision, error) {
	var rev models.LegalDocumentRevision
	err := db.Where("doc_key = ?", key).Order("revision DESC").First(&rev).Error
	if err == nil {
		return &rev, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	version, content, err := legalDocDefaults(key)
	if err != nil {
		return nil, err
	}
	raw, err := json.Marshal(content)
	if err != nil {
		return nil, err
	}

	// เลขเวอร์ชันตั้งต้นต้องเท่าค่าในโค้ดเดิม ไม่งั้นทุกคนที่เคยยินยอมจะถูกบังคับให้ยินยอมใหม่
	seed := models.LegalDocumentRevision{DocKey: key, Revision: 1, Version: version, Content: string(raw)}
	if err := db.Clauses(clause.OnConflict{DoNothing: true}).Create(&seed).Error; err != nil {
		return nil, err
	}

	if err := db.Where("doc_key = ?", key).Order("revision DESC").First(&rev).Error; err != nil {
		return nil, err
	}
	return &rev, nil
}

// CurrentFaceConsentVersion คืนเลขเวอร์ชันประกาศใบหน้าที่ใช้อยู่ · อ่านฐานไม่ได้ใช้ค่าตั้งต้นในโค้ด
func CurrentFaceConsentVersion(db *gorm.DB) string {
	version, _ := loadFaceConsentContent(db)
	return version
}

// CurrentEnrollmentTermsVersion คืนเลขเวอร์ชันข้อตกลงการสมัครเรียนที่ใช้อยู่
func CurrentEnrollmentTermsVersion(db *gorm.DB) string {
	return loadEnrollmentTerms(db).Version
}

func loadFaceConsentContent(db *gorm.DB) (string, dto.FaceConsentContent) {
	rev, err := currentLegalRevision(db, models.LegalDocFaceConsent)
	if err == nil {
		var content dto.FaceConsentContent
		if err = json.Unmarshal([]byte(rev.Content), &content); err == nil {
			return rev.Version, content
		}
	}
	log.Printf("[legal] อ่านประกาศใบหน้าจากฐานไม่สำเร็จ ใช้ฉบับตั้งต้นในโค้ดแทน: %v", err)
	return models.FaceConsentPolicyVersion, defaultFaceConsentContent()
}

func loadEnrollmentTerms(db *gorm.DB) dto.EnrollmentTermsRes {
	rev, err := currentLegalRevision(db, models.LegalDocEnrollmentTerms)
	if err == nil {
		var content dto.EnrollmentTermsContent
		if err = json.Unmarshal([]byte(rev.Content), &content); err == nil {
			return dto.EnrollmentTermsRes{Version: rev.Version, Title: content.Title, Sections: content.Sections}
		}
	}
	log.Printf("[legal] อ่านข้อตกลงการสมัครเรียนจากฐานไม่สำเร็จ ใช้ฉบับตั้งต้นในโค้ดแทน: %v", err)
	return EnrollmentTerms()
}

// buildFaceConsentPolicy ประกอบประกาศที่หน้าเว็บแสดง: เนื้อหาจากฐาน + ข้อมูลติดต่อ + อ้างอิงมาตราในโค้ด
func buildFaceConsentPolicy(version string, c dto.FaceConsentContent, controller dto.DataControllerContact) dto.FaceConsentPolicyRes {
	p := FaceConsentPolicy(controller)
	p.Version = version
	p.Title = c.Title
	p.Summary = c.Summary
	p.DataCollected = c.DataCollected
	p.Purposes = c.Purposes
	p.NotUsedFor = c.NotUsedFor
	p.Disclosure = c.Disclosure
	p.Retention = c.Retention
	p.Rights = c.Rights
	p.DeclineNotice = c.DeclineNotice
	p.WithdrawalNotice = c.WithdrawalNotice
	return p
}

// GetTerms คืนข้อตกลงการสมัครเรียนฉบับปัจจุบัน
func (s *EnrollmentService) GetTerms() dto.EnrollmentTermsRes {
	return loadEnrollmentTerms(s.db)
}

// List คืนเอกสารทุกฉบับล่าสุดสำหรับหน้าตั้งค่าแอดมิน
func (s *LegalDocumentService) List() ([]dto.LegalDocumentDTO, error) {
	out := make([]dto.LegalDocumentDTO, 0, len(legalDocKeys))
	for _, key := range legalDocKeys {
		rev, err := currentLegalRevision(s.db, key)
		if err != nil {
			return nil, errors.New("ไม่สามารถดึงเอกสารทางกฎหมายได้")
		}
		out = append(out, toLegalDocumentDTO(rev))
	}
	return out, nil
}

// Update บันทึกฉบับใหม่ของเอกสาร · RequiresReconsent ขึ้นเลขเวอร์ชัน ผู้ใช้ต้องยอมรับใหม่
func (s *LegalDocumentService) Update(key string, req dto.UpdateLegalDocumentReq, adminUserID uint) (*dto.LegalDocumentDTO, error) {
	docKey := models.LegalDocumentKey(key)
	normalized, err := normalizeLegalContent(docKey, req.Content)
	if err != nil {
		return nil, err
	}

	current, err := currentLegalRevision(s.db, docKey)
	if err != nil {
		return nil, errors.New("ไม่สามารถดึงเอกสารฉบับปัจจุบันได้")
	}
	if req.BaseRevision != current.Revision {
		return nil, businessErr("เอกสารนี้ถูกแก้ไขไปแล้วระหว่างที่คุณเปิดหน้าอยู่ — รีเฟรชหน้าแล้วแก้ใหม่อีกครั้ง")
	}

	if normalized == current.Content && !req.RequiresReconsent {
		doc := toLegalDocumentDTO(current)
		return &doc, nil
	}

	version := current.Version
	if req.RequiresReconsent {
		version = bumpLegalVersion(current.Version)
	}

	rev := models.LegalDocumentRevision{
		DocKey:            docKey,
		Revision:          current.Revision + 1,
		Version:           version,
		Content:           normalized,
		RequiresReconsent: req.RequiresReconsent,
		CreatedByUserID:   &adminUserID,
	}
	if err := s.db.Create(&rev).Error; err != nil {
		if isUniqueViolation(err) {
			return nil, businessErr("มีแอดมินคนอื่นบันทึกเอกสารนี้ไปพร้อมกัน — รีเฟรชหน้าแล้วแก้ใหม่อีกครั้ง")
		}
		return nil, errors.New("ไม่สามารถบันทึกเอกสารได้")
	}

	log.Printf("[legal] แอดมิน #%d บันทึก %s ฉบับที่ %d (เวอร์ชัน %s ยอมรับใหม่=%t)",
		adminUserID, docKey, rev.Revision, rev.Version, rev.RequiresReconsent)

	doc := toLegalDocumentDTO(&rev)
	return &doc, nil
}

func toLegalDocumentDTO(rev *models.LegalDocumentRevision) dto.LegalDocumentDTO {
	return dto.LegalDocumentDTO{
		Key:       string(rev.DocKey),
		Version:   rev.Version,
		Revision:  rev.Revision,
		UpdatedAt: rev.CreatedAt,
		Content:   json.RawMessage(rev.Content),
	}
}

// normalizeLegalContent ตรวจและจัดรูปเนื้อหาก่อนบันทึก · คืน JSON ที่ตัดช่องว่างและรายการว่างแล้ว
func normalizeLegalContent(key models.LegalDocumentKey, raw json.RawMessage) (string, error) {
	var out any

	switch key {
	case models.LegalDocFaceConsent:
		var c dto.FaceConsentContent
		if err := json.Unmarshal(raw, &c); err != nil {
			return "", ErrLegalDocInvalid
		}
		c.Title = strings.TrimSpace(c.Title)
		c.Summary = strings.TrimSpace(c.Summary)
		c.DataCollected = cleanLegalItems(c.DataCollected)
		c.Purposes = cleanLegalItems(c.Purposes)
		c.NotUsedFor = cleanLegalItems(c.NotUsedFor)
		c.Disclosure = cleanLegalItems(c.Disclosure)
		c.Retention = strings.TrimSpace(c.Retention)
		c.Rights = cleanLegalItems(c.Rights)
		c.DeclineNotice = strings.TrimSpace(c.DeclineNotice)
		c.WithdrawalNotice = strings.TrimSpace(c.WithdrawalNotice)

		// หัวข้อที่ พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล ม.23 และ ม.19 บังคับให้แจ้ง ห้ามว่าง
		required := []struct {
			label string
			empty bool
		}{
			{"หัวข้อ", c.Title == ""},
			{"คำอธิบาย", c.Summary == ""},
			{"ข้อมูลที่เก็บ", len(c.DataCollected) == 0},
			{"วัตถุประสงค์", len(c.Purposes) == 0},
			{"ผู้ที่อาจได้รับข้อมูล", len(c.Disclosure) == 0},
			{"ระยะเวลาเก็บ", c.Retention == ""},
			{"สิทธิของเจ้าของข้อมูล", len(c.Rights) == 0},
			{"ผลหากไม่ยินยอม", c.DeclineNotice == ""},
			{"ผลของการถอนความยินยอม", c.WithdrawalNotice == ""},
		}
		var missing []string
		for _, r := range required {
			if r.empty {
				missing = append(missing, r.label)
			}
		}
		if len(missing) > 0 {
			return "", fmt.Errorf("%w: กรุณากรอก %s", ErrLegalDocInvalid, strings.Join(missing, ", "))
		}
		out = c

	case models.LegalDocEnrollmentTerms:
		var c dto.EnrollmentTermsContent
		if err := json.Unmarshal(raw, &c); err != nil {
			return "", ErrLegalDocInvalid
		}
		c.Title = strings.TrimSpace(c.Title)
		if c.Title == "" {
			return "", fmt.Errorf("%w: กรุณากรอกหัวข้อ", ErrLegalDocInvalid)
		}

		sections := make([]dto.EnrollmentTermsSection, 0, len(c.Sections))
		for _, sec := range c.Sections {
			sec.Heading = strings.TrimSpace(sec.Heading)
			sec.Items = cleanLegalItems(sec.Items)
			if sec.Heading == "" && len(sec.Items) == 0 {
				continue
			}
			if sec.Heading == "" || len(sec.Items) == 0 {
				return "", fmt.Errorf("%w: ทุกหมวดต้องมีทั้งชื่อหมวดและข้อความอย่างน้อย 1 ข้อ", ErrLegalDocInvalid)
			}
			sections = append(sections, sec)
		}
		if len(sections) == 0 {
			return "", fmt.Errorf("%w: ต้องมีอย่างน้อย 1 หมวด", ErrLegalDocInvalid)
		}
		c.Sections = sections
		out = c

	default:
		return "", ErrLegalDocUnknown
	}

	b, err := json.Marshal(out)
	if err != nil {
		return "", ErrLegalDocInvalid
	}
	return string(b), nil
}

func cleanLegalItems(items []string) []string {
	out := make([]string, 0, len(items))
	for _, it := range items {
		if t := strings.TrimSpace(it); t != "" {
			out = append(out, t)
		}
	}
	return out
}

// bumpLegalVersion ขยับเลขท้ายสุดของเวอร์ชัน เช่น face-v1.3 → face-v1.4, enroll-v1 → enroll-v2
func bumpLegalVersion(v string) string {
	start := len(v)
	for start > 0 && v[start-1] >= '0' && v[start-1] <= '9' {
		start--
	}
	if start == len(v) {
		return v + ".1"
	}
	n, err := strconv.Atoi(v[start:])
	if err != nil {
		return v + ".1"
	}
	return v[:start] + strconv.Itoa(n+1)
}
