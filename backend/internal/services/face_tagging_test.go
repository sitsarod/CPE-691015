package services

import (
	"context"
	"errors"
	"testing"

	"CPE-691015/internal/models"
)

// ⚠️ เทสชุดนี้ครอบเฉพาะเส้นทางที่ "ไม่แตะ pgvector" เพราะเทสรันบน SQLite ในหน่วยความจำ
// ซึ่งไม่มี operator <=> ของ pgvector (ข้อจำกัดเดียวกับ resolveByFace ของเช็คชื่อที่ไม่มีเทสเช่นกัน)
// ส่วนการจับคู่จริงต้องทดสอบกับ Postgres จริงเท่านั้น

// fakeFaceEngine ปลอม face-service ให้คุมผลลัพธ์ได้โดยไม่ต้องมี Python service จริง
type fakeFaceEngine struct {
	enabled    bool
	allResult  *FaceEmbedAllResult
	allErr     error
	allCalls   int
	videoCalls int
}

func (f *fakeFaceEngine) Embed(context.Context, []byte) (*FaceEmbedResult, error) {
	return nil, errors.New("ไม่ได้ใช้ในเทสนี้")
}

func (f *fakeFaceEngine) EmbedAll(context.Context, []byte) (*FaceEmbedAllResult, error) {
	f.allCalls++
	return f.allResult, f.allErr
}

func (f *fakeFaceEngine) EmbedAllVideo(context.Context, []byte) (*FaceEmbedAllResult, error) {
	f.videoCalls++
	return f.allResult, f.allErr
}

func (f *fakeFaceEngine) Enabled() bool { return f.enabled }

// ยังไม่ได้ตั้งค่า face-service ต้องบอกให้ชัดว่าใช้ไม่ได้ ไม่ใช่เงียบแล้วคืนรายชื่อว่าง
// (ผู้เรียกจะได้แยกออกว่า "ระบบไม่พร้อม" ต่างจาก "ในรูปไม่มีใครที่รู้จัก")
func TestDetectStudentsInPhotoRequiresEngine(t *testing.T) {
	db := evalTestDB(t)
	svc := NewFaceTaggingService(db, &fakeFaceEngine{enabled: false}, NewEvaluationService(db))

	_, _, err := svc.DetectStudentsInPhoto(context.Background(), []byte("รูป"))
	if !errors.Is(err, ErrFaceTaggingUnavailable) {
		t.Fatalf("ควรได้ ErrFaceTaggingUnavailable แต่ได้: %v", err)
	}
}

// ไม่มีนักเรียนลงทะเบียนอยู่เลยทั้งโรงเรียน ต้องไม่เสียเวลาเรียกโมเดล — ไม่มีใครให้เทียบอยู่แล้ว
func TestDetectStudentsInPhotoSkipsModelWhenRosterEmpty(t *testing.T) {
	db := evalTestDB(t)
	engine := &fakeFaceEngine{enabled: true}
	svc := NewFaceTaggingService(db, engine, NewEvaluationService(db))

	matches, faceCount, err := svc.DetectStudentsInPhoto(context.Background(), []byte("รูป"))
	if err != nil {
		t.Fatalf("ไม่ควร error: %v", err)
	}
	if len(matches) != 0 || faceCount != 0 {
		t.Fatalf("ควรได้ผลว่างเปล่า แต่ได้ matches=%d faceCount=%d", len(matches), faceCount)
	}
	if engine.allCalls != 0 {
		t.Fatalf("ไม่ควรเรียกโมเดลเลยเมื่อไม่มีนักเรียนลงทะเบียนเลย แต่เรียกไป %d ครั้ง", engine.allCalls)
	}
}

