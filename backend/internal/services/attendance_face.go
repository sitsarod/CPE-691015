package services

import (
	"context"
	"errors"
	"os"
	"strconv"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"

	"gorm.io/gorm"
)

// ─── เช็คชื่อด้วยการสแกนใบหน้า ───
//
// ล้อโครง QR ทุกอย่าง ต่างกันแค่วิธี resolve ว่าใครยืนอยู่ตรงหน้ากล้อง
// ด่านอื่น (รอบเปิดอยู่ไหม / อยู่ในช่วงเวลาคาบไหม / โควตาเหลือไหม / เช็คซ้ำไหม)
// ได้มาฟรีจาก checkIn() เดิมโดยไม่ต้องเขียนซ้ำ

var (
	ErrFaceEngineUnavailable = errors.New("ระบบสแกนใบหน้าไม่พร้อมใช้งานตอนนี้ กรุณาใช้ QR code แทน")
	ErrNoFaceInImage         = errors.New("ไม่พบใบหน้าในภาพ กรุณาเข้ามาใกล้กล้องอีกนิด")
	ErrMultipleFaces         = errors.New("มีคนหลายคนในกล้อง กรุณาเข้าทีละคน")
	ErrFaceTooBlurry         = errors.New("ภาพไม่ชัดพอ กรุณาลองใหม่ในที่ที่มีแสงเพียงพอ")
	ErrFaceNotRecognized     = errors.New("จำไม่ได้ว่าเป็นใคร กรุณาใช้ QR code หรือให้แอดมินเช็คชื่อให้")
	ErrFaceAmbiguous         = errors.New("ไม่แน่ใจว่าเป็นใคร มีคนหน้าคล้ายกันในคาบนี้ กรุณาใช้ QR code")
)

// เกณฑ์ตัดสิน — อ่านจาก env เพราะต้อง calibrate จากข้อมูลจริงหลังใช้งานจริง
// ไม่ควร hardcode แล้วต้อง deploy ใหม่ทุกครั้งที่ปรับ (แผนข้อ 5.3)
//
// ค่าตั้งต้นอ้างอิงจากที่วัดได้จริงในโปรเจกต์นี้:
// คนเดียวกันคนละมุม 0.67–0.74 · คนละคน ≈ 0.00 → ช่องว่างกว้างมาก 0.40 จึงปลอดภัย
func faceMatchThreshold() float64 { return envFloat("FACE_MATCH_THRESHOLD", 0.40) }
func faceMatchMargin() float64    { return envFloat("FACE_MATCH_MARGIN", 0.08) }
func faceMinQuality() float64     { return envFloat("FACE_MIN_QUALITY", 0.50) }

func envFloat(key string, fallback float64) float64 {
	if v, err := strconv.ParseFloat(os.Getenv(key), 64); err == nil {
		return v
	}
	return fallback
}

// WithFaceEngine ผูกตัวแปลงรูปเป็น embedding เข้ากับ service
//
// แยกเป็นเมธอดแทนการเพิ่มพารามิเตอร์ใน NewAttendanceService เพราะมีแค่เส้นทาง
// สแกนใบหน้าที่ต้องใช้ ส่วน QR/manual ไม่ต้องรู้จักเลย
func (s *AttendanceService) WithFaceEngine(engine FaceEngine) *AttendanceService {
	s.faceEngine = engine
	return s
}

// faceProbe คือผลวิเคราะห์รูปที่เพิ่งถ่ายมา พร้อมคะแนนที่เทียบกับ roster แล้ว
type faceProbe struct {
	Vector     string  // รูปแบบข้อความของ pgvector
	Confidence float64 // similarity ของอันดับ 1
	Margin     float64 // อันดับ 1 นำอันดับ 2 อยู่เท่าไร
}

// analyzeFace เรียก face-service แล้วตรวจว่ารูปใช้ได้ไหม — ต้องเรียก "นอก transaction"
//
// ⚠️ ห้ามเรียกภายใน s.db.Transaction() เด็ดขาด transaction จะกอด DB connection ไว้
// รอ HTTP ตอบ ถ้า service ช้าหรือค้าง connection pool จะหมดแล้วทั้งระบบล่มพร้อมกัน
func (s *AttendanceService) analyzeFace(image []byte) (string, error) {
	if s.faceEngine == nil || !s.faceEngine.Enabled() {
		return "", ErrFaceEngineUnavailable
	}

	res, err := s.faceEngine.Embed(context.Background(), image)
	if err != nil {
		// service ล่ม/เน็ตมีปัญหา — บอกให้ไปใช้ QR ไม่ใช่ปล่อย error ดิบ ๆ ขึ้นหน้าจอ
		return "", ErrFaceEngineUnavailable
	}

	switch {
	case !res.Found:
		return "", ErrNoFaceInImage
	case res.FaceCount > 1:
		return "", ErrMultipleFaces
	case res.Quality < faceMinQuality():
		return "", ErrFaceTooBlurry
	}
	return models.FormatEmbedding(res.Embedding), nil
}

