package services

import (
	"context"
	"database/sql"
	"errors"
	"io"
	"log"
	"time"

	"CPE-691015/internal/models"

	"gorm.io/gorm"
)

// ─── worker สร้าง embedding ให้รูปที่อัปโหลดเข้ามา ───
//
// ทำงานเบื้องหลังเพราะการเรียก Python service ใช้เวลา 1–3 วินาทีต่อรูป
// ถ้าทำตอนอัปโหลด ผู้ใช้ต้องรอ × 3 ท่า และถ้า service ล่มจะอัปโหลดไม่ได้เลย

const (
	// รอบละไม่กี่แถว กันไม่ให้ tick เดียวกินเวลานานจนซ้อนรอบถัดไป
	faceWorkerBatchSize = 10
	faceWorkerInterval  = 10 * time.Second

	// ⚠️ ต้องยาวกว่าหน้าต่าง autosuspend ของ Neon เสมอ ไม่งั้น compute ไม่มีวันหลับ
	faceWorkerSafetyInterval = 30 * time.Minute

	// ถอยจังหวะทวีคูณเมื่อล้มเหลวชั่วคราว ไม่มีเพดานจำนวนครั้ง — กันแค่ "ลองถี่ ๆ" ไม่ใช่ "ลองอีก"
	faceWorkerBackoffBase = 30 * time.Second
	faceWorkerBackoffMax  = 30 * time.Minute

	faceWorkerLogAttempts = 3

	// เกณฑ์คุณภาพขั้นต่ำ (det_score จากโมเดล) — ต่ำกว่านี้ให้ถ่ายใหม่ดีกว่า
	// เพราะ embedding จากภาพเบลอจะเทียบไม่แม่นตอนเช็คชื่อจริง
	faceQualityThreshold = 0.50

	// เพดานอ่านไฟล์เข้าหน่วยความจำ — ตอนอัปโหลดจำกัดไว้ 5 MB แล้ว
	// เผื่อไว้เป็นเกราะชั้นสองเผื่อมีไฟล์แปลกปลอมเข้ามาทางอื่น
	faceWorkerMaxImageBytes = 8 << 20
)

// faceWorkQueued คือสัญญาณปลุก worker — cap 1 ส่งแบบไม่บล็อก อัปรวดเดียวหลายท่าก็ปลุกครั้งเดียว
var faceWorkQueued = make(chan struct{}, 1)

// NotifyFaceImageQueued ปลุก worker ให้ทำงานทันที เรียกหลังบันทึกแถว pending สำเร็จ
func NotifyFaceImageQueued() {
	select {
	case faceWorkQueued <- struct{}{}:
	default:
	}
}

type FaceEmbeddingWorker struct {
	db     *gorm.DB
	engine FaceEngine
	cld    *CloudinaryService
}

func NewFaceEmbeddingWorker(db *gorm.DB, engine FaceEngine, cld *CloudinaryService) *FaceEmbeddingWorker {
	return &FaceEmbeddingWorker{db: db, engine: engine, cld: cld}
}

// Run รอสัญญาณแล้วประมวลผล จนกว่า ctx จะถูกยกเลิก
//
// ⚠️ ขับด้วยสัญญาณ ไม่ poll — ตอนไม่มีรูปรอต้องไม่แตะฐานเลย ไม่งั้น Neon ไม่หลับ
func (w *FaceEmbeddingWorker) Run(ctx context.Context) {
	if !w.engine.Enabled() || w.cld == nil {
		log.Println("worker สร้าง embedding ไม่เริ่มทำงาน — ยังตั้งค่า face-service หรือ Cloudinary ไม่ครบ")
		return
	}

	// ตื่นครั้งแรกทันที เก็บกวาดแถวที่ค้างมาจากก่อนรีสตาร์ท
	timer := time.NewTimer(0)
	defer timer.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("worker สร้าง embedding หยุดทำงานแล้ว")
			return
		case <-faceWorkQueued:
		case <-timer.C:
		}

		n, err := w.ProcessPending(ctx)
		if err != nil {
			log.Printf("worker สร้าง embedding ล้มเหลว: %v", err)
		} else if n > 0 {
			log.Printf("worker ประมวลผลรูปใบหน้า %d ใบ", n)
		}

		timer.Stop()
		timer.Reset(w.nextWait(n))
	}
}

