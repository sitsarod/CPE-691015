package services

import (
	"context"
	"errors"
	"log"

	"CPE-691015/internal/models"

	"gorm.io/gorm"
)

// ─── จำแนกนักเรียนในรูป/วิดีโอที่โค้ชอัปโหลด ───
//
// ใช้โมเดลตัวเดียวกับเช็คชื่อด้วยใบหน้า (face-service/InsightFace) แต่คนละบริบทกันมาก:
//
//	เช็คชื่อ     = รูปเดียวหนึ่งหน้า ต้องชัวร์ เพราะผลคือหักโควตาที่นักเรียนจ่ายเงินมา
//	แท็กในรูป/วิดีโอ = มีหลายหน้า ผิดได้ เพราะโค้ชต้องกดตรวจทานทุกคนก่อนบันทึกอยู่แล้ว
//
// เกณฑ์ตัดสินจึงแยกคนละชุด env และฝั่งนี้ "ผ่อนกว่า" โดยตั้งใจ — หน้าในรูปหมู่/วิดีโอมักเล็ก
// เอียง หรือไกลกว่าเซลฟี่ตอนเช็คชื่อ ถ้าใช้เกณฑ์เดียวกันจะไม่เจอใครเลยเป็นส่วนใหญ่

// เกณฑ์ของฝั่งแท็กรูป/วิดีโอ — อย่าเอาไปปนกับ FACE_MATCH_* ของเช็คชื่อ
//
// THRESHOLD    ความเหมือนขั้นต่ำที่จะ "เสนอชื่อ" (ไม่ใช่ตัดสินว่าใช่)
// MIN_QUALITY  ความชัดขั้นต่ำของใบหน้าที่เจอ ต่ำกว่านี้ข้ามไปเลยไม่ต้องเดา
func faceTagThreshold() float64  { return envFloat("FACE_TAG_THRESHOLD", 0.30) }
func faceTagMinQuality() float64 { return envFloat("FACE_TAG_MIN_QUALITY", 0.35) }

// FaceMatch คือนักเรียนหนึ่งคนที่ระบบเดาว่าอยู่ในรูป/วิดีโอ พร้อมความมั่นใจ
type FaceMatch struct {
	CustomerID uint
	Nickname   string
	Confidence float64 // 0–1 (cosine similarity)
	// BBox คือกรอบใบหน้าที่แมตช์คนนี้ [x1, y1, x2, y2] เป็นพิกเซล — ของรูปต้นฉบับ (ฝั่งรูป) หรือ
	// ของ FrameImage ด้านล่าง (ฝั่งวิดีโอ) ให้หน้าเว็บวาดกรอบ/ชื่อทับตอนตรวจทาน — nil ถ้า
	// face-service ไม่ได้ส่ง bbox มา
	BBox []float64
	// FrameImage คือเฟรมวิดีโอที่ย่อขนาดแล้ว (JPEG base64) ของเฟรมที่แมตช์คนนี้ได้คะแนนดีที่สุด —
	// มีเฉพาะวิดีโอ (รูปฝั่งเดียวไม่ต้องใช้ เพราะหน้าเว็บมีไฟล์ต้นฉบับอยู่แล้ว) bbox ข้างบน
	// อ้างอิงรูปนี้เสมอ ให้หน้าเว็บวาดกรอบทับได้เหมือนฝั่งรูปทุกอย่าง
	FrameImage string
}

// FaceTaggingService จำแนกนักเรียนในรูป (DetectStudentsInPhoto) หรือวิดีโอ (DetectStudentsInVideo)
// ที่โค้ชอัปโหลด — ทั้งสองทางเรียก face-service คนละ endpoint กัน แต่ใช้ตรรกะจับคู่/กรองชุดเดียวกัน
// ทั้งหมด (ดู detectStudentsFromFaces)
type FaceTaggingService struct {
	db     *gorm.DB
	engine FaceEngine
	// roster ใช้กติกาเดียวกับหน้าประเมิน — "นักเรียนของคอร์สที่โค้ชคนนี้สอนจริง"
	// ผูกเป็น dependency แทนที่จะ copy query มาไว้เอง เพราะเป็นกติกาด้านสิทธิ์
	// ที่ต้องมีที่มาที่เดียว ถ้าแก้ทีหลังจะได้ไม่หลุดจุดใดจุดหนึ่ง
	roster *EvaluationService
}