// faceCandidate คือหนึ่งอันดับจากการค้นหาใน roster
//
// ⚠️ จัดกลุ่มตาม "คน" ไม่ใช่ตาม enrollment เพราะคนหนึ่งคนมี enrollment ที่ active
// ในแพ็กเกจเดียวกันได้มากกว่าหนึ่งใบ (เจอจริงในฐาน: customer 1 มี enrollment 12 กับ 13
// อยู่ในแพ็กเกจ 1 ทั้งคู่) ถ้าจัดกลุ่มตาม enrollment จะได้สองแถวที่เป็นคนเดียวกัน
// ระยะเท่ากันเป๊ะ แล้ว margin = 0 → ถูกปฏิเสธว่า "มีคนหน้าคล้าย" ทั้งที่เป็นตัวเอง
type faceCandidate struct {
	CustomerID uint
	Distance   float64
}

// resolveByFace หาว่าใบหน้าในภาพคือใครในคาบนี้
//
// ⚠️ ค้นเฉพาะคนที่ลงทะเบียนแพ็กเกจของคาบนี้ ไม่ใช่ทั้งโรงเรียน
// เหตุผลสองข้อ: ยิ่งกลุ่มเล็กยิ่งจับผิดคนยาก และเร็วกว่ามาก (หลักสิบแถวแทนหลักพัน)
func (s *AttendanceService) resolveByFace(
	tx *gorm.DB,
	session *models.AttendanceSession,
	probe *faceProbe,
) (*scanContext, error) {
	expireStaleEnrollments(tx)

	var rows []faceCandidate
	// MIN(distance) ต่อคน = เอาท่าที่ตรงที่สุดของคนนั้น (หนึ่งคนมีได้ 3 ท่า)
	// LIMIT 2 เพราะต้องใช้อันดับ 2 (ซึ่งเป็น "คนละคน" แน่นอน) มาคำนวณ margin
	if err := tx.Raw(`
		SELECT e.customer_id, MIN(fi.embedding <=> ?) AS distance
		FROM face_images fi
		JOIN enrollments e ON e.customer_id = fi.customer_id
		WHERE fi.status = ?
		  AND fi.embedding IS NOT NULL
		  AND e.package_id = ?
		  AND e.status = ?
		  AND e.deleted_at IS NULL
		GROUP BY e.customer_id
		ORDER BY distance ASC
		LIMIT 2
	`, probe.Vector, models.FaceImageReady, session.PackageID, models.EnrollmentStatusActive).
		Scan(&rows).Error; err != nil {
		return nil, errors.New("ค้นหาใบหน้าไม่สำเร็จ")
	}

	if len(rows) == 0 {
		return nil, ErrFaceNotRecognized
	}

	// pgvector <=> คืน cosine distance (0 = เหมือนเป๊ะ) แปลงเป็นความเหมือน
	best := 1 - rows[0].Distance
	probe.Confidence = best

	if best < faceMatchThreshold() {
		return nil, ErrFaceNotRecognized
	}

	// ⚠️ ต้องดู margin ด้วย ไม่ใช่แค่ "อันดับ 1 ผ่านเกณฑ์ไหม"
	// ถ้ามีพี่น้องหรือคนหน้าคล้ายอยู่คาบเดียวกัน คะแนนอาจผ่านทั้งคู่แล้วจับผิดคนเงียบ ๆ
	// ผลของการผิดคือเด็กคนหนึ่งถูกหักโควตาที่จ่ายเงินมา ส่วนอีกคนได้เรียนฟรี
	if len(rows) > 1 {
		runnerUp := 1 - rows[1].Distance
		probe.Margin = best - runnerUp
		if probe.Margin < faceMatchMargin() {
			return nil, ErrFaceAmbiguous
		}
	} else {
		// มีคนเดียวในคาบที่ลงทะเบียนใบหน้าไว้ ไม่มีใครให้สับสนด้วย
		probe.Margin = best
	}

	// หา enrollment ด้วยเงื่อนไขเดียวกับ resolveByQR เป๊ะ ๆ เพื่อให้คนที่มีหลาย enrollment
	// ในแพ็กเกจเดียวกันได้ผลเหมือนกันไม่ว่าจะเช็คชื่อด้วย QR หรือด้วยใบหน้า
	var enrollment models.Enrollment
	if err := tx.Preload("Customer").Preload("Customer.User").
		Where("customer_id = ? AND package_id = ? AND status = ?",
			rows[0].CustomerID, session.PackageID, models.EnrollmentStatusActive).
		First(&enrollment).Error; err != nil {
		return nil, ErrNotInPackage
	}

	return s.buildContext(tx, session, &enrollment, enrollment.Customer), nil
}

