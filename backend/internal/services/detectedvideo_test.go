package services

import (
	"errors"
	"testing"

	"CPE-691015/internal/models"
)

func TestVerifyCoachOwnsRawVideo(t *testing.T) {
	db := newTestDB(t, &models.Coach{}, &models.RawVideo{})

	coachA := seedCoachFor(t, db, 100, "uid-video-a")
	seedCoachFor(t, db, 200, "uid-video-b") // โค้ชอีกคน ไม่ได้เป็นเจ้าของวิดีโอ

	if err := db.Create(&models.RawVideo{VideoURL: "http://x/a.mp4", CoachID: &coachA}).Error; err != nil {
		t.Fatalf("สร้างวิดีโอไม่สำเร็จ: %v", err)
	}
	var owned models.RawVideo
	db.Where("coach_id = ?", coachA).First(&owned)

	adminUploaded := models.RawVideo{VideoURL: "http://x/admin.mp4", CoachID: nil}
	db.Create(&adminUploaded)

	t.Run("โค้ชเจ้าของวิดีโอเข้าถึงได้", func(t *testing.T) {
		if err := VerifyCoachOwnsRawVideo(db, &owned, 100, "coach"); err != nil {
			t.Fatalf("ควรผ่าน แต่ได้: %v", err)
		}
	})

	t.Run("โค้ชคนอื่นเข้าถึงไม่ได้", func(t *testing.T) {
		err := VerifyCoachOwnsRawVideo(db, &owned, 200, "coach")
		if !errors.Is(err, ErrRawVideoForbidden) {
			t.Fatalf("ควรได้ ErrRawVideoForbidden แต่ได้: %v", err)
		}
	})

	t.Run("แอดมินเข้าถึงได้ทุกวิดีโอ", func(t *testing.T) {
		if err := VerifyCoachOwnsRawVideo(db, &owned, 999, "admin"); err != nil {
			t.Fatalf("แอดมินควรผ่าน แต่ได้: %v", err)
		}
	})

	t.Run("วิดีโอที่แอดมินอัปโหลดเอง โค้ชเข้าถึงไม่ได้เลยแม้เป็นเจ้าของคนอื่น", func(t *testing.T) {
		err := VerifyCoachOwnsRawVideo(db, &adminUploaded, 100, "coach")
		if !errors.Is(err, ErrRawVideoForbidden) {
			t.Fatalf("ควรได้ ErrRawVideoForbidden แต่ได้: %v", err)
		}
	})
}

func TestManuallyAssignStudentsToVideoFiltersConsent(t *testing.T) {
	db := newTestDB(t, &models.Customer{}, &models.RawVideo{}, &models.DetectedVideo{})

	granted := models.Customer{Gender: models.GenderMale, PersonalQRCode: "qr-video-granted", FaceConsentStatus: models.FaceConsentGranted}
	db.Create(&granted)
	notGranted := models.Customer{Gender: models.GenderMale, PersonalQRCode: "qr-video-none", FaceConsentStatus: models.FaceConsentUnknown}
	db.Create(&notGranted)

	rawVideo := models.RawVideo{VideoURL: "http://x/v.mp4"}
	db.Create(&rawVideo)

	svc := NewDetectedVideoService(db)
	assigned, skipped, err := svc.ManuallyAssignStudentsToVideo(rawVideo.ID, rawVideo.VideoURL, []uint{granted.ID, notGranted.ID})
	if err != nil {
		t.Fatalf("ควรผ่าน แต่ได้: %v", err)
	}

	if len(assigned) != 1 || assigned[0].CustomerID != granted.ID {
		t.Fatalf("ควรผูกได้แค่คนที่ยินยอมแล้ว 1 คน (id=%d) แต่ได้ %+v", granted.ID, assigned)
	}
	if len(skipped) != 1 || skipped[0] != notGranted.ID {
		t.Fatalf("ควรข้ามคนที่ยังไม่ยินยอม (id=%d) แต่ได้ %+v", notGranted.ID, skipped)
	}
}