// nextWait บอกว่าควรตื่นเองอีกทีเมื่อไหร่ ถ้าไม่มีใครมาปลุกก่อน
func (w *FaceEmbeddingWorker) nextWait(processed int) time.Duration {
	if processed >= faceWorkerBatchSize {
		return faceWorkerInterval
	}

	var earliest sql.NullTime
	row := w.db.Model(&models.FaceImage{}).
		Where("status = ?", models.FaceImagePending).
		Select("MIN(next_attempt_at)").
		Row()
	if row == nil || row.Scan(&earliest) != nil || !earliest.Valid {
		return faceWorkerSafetyInterval
	}

	return max(faceWorkerInterval, min(time.Until(earliest.Time), faceWorkerSafetyInterval))
}

// ProcessPending ประมวลผลรูปสถานะ pending ไม่เกินหนึ่ง batch คืนจำนวนที่ตัดสินผลได้
//
// แยกออกจาก Run เพื่อให้เรียกตรง ๆ ได้เวลาทดสอบ โดยไม่ต้องรอ ticker
func (w *FaceEmbeddingWorker) ProcessPending(ctx context.Context) (int, error) {
	var pending []models.FaceImage
	if err := w.db.
		Where("status = ?", models.FaceImagePending).
		Where("next_attempt_at IS NULL OR next_attempt_at <= ?", time.Now()).
		Order("created_at asc"). // คนที่รอนานที่สุดได้คิวก่อน
		Limit(faceWorkerBatchSize).
		Find(&pending).Error; err != nil {
		return 0, err
	}

	done := 0
	for i := range pending {
		// เช็คก่อนทุกใบ เพราะ batch หนึ่งอาจใช้เวลาหลายสิบวินาที
		if ctx.Err() != nil {
			return done, nil
		}
		if w.processOne(ctx, &pending[i]) {
			done++
		}
	}
	return done, nil
}

// processOne คืน true เมื่อ "ตัดสินผลได้แล้ว" (ไม่ว่าจะผ่านหรือไม่ผ่าน)
//
// คืน false เมื่อยังตัดสินไม่ได้เพราะเหตุชั่วคราว เช่น service ล่มหรือเน็ตมีปัญหา
// กรณีนั้นต้องปล่อยแถวไว้ที่ pending เพื่อให้รอบถัดไปลองใหม่
// ห้ามมาร์ค rejected เด็ดขาด เพราะนั่นจะลบไฟล์ของผู้ใช้ทิ้งเพราะความผิดของระบบเอง
func (w *FaceEmbeddingWorker) processOne(ctx context.Context, image *models.FaceImage) bool {
	if image.StorageKey == "" {
		w.reject(image, "ไม่พบไฟล์รูปในระบบ")
		return true
	}

	raw, err := w.downloadImage(ctx, image.StorageKey)
	if err != nil {
		w.deferRetry(image, "ดึงรูป", err)
		return false
	}

	res, err := w.engine.Embed(ctx, raw)
	if err != nil {
		w.deferRetry(image, "วิเคราะห์รูป", err)
		return false
	}

	switch {
	case !res.Found:
		w.reject(image, "ไม่พบใบหน้าในรูป กรุณาถ่ายใหม่ให้เห็นหน้าชัดเจน")
	case res.FaceCount > 1:
		w.reject(image, "มีมากกว่าหนึ่งคนในรูป กรุณาถ่ายใหม่ให้มีเฉพาะตัวท่านเอง")
	case res.Quality < faceQualityThreshold:
		w.reject(image, "ภาพไม่ชัดพอ กรุณาถ่ายใหม่ในที่ที่มีแสงเพียงพอ")
	default:
		w.accept(image, res)
	}
	return true
}