// ใบหน้าที่เบลอ/เล็กเกินเกณฑ์ต้องไม่ถูกเดาชื่ออัตโนมัติ (ข้าม matchFace ไปเลย) แต่ต้องยังโผล่เป็น
// รายการ "ไม่ทราบชื่อ" (CustomerID=0) พร้อม Confidence = คุณภาพที่เจอ ให้โค้ช/แอดมินเห็นว่ามีคนอยู่
// ตรงนี้จริง ๆ แทนที่จะทิ้งไปเงียบ ๆ จนไม่เหลือหลักฐานอะไรเลย (เคสวิดีโอ/รูปคุณภาพต่ำที่ไม่มีหน้าไหน
// ผ่านเกณฑ์จับคู่อัตโนมัติเลยสักหน้าเดียว — ก่อนหน้านี้จะไม่เหลือการ์ดให้เห็นแม้แต่ใบเดียว)
func TestDetectStudentsInPhotoSurfacesLowQualityFacesAsUnmatched(t *testing.T) {
	db := evalTestDB(t)
	engine := &fakeFaceEngine{
		enabled: true,
		allResult: &FaceEmbedAllResult{
			FaceCount: 2,
			Model:     "buffalo_l",
			Faces: []DetectedFaceEmbedding{
				{Embedding: make([]float32, faceEmbedDimensions), Quality: 0.01},
				{Embedding: make([]float32, faceEmbedDimensions), Quality: 0.02},
			},
		},
	}
	svc := NewFaceTaggingService(db, engine, NewEvaluationService(db))

	coachID := seedCoachFor(t, db, 100, "uid-tag-lowq")
	pkgID := seedCourseTaughtBy(t, db, coachID)
	seedEnrolledCustomer(t, db, pkgID, models.EnrollmentStatusActive, "qr-tag-lowq")

	matches, faceCount, err := svc.DetectStudentsInPhoto(context.Background(), []byte("รูป"))
	if err != nil {
		t.Fatalf("ไม่ควร error: %v", err)
	}
	if len(matches) != 2 {
		t.Fatalf("หน้าคุณภาพต่ำต้องโผล่เป็นรายการไม่ทราบชื่อ 2 รายการ แต่ได้ %d รายการ", len(matches))
	}
	for _, m := range matches {
		if m.CustomerID != 0 {
			t.Fatalf("หน้าคุณภาพต่ำต้องไม่ถูกเดาชื่อ (CustomerID ต้องเป็น 0) แต่ได้ %d", m.CustomerID)
		}
	}
	// เรียงคุณภาพมากไปน้อย (ดู sort.Slice ใน matchFacesToRoster)
	if matches[0].Confidence != 0.02 || matches[1].Confidence != 0.01 {
		t.Fatalf("Confidence ต้องเท่ากับคุณภาพที่เจอและเรียงมากไปน้อย แต่ได้ %v, %v", matches[0].Confidence, matches[1].Confidence)
	}
	if faceCount != 2 {
		t.Fatalf("ต้องรายงานว่าเจอ 2 หน้าแม้จะเดาไม่ได้ แต่ได้ %d", faceCount)
	}
}

// ไม่เจอใบหน้าเลยสักหน้าเดียวในทุกเฟรมที่สุ่มตรวจ (Faces ว่างเปล่า) — ต้องยังโผล่เป็นรายการเดียว
// ที่มีแค่ FrameImage (เฟรมตัวแทนจาก face-service) ไม่มี BBox เลย ให้โค้ช/แอดมินเห็นอย่างน้อยว่า
// คลิปนี้มีเนื้อหาอะไร แทนที่จะไม่มีการ์ดขึ้นเลยแม้แต่ใบเดียว (ดู FaceTaggingService.DetectStudentsInVideo)
func TestDetectStudentsInVideoSurfacesFallbackFrameWhenNoFacesFound(t *testing.T) {
	db := evalTestDB(t)
	engine := &fakeFaceEngine{
		enabled: true,
		allResult: &FaceEmbedAllResult{
			FaceCount:     0,
			Model:         "buffalo_l",
			Faces:         nil,
			FallbackFrame: "เฟรมตัวแทน-base64",
		},
	}
	svc := NewFaceTaggingService(db, engine, NewEvaluationService(db))

	coachID := seedCoachFor(t, db, 100, "uid-tag-fallback")
	pkgID := seedCourseTaughtBy(t, db, coachID)
	seedEnrolledCustomer(t, db, pkgID, models.EnrollmentStatusActive, "qr-tag-fallback")

	matches, faceCount, err := svc.DetectStudentsInVideo(context.Background(), []byte("วิดีโอ"))
	if err != nil {
		t.Fatalf("ไม่ควร error: %v", err)
	}
	if faceCount != 0 {
		t.Fatalf("ต้องรายงาน faceCount=0 แต่ได้ %d", faceCount)
	}
	if len(matches) != 1 {
		t.Fatalf("ต้องโผล่การ์ดเฟรมตัวแทน 1 รายการ แต่ได้ %d รายการ", len(matches))
	}
	m := matches[0]
	if m.CustomerID != 0 {
		t.Fatalf("ต้องไม่ทราบชื่อ (CustomerID=0) แต่ได้ %d", m.CustomerID)
	}
	if m.BBox != nil {
		t.Fatalf("ไม่ควรมี BBox เพราะไม่เจอตำแหน่งใบหน้าให้อ้างอิง แต่ได้ %v", m.BBox)
	}
	if m.FrameImage != "เฟรมตัวแทน-base64" {
		t.Fatalf("FrameImage ต้องเป็นเฟรมตัวแทนที่ face-service ส่งมา แต่ได้ %q", m.FrameImage)
	}
}