// LookupByFace จังหวะที่ 1 — ถามว่าใคร ไม่เขียนอะไรลงฐาน
func (s *AttendanceService) LookupByFace(sessionID uint, image []byte) (*dto.FaceScanResultDTO, error) {
	session, err := s.loadOpenSession(s.db, sessionID)
	if err != nil {
		return nil, err
	}

	vec, err := s.analyzeFace(image)
	if err != nil {
		return nil, err
	}

	probe := &faceProbe{Vector: vec}
	ctx, err := s.resolveByFace(s.db, session, probe)
	if err != nil {
		return nil, err
	}

	result := &dto.FaceScanResultDTO{
		Matched:    true,
		Confidence: probe.Confidence,
		Margin:     probe.Margin,
		ScanResultDTO: dto.ScanResultDTO{
			EnrollmentID:      ctx.Enrollment.ID,
			FullName:          ctx.FullName,
			Nickname:          ctx.Nickname,
			CourseName:        ctx.CourseName,
			TotalSessions:     ctx.Enrollment.TotalSessions,
			RemainingSessions: ctx.Enrollment.RemainingSessions,
			IsConfirmed:       ctx.Confirmed,
			CanCheckIn:        true,
		},
	}

	// บอกล่วงหน้าว่าติดโควตา/เช็คซ้ำ จะได้ไม่ให้แอดมินกดยืนยันแล้วค่อยเจอ error
	if err := s.checkQuotaAndDuplicate(s.db, ctx); err != nil {
		result.CanCheckIn = false
		result.Reason = err.Error()
	}

	return result, nil
}

// CheckInByFace จังหวะที่ 2 — บันทึกจริง + หักโควตา
//
// ⚠️ รับ "รูปใหม่" เท่านั้น ห้ามรับ enrollment_id ที่ได้จาก lookup
// ถ้ารับ id จาก body ใครที่ยึด session ของแอดมินได้จะเช็คชื่อให้ใครก็ได้
// โดยไม่ต้องมีหน้าคนนั้นอยู่ตรงนั้นเลย → ตัวตนต้องถูก resolve ใหม่จากรูปทุกครั้ง
func (s *AttendanceService) CheckInByFace(
	sessionID uint,
	image []byte,
	adminUserID uint,
) (*dto.CheckInResultDTO, error) {
	// คำนวณให้เสร็จก่อนเข้า transaction (ดูเหตุผลที่ analyzeFace)
	vec, err := s.analyzeFace(image)
	if err != nil {
		return nil, err
	}

	probe := &faceProbe{Vector: vec}

	// ⚠️ ต้องให้ closure เป็นคนเติมคะแนนลง extra ไม่ใช่เขียน &checkInExtra{probe.Confidence}
	// ตรงนี้ — ค่าใน struct literal ถูกประเมินทันทีตั้งแต่ยังไม่ได้ค้นหา จะได้ 0 เสมอ
	// (checkIn อ่าน extra หลังเรียก resolve จบแล้ว การเติมทีหลังผ่าน pointer จึงทัน)
	extra := &checkInExtra{}

	return s.checkIn(sessionID, func(tx *gorm.DB, session *models.AttendanceSession) (*scanContext, error) {
		ctx, err := s.resolveByFace(tx, session, probe)
		if err != nil {
			return nil, err
		}
		extra.ConfidenceScore = probe.Confidence
		return ctx, nil
	}, models.CheckInMethodFaceScan, "", &adminUserID, extra)
}
