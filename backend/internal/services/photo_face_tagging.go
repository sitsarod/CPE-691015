package services

import (
	"context"
	"errors"
	"log"

	"CPE-691015/internal/models"

	"gorm.io/gorm"
)

// ─── จำแนกนักเรียนในรูปที่โค้ชอัปโหลด ───
//
// ใช้โมเดลตัวเดียวกับเช็คชื่อด้วยใบหน้า (face-service/InsightFace) แต่คนละบริบทกันมาก:
//
//	เช็คชื่อ   = รูปเดียวหนึ่งหน้า ต้องชัวร์ เพราะผลคือหักโควตาที่นักเรียนจ่ายเงินมา
//	แท็กในรูป = รูปหมู่หลายหน้า ผิดได้ เพราะโค้ชต้องกดตรวจทานทุกคนก่อนบันทึกอยู่แล้ว
//
// เกณฑ์ตัดสินจึงแยกคนละชุด env และฝั่งนี้ "ผ่อนกว่า" โดยตั้งใจ — หน้าในรูปหมู่มักเล็ก
// เอียง หรือไกลกว่าเซลฟี่ตอนเช็คชื่อ ถ้าใช้เกณฑ์เดียวกันจะไม่เจอใครเลยเป็นส่วนใหญ่

// เกณฑ์ของฝั่งแท็กรูป — อย่าเอาไปปนกับ FACE_MATCH_* ของเช็คชื่อ
//
// THRESHOLD    ความเหมือนขั้นต่ำที่จะ "เสนอชื่อ" (ไม่ใช่ตัดสินว่าใช่)
// MIN_QUALITY  ความชัดขั้นต่ำของใบหน้าที่เจอ ต่ำกว่านี้ข้ามไปเลยไม่ต้องเดา
func faceTagThreshold() float64  { return envFloat("FACE_TAG_THRESHOLD", 0.30) }
func faceTagMinQuality() float64 { return envFloat("FACE_TAG_MIN_QUALITY", 0.35) }

// PhotoFaceMatch คือนักเรียนหนึ่งคนที่ระบบเดาว่าอยู่ในรูป พร้อมความมั่นใจ
type PhotoFaceMatch struct {
	CustomerID uint
	Nickname   string
	Confidence float64 // 0–1 (cosine similarity)
}

type PhotoTaggingService struct {
	db     *gorm.DB
	engine FaceEngine
	// roster ใช้กติกาเดียวกับหน้าประเมิน — "นักเรียนของคอร์สที่โค้ชคนนี้สอนจริง"
	// ผูกเป็น dependency แทนที่จะ copy query มาไว้เอง เพราะเป็นกติกาด้านสิทธิ์
	// ที่ต้องมีที่มาที่เดียว ถ้าแก้ทีหลังจะได้ไม่หลุดจุดใดจุดหนึ่ง
	roster *EvaluationService
}

func NewPhotoTaggingService(db *gorm.DB, engine FaceEngine, roster *EvaluationService) *PhotoTaggingService {
	return &PhotoTaggingService{db: db, engine: engine, roster: roster}
}

// ErrFaceTaggingUnavailable ใช้เมื่อยังไม่ได้ตั้งค่า face-service — ไม่ใช่ข้อผิดพลาดร้ายแรง
// ผู้เรียกควรปล่อยให้อัปโหลดสำเร็จต่อไปแล้วให้โค้ชแท็กเอง
var ErrFaceTaggingUnavailable = errors.New("ระบบจำแนกใบหน้ายังไม่พร้อมใช้งาน")

