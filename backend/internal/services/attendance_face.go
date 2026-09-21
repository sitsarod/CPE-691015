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

// FaceScanReady บอกว่ารอบนี้มีใบหน้าให้เทียบอยู่จริงไหม
//
// ⚠️ กลุ่มผู้สมัครต้องตรงกับ matchFaceSubject เป๊ะ ๆ ไม่งั้นจะตอบ true ทั้งที่ไม่มีใครให้แมตช์
func (s *AttendanceService) FaceScanReady(tx *gorm.DB, session *models.AttendanceSession) bool {
	if s.faceEngine == nil || !s.faceEngine.Enabled() {
		return false
	}

	packageIDs, err := s.siblingPackageIDs(tx, session)
	if err != nil {
		return false
	}

	var hit []int
	if err := tx.Raw(`
		SELECT 1
		FROM face_images fi
		JOIN enrollments e ON e.customer_id = fi.customer_id
		WHERE fi.status = ?
		  AND fi.embedding IS NOT NULL
		  AND e.package_id IN ?
		  AND e.status = ?
		  AND e.deleted_at IS NULL

		UNION ALL

		SELECT 1
		FROM face_images fi
		JOIN coaches c ON c.id = fi.coach_id
		WHERE fi.status = ?
		  AND fi.embedding IS NOT NULL
		  AND c.status = ?
		  AND c.deleted_at IS NULL

		LIMIT 1
	`,
		models.FaceImageReady, packageIDs, models.EnrollmentStatusActive,
		models.FaceImageReady, coachStatusActive,
	).Scan(&hit).Error; err != nil {
		return false
	}

	return len(hit) > 0
}

// faceCandidate คือหนึ่งอันดับจากการค้นหา
//
// ⚠️ จัดกลุ่มตาม "คน" ไม่ใช่ตาม enrollment เพราะคนหนึ่งคนมี enrollment ที่ active
// ในแพ็กเกจเดียวกันได้มากกว่าหนึ่งใบ (เจอจริงในฐาน: customer 1 มี enrollment 12 กับ 13
// อยู่ในแพ็กเกจ 1 ทั้งคู่) ถ้าจัดกลุ่มตาม enrollment จะได้สองแถวที่เป็นคนเดียวกัน
// ระยะเท่ากันเป๊ะ แล้ว margin = 0 → ถูกปฏิเสธว่า "มีคนหน้าคล้าย" ทั้งที่เป็นตัวเอง
type faceCandidate struct {
	Kind      string
	SubjectID uint
	Distance  float64
}

// faceMatch คือผลว่าใบหน้าในภาพคือใคร — เป็นได้ทั้งนักเรียนและโค้ช
type faceMatch struct {
	Kind      string // dto.ScanKindStudent หรือ dto.ScanKindCoach
	SubjectID uint   // customers.id หรือ coaches.id ตาม Kind
}