func NewFaceTaggingService(db *gorm.DB, engine FaceEngine, roster *EvaluationService) *FaceTaggingService {
	return &FaceTaggingService{db: db, engine: engine, roster: roster}
}

// ErrFaceTaggingUnavailable ใช้เมื่อยังไม่ได้ตั้งค่า face-service — ไม่ใช่ข้อผิดพลาดร้ายแรง
// ผู้เรียกควรปล่อยให้อัปโหลดสำเร็จต่อไปแล้วให้โค้ชแท็กเอง
var ErrFaceTaggingUnavailable = errors.New("ระบบจำแนกใบหน้ายังไม่พร้อมใช้งาน")

// DetectStudentsInPhoto หาว่าในรูปมีนักเรียนคนไหนของโรงเรียนบ้าง
//
// คืน (รายชื่อที่เดาได้, จำนวนใบหน้าทั้งหมดที่เจอในรูป, error)
//
// จำนวนใบหน้ามีประโยชน์กับหน้าจอ — บอกโค้ชได้ว่า "เจอ 5 หน้า จับคู่ได้ 3 คน"
// เพื่อให้รู้ว่าต้องแท็กเองเพิ่มอีกกี่คน ไม่ใช่เข้าใจผิดว่าระบบเจอครบแล้ว
//
// ⚠️ เทียบกับ "นักเรียนทั้งโรงเรียน" ไม่ใช่แค่คอร์ส/โค้ชของคนอัปโหลด — เพราะคนที่อัปโหลด
// (โค้ชหรือแอดมิน) อาจไม่ใช่คนสอนคอร์สของคนในรูป/วิดีโอนั้นก็ได้ (ดูเหตุผลเต็มที่ GetAllActiveStudents)
func (s *FaceTaggingService) DetectStudentsInPhoto(ctx context.Context, image []byte) ([]FaceMatch, int, error) {
	if s.engine == nil || !s.engine.Enabled() {
		return nil, 0, ErrFaceTaggingUnavailable
	}

	// จำกัดวงคนที่ต้องเทียบให้เหลือเฉพาะนักเรียนที่ลงทะเบียนอยู่จริงก่อนเรียกโมเดล — ถ้าไม่มีใครเลย
	// ก็ไม่ต้องเสียเวลา/เงิน (เรียก API จริง) เรียกโมเดลเลย
	customerIDs, nicknames, err := s.loadRoster()
	if err != nil {
		return nil, 0, err
	}
	if len(customerIDs) == 0 {
		return nil, 0, nil
	}

	result, err := s.engine.EmbedAll(ctx, image)
	if err != nil {
		return nil, 0, err
	}

	matches := s.matchFacesToRoster(result.Faces, customerIDs, nicknames)
	return matches, result.FaceCount, nil
}

// DetectStudentsInVideo หาว่าในวิดีโอมีนักเรียนคนไหนของโรงเรียนบ้าง — เหมือน DetectStudentsInPhoto
// ทุกอย่าง ต่างกันแค่เรียก face-service คนละ endpoint (สุ่มตรวจหลายเฟรมแทนรูปเดียว ดู
// EmbedAllVideo/main.py:embed_all_video) ตรรกะจับคู่/กรองที่เหลือใช้ร่วมกันหมด
func (s *FaceTaggingService) DetectStudentsInVideo(ctx context.Context, video []byte) ([]FaceMatch, int, error) {
	if s.engine == nil || !s.engine.Enabled() {
		return nil, 0, ErrFaceTaggingUnavailable
	}

	customerIDs, nicknames, err := s.loadRoster()
	if err != nil {
		return nil, 0, err
	}
	if len(customerIDs) == 0 {
		return nil, 0, nil
	}

	result, err := s.engine.EmbedAllVideo(ctx, video)
	if err != nil {
		return nil, 0, err
	}

	matches := s.matchFacesToRoster(result.Faces, customerIDs, nicknames)
	return matches, result.FaceCount, nil
}

// loadRoster ดึงรายชื่อนักเรียนทั้งโรงเรียนมาเป็นรูปแบบที่ใช้จับคู่ใบหน้าได้เลย — ใช้ร่วมกันทั้ง
// DetectStudentsInPhoto และ DetectStudentsInVideo (กติกาการดึง roster ต้องเหมือนกันเป๊ะทั้งสองทาง)
func (s *FaceTaggingService) loadRoster() (customerIDs []uint, nicknames map[uint]string, err error) {
	students, err := s.roster.GetAllActiveStudents()
	if err != nil {
		return nil, nil, err
	}

	nicknames = make(map[uint]string, len(students))
	customerIDs = make([]uint, 0, len(students))
	for _, st := range students {
		nicknames[st.ID] = st.Nickname
		customerIDs = append(customerIDs, st.ID)
	}
	return customerIDs, nicknames, nil
}