// เส้นทางวิดีโอต้องเรียก EmbedAllVideo (ไม่ใช่ EmbedAll) และใช้ตรรกะกรอง/จับคู่ชุดเดียวกับรูป
func TestDetectStudentsInVideoRequiresEngine(t *testing.T) {
	db := evalTestDB(t)
	svc := NewFaceTaggingService(db, &fakeFaceEngine{enabled: false}, NewEvaluationService(db))

	_, _, err := svc.DetectStudentsInVideo(context.Background(), []byte("วิดีโอ"))
	if !errors.Is(err, ErrFaceTaggingUnavailable) {
		t.Fatalf("ควรได้ ErrFaceTaggingUnavailable แต่ได้: %v", err)
	}
}

// ไม่มีนักเรียนลงทะเบียนอยู่เลยทั้งโรงเรียน ต้องไม่เสียเวลาเรียกโมเดล
func TestDetectStudentsInVideoSkipsModelWhenRosterEmpty(t *testing.T) {
	db := evalTestDB(t)
	engine := &fakeFaceEngine{enabled: true}
	svc := NewFaceTaggingService(db, engine, NewEvaluationService(db))

	matches, faceCount, err := svc.DetectStudentsInVideo(context.Background(), []byte("วิดีโอ"))
	if err != nil {
		t.Fatalf("ไม่ควร error: %v", err)
	}
	if len(matches) != 0 || faceCount != 0 {
		t.Fatalf("ควรได้ผลว่างเปล่า แต่ได้ matches=%d faceCount=%d", len(matches), faceCount)
	}
	if engine.videoCalls != 0 {
		t.Fatalf("ไม่ควรเรียกโมเดลเลยเมื่อไม่มีนักเรียนลงทะเบียนเลย แต่เรียกไป %d ครั้ง", engine.videoCalls)
	}
	if engine.allCalls != 0 {
		t.Fatalf("เส้นทางวิดีโอต้องไม่เรียก EmbedAll (รูป) เลย แต่เรียกไป %d ครั้ง", engine.allCalls)
	}
}

// ใบหน้าคนเดิมโผล่ในหลายเฟรมที่สุ่มตรวจมาต้องถูกรวมเป็นแถวเดียว (คะแนนดีที่สุด) ไม่ใช่เสนอซ้ำ
func TestDetectStudentsInVideoMergesSamePersonAcrossFrames(t *testing.T) {
	db := evalTestDB(t)

	coachID := seedCoachFor(t, db, 100, "uid-tag-video-merge")
	pkgID := seedCourseTaughtBy(t, db, coachID)
	seedEnrolledCustomer(t, db, pkgID, models.EnrollmentStatusActive, "qr-tag-video-merge")

	// สองหน้านี้ไม่มีใครลงทะเบียนใบหน้าไว้เลย (ทดสอบ pgvector จริงต้องใช้ Postgres — ดูคอมเมนต์
	// บนสุดของไฟล์) แต่ยังยืนยันได้ว่าเส้นทางวิดีโอเรียก EmbedAllVideo ครั้งเดียวไม่ว่าจะมีกี่เฟรม
	engine := &fakeFaceEngine{
		enabled: true,
		allResult: &FaceEmbedAllResult{
			FaceCount: 3,
			Model:     "buffalo_l",
			Faces: []DetectedFaceEmbedding{
				{Embedding: make([]float32, faceEmbedDimensions), Quality: 0.9},
				{Embedding: make([]float32, faceEmbedDimensions), Quality: 0.9},
				{Embedding: make([]float32, faceEmbedDimensions), Quality: 0.9},
			},
		},
	}
	svc := NewFaceTaggingService(db, engine, NewEvaluationService(db))

	_, faceCount, err := svc.DetectStudentsInVideo(context.Background(), []byte("วิดีโอ"))
	if err != nil {
		t.Fatalf("ไม่ควร error: %v", err)
	}
	if faceCount != 3 {
		t.Fatalf("ต้องรายงานจำนวนใบหน้าดิบทั้งหมดจากทุกเฟรม แต่ได้ %d", faceCount)
	}
	if engine.videoCalls != 1 {
		t.Fatalf("ควรเรียก EmbedAllVideo ครั้งเดียว แต่เรียกไป %d ครั้ง", engine.videoCalls)
	}
}

func TestSortMatchesByConfidence(t *testing.T) {
	matches := []FaceMatch{
		{CustomerID: 1, Confidence: 0.42},
		{CustomerID: 2, Confidence: 0.91},
		{CustomerID: 3, Confidence: 0.67},
	}
	sortMatchesByConfidence(matches)

	want := []uint{2, 3, 1}
	for i, id := range want {
		if matches[i].CustomerID != id {
			t.Fatalf("ลำดับที่ %d ควรเป็น customer %d แต่ได้ %d (%+v)", i, id, matches[i].CustomerID, matches)
		}
	}
}