// matchFaceSubject หาว่าใบหน้าในภาพคือใคร
//
// ⚠️ ต้องเป็น query เดียวแบบ UNION ห้ามค้นสองรอบแล้วเอาผลมาเทียบกันทีหลัง
//
// margin คือกลไกกันจับผิดคน มันทำงานได้เพราะเทียบอันดับ 1 กับอันดับ 2 ใน
// "กลุ่มผู้สมัครทั้งหมด" ถ้าแยกค้นนักเรียนทีโค้ชที แล้วคิด margin ในกลุ่มใครกลุ่มมัน
// กรณีโค้ชหน้าคล้ายนักเรียนจะผ่านด่านทั้งคู่แล้วจับผิดคนเงียบ ๆ
//
// กลุ่มผู้สมัคร:
//   - นักเรียน = เฉพาะคนที่ลงทะเบียนแพ็กเกจของคาบนี้ (กลุ่มเล็ก จับผิดยาก และเร็ว)
//   - โค้ช     = โค้ชที่ยังทำงานอยู่ทุกคน ไม่จำกัดเฉพาะคนที่มีตารางงานคาบนี้
//     เพราะโค้ชเสริมที่ถูกเรียกมากะทันหันต้องเช็คชื่อได้ เหมือนที่ QR ทำได้
func (s *AttendanceService) matchFaceSubject(
	tx *gorm.DB,
	session *models.AttendanceSession,
	probe *faceProbe,
) (*faceMatch, error) {
	expireStaleEnrollments(tx)

	packageIDs, err := s.siblingPackageIDs(tx, session)
	if err != nil {
		return nil, err
	}

	var rows []faceCandidate
	// MIN(distance) ต่อคน = เอาท่าที่ตรงที่สุดของคนนั้น (หนึ่งคนมีได้ 3 ท่า)
	// LIMIT 2 เพราะต้องใช้อันดับ 2 (ซึ่งเป็น "คนละคน" แน่นอน) มาคำนวณ margin
	if err := tx.Raw(`
		SELECT kind, subject_id, MIN(distance) AS distance
		FROM (
			SELECT 'student' AS kind, e.customer_id AS subject_id, (fi.embedding <=> ?) AS distance
			FROM face_images fi
			JOIN enrollments e ON e.customer_id = fi.customer_id
			WHERE fi.status = ?
			  AND fi.embedding IS NOT NULL
			  AND e.package_id IN ?
			  AND e.status = ?
			  AND e.deleted_at IS NULL

			UNION ALL

			SELECT 'coach' AS kind, c.id AS subject_id, (fi.embedding <=> ?) AS distance
			FROM face_images fi
			JOIN coaches c ON c.id = fi.coach_id
			WHERE fi.status = ?
			  AND fi.embedding IS NOT NULL
			  AND c.status = ?
			  AND c.deleted_at IS NULL
		) t
		GROUP BY kind, subject_id
		ORDER BY distance ASC
		LIMIT 2
	`,
		probe.Vector, models.FaceImageReady, packageIDs, models.EnrollmentStatusActive,
		probe.Vector, models.FaceImageReady, coachStatusActive,
	).Scan(&rows).Error; err != nil {
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
	// ถ้ามีพี่น้องหรือคนหน้าคล้ายอยู่ในกลุ่มเดียวกัน คะแนนอาจผ่านทั้งคู่แล้วจับผิดคนเงียบ ๆ
	// ผลของการผิดคือเด็กคนหนึ่งถูกหักโควตาที่จ่ายเงินมา ส่วนอีกคนได้เรียนฟรี
	if len(rows) > 1 {
		runnerUp := 1 - rows[1].Distance
		probe.Margin = best - runnerUp
		if probe.Margin < faceMatchMargin() {
			return nil, ErrFaceAmbiguous
		}
	} else {
		// มีคนเดียวที่ลงทะเบียนใบหน้าไว้ ไม่มีใครให้สับสนด้วย
		probe.Margin = best
	}

	return &faceMatch{Kind: rows[0].Kind, SubjectID: rows[0].SubjectID}, nil
}

// resolveStudentByFace แปลง customers.id ที่จับคู่ได้ เป็น scanContext ของคาบนี้
//
// ใช้เงื่อนไขเดียวกับ resolveByQR เป๊ะ ๆ เพื่อให้คนที่มีหลาย enrollment ในแพ็กเกจเดียวกัน
// ได้ผลเหมือนกันไม่ว่าจะเช็คชื่อด้วย QR หรือด้วยใบหน้า
func (s *AttendanceService) resolveStudentByFace(
	tx *gorm.DB,
	session *models.AttendanceSession,
	customerID uint,
) (*scanContext, error) {
	return s.resolveClassEnrollment(tx, session, customerID, nil, true)
}

// LookupByFace จังหวะที่ 1 — ถามว่าใคร ไม่เขียนอะไรลงฐาน
//
// กล้องตัวเดียวรับได้ทั้งนักเรียนและโค้ช เหมือนฝั่ง QR — Kind บอกว่าเป็นใคร
func (s *AttendanceService) LookupByFace(sessionID uint, image []byte) (*dto.FaceLookupDTO, error) {
	session, err := s.loadOpenSession(s.db, sessionID)
	if err != nil {
		return nil, err
	}

	vec, err := s.analyzeFace(image)
	if err != nil {
		return nil, err
	}

	probe := &faceProbe{Vector: vec}
	match, err := s.matchFaceSubject(s.db, session, probe)
	if err != nil {
		return nil, err
	}

	if match.Kind == dto.ScanKindCoach {
		var coach models.Coach
		if err := s.db.Preload("User").First(&coach, match.SubjectID).Error; err != nil {
			return nil, ErrCoachNotFound
		}

		result := &dto.CoachFaceScanResultDTO{
			CoachID:    coach.ID,
			Nickname:   coach.Nickname,
			Confidence: probe.Confidence,
			Margin:     probe.Margin,
			CanCheckIn: true,
		}
		if coach.User != nil {
			result.FullName = coach.User.FirstName + " " + coach.User.LastName
		}
		if coach.Status == coachStatusInactive {
			result.CanCheckIn = false
			result.Reason = ErrCoachInactive.Error()
		} else if s.coachAlreadyCheckedIn(session.ID, coach.ID) {
			result.CanCheckIn = false
			result.Reason = ErrCoachAlreadyWorkedIn.Error()
		}
		return &dto.FaceLookupDTO{Kind: dto.ScanKindCoach, Coach: result}, nil
	}

	ctx, err := s.resolveStudentByFace(s.db, session, match.SubjectID)
	if err != nil {
		return nil, err
	}

	student := &dto.FaceScanResultDTO{
		Matched:    true,
		Confidence: probe.Confidence,
		Margin:     probe.Margin,
		ScanResultDTO: dto.ScanResultDTO{
			EnrollmentID:      ctx.Enrollment.ID,
			FullName:          ctx.FullName,
			Nickname:          ctx.Nickname,
			CourseName:        ctx.CourseName,
			PackageSessions:   ctx.PackageSessions,
			TotalSessions:     ctx.Enrollment.TotalSessions,
			RemainingSessions: ctx.Enrollment.RemainingSessions,
			IsConfirmed:       ctx.Confirmed,
			CanCheckIn:        true,
		},
	}

	// บอกล่วงหน้าว่าติดโควตา/เช็คซ้ำ จะได้ไม่ให้แอดมินกดยืนยันแล้วค่อยเจอ error
	if err := s.checkQuotaAndDuplicate(s.db, ctx); err != nil {
		student.CanCheckIn = false
		student.Reason = err.Error()
	}

	return &dto.FaceLookupDTO{Kind: dto.ScanKindStudent, Student: student}, nil
}

// coachAlreadyCheckedIn ใช้บอกล่วงหน้าตอน lookup ว่ากดยืนยันไปก็ชน unique
func (s *AttendanceService) coachAlreadyCheckedIn(sessionID, coachID uint) bool {
	var n int64
	s.db.Model(&models.CoachAttendance{}).
		Where("attendance_session_id = ? AND coach_id = ?", sessionID, coachID).
		Count(&n)
	return n > 0
}

// CheckInByFace จังหวะที่ 2 — บันทึกจริง
//
// ⚠️ รับ "รูปใหม่" เท่านั้น ห้ามรับ enrollment_id/coach_id ที่ได้จาก lookup
// ถ้ารับ id จาก body ใครที่ยึด session ของแอดมินได้จะเช็คชื่อให้ใครก็ได้
// โดยไม่ต้องมีหน้าคนนั้นอยู่ตรงนั้นเลย → ตัวตนต้องถูก resolve ใหม่จากรูปทุกครั้ง
func (s *AttendanceService) CheckInByFace(
	sessionID uint,
	image []byte,
	adminUserID uint,
) (*dto.ScanCheckInDTO, error) {
	session, err := s.loadOpenSession(s.db, sessionID)
	if err != nil {
		return nil, err
	}

	// คำนวณให้เสร็จก่อนเข้า transaction (ดูเหตุผลที่ analyzeFace)
	vec, err := s.analyzeFace(image)
	if err != nil {
		return nil, err
	}

	probe := &faceProbe{Vector: vec}
	match, err := s.matchFaceSubject(s.db, session, probe)
	if err != nil {
		return nil, err
	}

	if match.Kind == dto.ScanKindCoach {
		var coach models.Coach
		if err := s.db.Preload("User").First(&coach, match.SubjectID).Error; err != nil {
			return nil, ErrCoachNotFound
		}
		// recordedBy = nil เหมือนตอนสแกน QR เอง — คนที่ยืนหน้ากล้องคือโค้ชเอง
		// ไม่ใช่แอดมินบันทึกแทน (ต่างจาก ManualCoachCheckIn)
		result, err := s.recordCoachAttendance(sessionID, &coach, models.CheckInMethodFaceScan, "", nil)
		if err != nil {
			return nil, err
		}
		return &dto.ScanCheckInDTO{Kind: dto.ScanKindCoach, Coach: result}, nil
	}

	// ⚠️ ต้องให้ closure เป็นคนเติมคะแนนลง extra ไม่ใช่เขียน &checkInExtra{probe.Confidence}
	// ตรงนี้ — ค่าใน struct literal ถูกประเมินทันทีตั้งแต่ยังไม่ได้ค้นหา จะได้ 0 เสมอ
	// (checkIn อ่าน extra หลังเรียก resolve จบแล้ว การเติมทีหลังผ่าน pointer จึงทัน)
	extra := &checkInExtra{ConfidenceScore: probe.Confidence}

	student, err := s.checkIn(sessionID, func(tx *gorm.DB, sess *models.AttendanceSession) (*scanContext, error) {
		// อ่าน enrollment ใหม่ใน tx เดียวกับที่จะเขียน — ตัวตนยังมาจากรูปในคำขอนี้
		// ไม่ได้มาจากค่าที่ client ส่งมา
		return s.resolveStudentByFace(tx, sess, match.SubjectID)
	}, models.CheckInMethodFaceScan, "", &adminUserID, extra)
	if err != nil {
		return nil, err
	}
	return &dto.ScanCheckInDTO{Kind: dto.ScanKindStudent, Student: student}, nil
}