// matchFacesToRoster จับคู่ใบหน้าที่ตรวจพบมาแล้ว (จากรูปหรือวิดีโอก็ได้) กับรายชื่อนักเรียนที่ส่งมา
// แยกออกมาจาก DetectStudentsInPhoto/DetectStudentsInVideo เพื่อไม่ต้องเขียนตรรกะ
// กรอง/จับคู่/เรียงลำดับซ้ำสองที่
func (s *FaceTaggingService) matchFacesToRoster(
	faces []DetectedFaceEmbedding,
	customerIDs []uint,
	nicknames map[uint]string,
) []FaceMatch {
	// เก็บคะแนนดีที่สุดต่อ "คน" ไม่ใช่ต่อ "ใบหน้า"
	//
	// ⚠️ หน้าหลายใบอาจแมตช์คนเดียวกันได้ (รูปกลุ่มมีกระจก/โปสเตอร์, วิดีโอคนเดิมโผล่หลายเฟรม
	// ที่สุ่มตรวจมา) ถ้าไม่รวมให้เหลือคนละแถวจะเสนอชื่อซ้ำให้โค้ชกดยืนยันหลายรอบ
	// เก็บ bbox/frame image ของใบหน้าที่ให้คะแนนดีที่สุดไว้ด้วย เพื่อวาดกรอบทับให้โค้ชดูตอนตรวจทาน
	// (รูปต้นฉบับฝั่งรูป, เฟรมที่ย่อขนาดแล้วฝั่งวิดีโอ)
	type bestMatch struct {
		confidence float64
		bbox       []float64
		frameImage string
	}
	best := make(map[uint]bestMatch)
	for _, face := range faces {
		if face.Quality < faceTagMinQuality() {
			continue // หน้าเบลอ/เล็กเกินไป เดาไปก็มั่ว
		}

		customerID, confidence, err := s.matchFace(face.Embedding, customerIDs)
		if err != nil {
			log.Printf("แท็กใบหน้าไม่สำเร็จ: %v", err)
			continue
		}
		if customerID == 0 {
			continue // ไม่มีใครถึงเกณฑ์
		}
		if current, ok := best[customerID]; !ok || confidence > current.confidence {
			best[customerID] = bestMatch{confidence: confidence, bbox: face.BBox, frameImage: face.FrameImage}
		}
	}

	matches := make([]FaceMatch, 0, len(best))
	for customerID, m := range best {
		matches = append(matches, FaceMatch{
			CustomerID: customerID,
			Nickname:   nicknames[customerID],
			Confidence: m.confidence,
			BBox:       m.bbox,
			FrameImage: m.frameImage,
		})
	}
	sortMatchesByConfidence(matches)

	return matches
}

// matchFace หาว่าใบหน้าใบนี้ใกล้เคียงนักเรียนคนไหนที่สุดในกลุ่มที่ให้มา
//
// คืน customerID = 0 เมื่อไม่มีใครผ่านเกณฑ์ (ไม่ถือเป็น error — รูปหมู่มีคนนอกคอร์สได้เป็นเรื่องปกติ)
//
// ⚠️ ต่างจากเช็คชื่อตรงที่ "ไม่เช็ค margin" — ที่นั่นถ้าคะแนนสูสีกันสองคนต้องปฏิเสธทันที
// เพราะเดาผิดแล้วหักโควตาผิดคน แต่ที่นี่เสนอชื่ออันดับ 1 ไปพร้อมเปอร์เซ็นต์ให้โค้ชตัดสินเอง
// มีประโยชน์กว่าการเงียบไปเฉย ๆ เพราะยังไงก็ต้องผ่านตาคนก่อนบันทึกอยู่แล้ว
func (s *FaceTaggingService) matchFace(embedding []float32, customerIDs []uint) (uint, float64, error) {
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
func sortMatchesByConfidence(matches []FaceMatch) {
	for i := 1; i < len(matches); i++ {
		for j := i; j > 0 && matches[j].Confidence > matches[j-1].Confidence; j-- {
			matches[j], matches[j-1] = matches[j-1], matches[j]
		}
	}
}