// DetectStudentsInPhoto หาว่าในรูปมีนักเรียนคนไหนของคอร์สนี้บ้าง
//
// คืน (รายชื่อที่เดาได้, จำนวนใบหน้าทั้งหมดที่เจอในรูป, error)
//
// จำนวนใบหน้ามีประโยชน์กับหน้าจอ — บอกโค้ชได้ว่า "เจอ 5 หน้า จับคู่ได้ 3 คน"
// เพื่อให้รู้ว่าต้องแท็กเองเพิ่มอีกกี่คน ไม่ใช่เข้าใจผิดว่าระบบเจอครบแล้ว
func (s *PhotoTaggingService) DetectStudentsInPhoto(
	ctx context.Context,
	coachUserID uint,
	courseID uint,
	image []byte,
) ([]PhotoFaceMatch, int, error) {
	if s.engine == nil || !s.engine.Enabled() {
		return nil, 0, ErrFaceTaggingUnavailable
	}

	// จำกัดวงคนที่ต้องเทียบให้เหลือเฉพาะนักเรียนของคอร์สนี้
	// ยิ่งกลุ่มเล็กยิ่งจับผิดคนยาก และเร็วกว่ามาก (เหตุผลเดียวกับ resolveByFace ของเช็คชื่อ)
	students, err := s.roster.GetMyStudents(coachUserID, &courseID)
	if err != nil {
		return nil, 0, err
	}
	if len(students) == 0 {
		return nil, 0, nil
	}

	nicknames := make(map[uint]string, len(students))
	customerIDs := make([]uint, 0, len(students))
	for _, st := range students {
		nicknames[st.ID] = st.Nickname
		customerIDs = append(customerIDs, st.ID)
	}

	result, err := s.engine.EmbedAll(ctx, image)
	if err != nil {
		return nil, 0, err
	}

	// เก็บคะแนนดีที่สุดต่อ "คน" ไม่ใช่ต่อ "ใบหน้า"
	//
	// ⚠️ หน้าหลายใบในรูปเดียวอาจแมตช์คนเดียวกันได้ (เช่นมีกระจก/โปสเตอร์ หรือโมเดล
	// ตรวจซ้อน) ถ้าไม่รวมให้เหลือคนละแถวจะเสนอชื่อซ้ำให้โค้ชกดยืนยันหลายรอบ
	best := make(map[uint]float64)
	for _, face := range result.Faces {
		if face.Quality < faceTagMinQuality() {
			continue // หน้าเบลอ/เล็กเกินไป เดาไปก็มั่ว
		}

		customerID, confidence, err := s.matchFace(face.Embedding, customerIDs)
		if err != nil {
			log.Printf("แท็กใบหน้าในรูปไม่สำเร็จ (course %d): %v", courseID, err)
			continue
		}
		if customerID == 0 {
			continue // ไม่มีใครถึงเกณฑ์
		}
		if current, ok := best[customerID]; !ok || confidence > current {
			best[customerID] = confidence
		}
	}

	matches := make([]PhotoFaceMatch, 0, len(best))
	for customerID, confidence := range best {
		matches = append(matches, PhotoFaceMatch{
			CustomerID: customerID,
			Nickname:   nicknames[customerID],
			Confidence: confidence,
		})
	}
	sortMatchesByConfidence(matches)

	return matches, result.FaceCount, nil
}

// matchFace หาว่าใบหน้าใบนี้ใกล้เคียงนักเรียนคนไหนที่สุดในกลุ่มที่ให้มา
//
// คืน customerID = 0 เมื่อไม่มีใครผ่านเกณฑ์ (ไม่ถือเป็น error — รูปหมู่มีคนนอกคอร์สได้เป็นเรื่องปกติ)
//
// ⚠️ ต่างจากเช็คชื่อตรงที่ "ไม่เช็ค margin" — ที่นั่นถ้าคะแนนสูสีกันสองคนต้องปฏิเสธทันที
// เพราะเดาผิดแล้วหักโควตาผิดคน แต่ที่นี่เสนอชื่ออันดับ 1 ไปพร้อมเปอร์เซ็นต์ให้โค้ชตัดสินเอง
// มีประโยชน์กว่าการเงียบไปเฉย ๆ เพราะยังไงก็ต้องผ่านตาคนก่อนบันทึกอยู่แล้ว
func (s *PhotoTaggingService) matchFace(embedding []float32, customerIDs []uint) (uint, float64, error) {
	var row struct {
		CustomerID uint
		Distance   float64
	}

	// MIN(distance) ต่อคน = เอาท่าที่ตรงที่สุดของคนนั้น (หนึ่งคนลงทะเบียนไว้ได้ 3 ท่า)
	err := s.db.Raw(`
		SELECT fi.customer_id, MIN(fi.embedding <=> ?) AS distance
		FROM face_images fi
		WHERE fi.status = ?
		  AND fi.embedding IS NOT NULL
		  AND fi.customer_id IN ?
		GROUP BY fi.customer_id
		ORDER BY distance ASC
		LIMIT 1
	`, models.FormatEmbedding(embedding), models.FaceImageReady, customerIDs).
		Scan(&row).Error
	if err != nil {
		return 0, 0, err
	}
	if row.CustomerID == 0 {
		return 0, 0, nil // ไม่มีใครในคอร์สนี้ลงทะเบียนใบหน้าไว้เลย
	}

	// pgvector <=> คืน cosine distance (0 = เหมือนเป๊ะ) แปลงเป็นความเหมือน
	confidence := 1 - row.Distance
	if confidence < faceTagThreshold() {
		return 0, 0, nil
	}
	return row.CustomerID, confidence, nil
}

// sortMatchesByConfidence เรียงคนที่มั่นใจมากสุดขึ้นก่อน ให้โค้ชตรวจทานจากง่ายไปยาก
func sortMatchesByConfidence(matches []PhotoFaceMatch) {
	for i := 1; i < len(matches); i++ {
		for j := i; j > 0 && matches[j].Confidence > matches[j-1].Confidence; j-- {
			matches[j], matches[j-1] = matches[j-1], matches[j]
		}
	}
}