// deferRetry เลื่อนคิวของแถวที่ล้มเหลวชั่วคราว กันแถวพังถาวรวนดาวน์โหลดซ้ำไม่รู้จบ
func (w *FaceEmbeddingWorker) deferRetry(image *models.FaceImage, step string, cause error) {
	attempt := image.AttemptCount + 1

	backoff := faceWorkerBackoffBase << min(attempt-1, 16)
	if backoff > faceWorkerBackoffMax || backoff <= 0 {
		backoff = faceWorkerBackoffMax
	}
	next := time.Now().Add(backoff)

	if attempt <= faceWorkerLogAttempts {
		log.Printf("worker: %s id=%d ไม่สำเร็จ (ครั้งที่ %d): %v", step, image.ID, attempt, cause)
	}

	w.update(image, map[string]any{
		"attempt_count":   attempt,
		"next_attempt_at": next,
	})
}

func (w *FaceEmbeddingWorker) downloadImage(ctx context.Context, storageKey string) ([]byte, error) {
	body, _, err := w.cld.DownloadPrivateImage(ctx, storageKey)
	if err != nil {
		return nil, err
	}
	defer body.Close()

	raw, err := io.ReadAll(io.LimitReader(body, faceWorkerMaxImageBytes))
	if err != nil {
		return nil, err
	}
	if len(raw) == 0 {
		return nil, errors.New("ไฟล์ว่างเปล่า")
	}
	return raw, nil
}

// accept เก็บ embedding แล้วส่งต่อให้แอดมินตรวจว่าเป็นเจ้าตัวจริงไหม
//
// ⚠️ ไม่ข้ามไป ready ตรง ๆ — โมเดลบอกได้แค่ "นี่คือใบหน้าคุณภาพดี"
// แต่บอกไม่ได้ว่าเป็นใบหน้าของเจ้าของบัญชีจริงหรือเปล่า คนต้องเป็นด่านสุดท้ายเสมอ
func (w *FaceEmbeddingWorker) accept(image *models.FaceImage, res *FaceEmbedResult) {
	vec := models.FormatEmbedding(res.Embedding)
	w.update(image, map[string]any{
		"status":          models.FaceImageAwaitingReview,
		"embedding":       vec,
		"embedding_model": res.Model,
		"quality_score":   res.Quality,
		"reject_reason":   "",
	})
}

// reject ปฏิเสธรูปแล้วลบไฟล์ทิ้ง — ไม่มีเหตุให้เก็บภาพใบหน้าที่ระบบจะไม่ใช้
func (w *FaceEmbeddingWorker) reject(image *models.FaceImage, reason string) {
	key := image.StorageKey
	if !w.update(image, map[string]any{
		"status":        models.FaceImageRejected,
		"reject_reason": reason,
		"storage_key":   "", // ล้างพร้อมกัน ไม่ให้เหลือแถวที่ชี้ไปหาไฟล์ที่ลบแล้ว
	}) {
		return
	}
	// ลบไฟล์หลังอัปเดตแถวสำเร็จเท่านั้น (ลำดับเดียวกับที่อื่นในระบบ)
	DestroyFaceImageFiles(w.cld, []string{key})
}

// update เขียนผลกลับ โดยเขียนเฉพาะแถวที่ยังเป็น pending อยู่
//
// เงื่อนไข status = pending กันกรณีที่มี worker มากกว่าหนึ่งตัว (เช่นสเกลเป็นสองอินสแตนซ์)
// หยิบแถวเดียวกันไปพร้อมกัน — ตัวที่เขียนทีหลังจะไม่มีผล แทนที่จะไปทับผลของตัวแรก
func (w *FaceEmbeddingWorker) update(image *models.FaceImage, fields map[string]any) bool {
	res := w.db.Model(&models.FaceImage{}).
		Where("id = ? AND status = ?", image.ID, models.FaceImagePending).
		Updates(fields)
	if res.Error != nil {
		log.Printf("worker: บันทึกผลรูป id=%d ไม่สำเร็จ: %v", image.ID, res.Error)
		return false
	}
	return res.RowsAffected > 0
}
