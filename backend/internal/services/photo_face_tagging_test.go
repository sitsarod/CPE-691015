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
	enabled   bool
	allResult *FaceEmbedAllResult
	allErr    error
	allCalls  int
}

func (f *fakeFaceEngine) Embed(context.Context, []byte) (*FaceEmbedResult, error) {
	return nil, errors.New("ไม่ได้ใช้ในเทสนี้")
}

func (f *fakeFaceEngine) EmbedAll(context.Context, []byte) (*FaceEmbedAllResult, error) {
	f.allCalls++
	return f.allResult, f.allErr
}

func (f *fakeFaceEngine) Enabled() bool { return f.enabled }

// ยังไม่ได้ตั้งค่า face-service ต้องบอกให้ชัดว่าใช้ไม่ได้ ไม่ใช่เงียบแล้วคืนรายชื่อว่าง
// (ผู้เรียกจะได้แยกออกว่า "ระบบไม่พร้อม" ต่างจาก "ในรูปไม่มีใครที่รู้จัก")
func TestDetectStudentsInPhotoRequiresEngine(t *testing.T) {
	db := evalTestDB(t)
	svc := NewPhotoTaggingService(db, &fakeFaceEngine{enabled: false}, NewEvaluationService(db))

	_, _, err := svc.DetectStudentsInPhoto(context.Background(), 100, 1, []byte("รูป"))
	if !errors.Is(err, ErrFaceTaggingUnavailable) {
		t.Fatalf("ควรได้ ErrFaceTaggingUnavailable แต่ได้: %v", err)
	}
}

// คอร์สที่ไม่มีนักเรียนเลย ต้องไม่เสียเวลาเรียกโมเดล — ไม่มีใครให้เทียบอยู่แล้ว
func TestDetectStudentsInPhotoSkipsModelWhenRosterEmpty(t *testing.T) {
	db := evalTestDB(t)
	engine := &fakeFaceEngine{enabled: true}
	svc := NewPhotoTaggingService(db, engine, NewEvaluationService(db))

	coachID := seedCoachFor(t, db, 100, "uid-tag-empty")
	pkgID := seedCourseTaughtBy(t, db, coachID)

	var pkg models.Package
	if err := db.First(&pkg, pkgID).Error; err != nil {
		t.Fatalf("หาแพ็กเกจไม่เจอ: %v", err)
	}

	matches, faceCount, err := svc.DetectStudentsInPhoto(context.Background(), 100, pkg.CourseID, []byte("รูป"))
	if err != nil {
		t.Fatalf("ไม่ควร error: %v", err)
	}
	if len(matches) != 0 || faceCount != 0 {
		t.Fatalf("ควรได้ผลว่างเปล่า แต่ได้ matches=%d faceCount=%d", len(matches), faceCount)
	}
	if engine.allCalls != 0 {
		t.Fatalf("ไม่ควรเรียกโมเดลเลยเมื่อไม่มีนักเรียนในคอร์ส แต่เรียกไป %d ครั้ง", engine.allCalls)
	}
}

// ใบหน้าที่เบลอ/เล็กเกินเกณฑ์ต้องถูกข้าม แต่ยังนับรวมใน faceCount
// เพื่อให้โค้ชรู้ว่า "ระบบเห็นหน้าอยู่นะ แต่ไม่ชัดพอจะเดา" ไม่ใช่เข้าใจว่าในรูปไม่มีคน
func TestDetectStudentsInPhotoSkipsLowQualityFaces(t *testing.T) {
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
	svc := NewPhotoTaggingService(db, engine, NewEvaluationService(db))

	coachID := seedCoachFor(t, db, 100, "uid-tag-lowq")
	pkgID := seedCourseTaughtBy(t, db, coachID)
	seedEnrolledCustomer(t, db, pkgID, models.EnrollmentStatusActive, "qr-tag-lowq")

	var pkg models.Package
	if err := db.First(&pkg, pkgID).Error; err != nil {
		t.Fatalf("หาแพ็กเกจไม่เจอ: %v", err)
	}

	matches, faceCount, err := svc.DetectStudentsInPhoto(context.Background(), 100, pkg.CourseID, []byte("รูป"))
	if err != nil {
		t.Fatalf("ไม่ควร error: %v", err)
	}
	if len(matches) != 0 {
		t.Fatalf("หน้าคุณภาพต่ำต้องถูกข้ามทั้งหมด แต่ได้ %d รายการ", len(matches))
	}
	if faceCount != 2 {
		t.Fatalf("ต้องรายงานว่าเจอ 2 หน้าแม้จะเดาไม่ได้ แต่ได้ %d", faceCount)
	}
}

func TestSortMatchesByConfidence(t *testing.T) {
	matches := []PhotoFaceMatch{
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
