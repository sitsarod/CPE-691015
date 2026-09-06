package services

import (
	"bytes"
	"context"
	"errors"
	"testing"
	"time"

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

func TestVerifyCanViewRawVideo(t *testing.T) {
	db := newTestDB(t, &models.Coach{}, &models.Customer{}, &models.RawVideo{}, &models.DetectedVideo{})

	coachA := seedCoachFor(t, db, 100, "uid-view-video-a")

	tagged := models.Customer{UserID: 300, Gender: models.GenderMale, PersonalQRCode: "qr-view-video-tagged"}
	db.Create(&tagged)
	untagged := models.Customer{UserID: 301, Gender: models.GenderMale, PersonalQRCode: "qr-view-video-untagged"}
	db.Create(&untagged)

	rawVideo := models.RawVideo{VideoURL: "/videos/1/raw", CoachID: &coachA}
	db.Create(&rawVideo)
	db.Create(&models.DetectedVideo{CustomerID: tagged.ID, RawVideoID: rawVideo.ID, VideoURL: rawVideo.VideoURL})

	t.Run("นักเรียนที่ถูกแท็กอยู่ในวิดีโอดูได้", func(t *testing.T) {
		if err := VerifyCanViewRawVideo(db, &rawVideo, tagged.UserID, "customer"); err != nil {
			t.Fatalf("ควรผ่าน แต่ได้: %v", err)
		}
	})

	t.Run("นักเรียนที่ไม่ได้ถูกแท็กดูไม่ได้", func(t *testing.T) {
		err := VerifyCanViewRawVideo(db, &rawVideo, untagged.UserID, "customer")
		if !errors.Is(err, ErrRawVideoForbidden) {
			t.Fatalf("ควรได้ ErrRawVideoForbidden แต่ได้: %v", err)
		}
	})

	t.Run("โค้ชเจ้าของวิดีโอดูได้ (ไม่ต้องถูกแท็ก)", func(t *testing.T) {
		if err := VerifyCanViewRawVideo(db, &rawVideo, 100, "coach"); err != nil {
			t.Fatalf("ควรผ่าน แต่ได้: %v", err)
		}
	})
}

// วิดีโอที่อัปโหลดมาเกิน 7 วันต้องถูกลบถาวรทั้งแถว+แท็ก+ไฟล์จริง ส่วนที่เพิ่งอัปโหลดต้องไม่โดนหางเลข
func TestDeleteOldRawVideos(t *testing.T) {
	db := newTestDB(t, &models.RawVideo{}, &models.DetectedVideo{}, &models.Customer{})
	cleanupPrivateMediaRoot(t)

	storage := NewLocalMediaStorage()
	svc := NewDetectedVideoService(db).WithMediaStorage(storage)
	ctx := context.Background()

	oldKey, err := storage.Save(ctx, MediaKindVideo, bytes.NewReader([]byte("old")), ".mp4")
	if err != nil {
		t.Fatalf("เตรียมไฟล์เก่าไม่สำเร็จ: %v", err)
	}
	newKey, err := storage.Save(ctx, MediaKindVideo, bytes.NewReader([]byte("new")), ".mp4")
	if err != nil {
		t.Fatalf("เตรียมไฟล์ใหม่ไม่สำเร็จ: %v", err)
	}

	oldVideo := models.RawVideo{StorageKey: oldKey, VideoURL: "/videos/1/raw"}
	if err := db.Create(&oldVideo).Error; err != nil {
		t.Fatalf("สร้างวิดีโอเก่าไม่สำเร็จ: %v", err)
	}
	if err := db.Model(&oldVideo).UpdateColumn("created_at", time.Now().Add(-10*24*time.Hour)).Error; err != nil {
		t.Fatalf("ปรับวันที่ย้อนหลังไม่สำเร็จ: %v", err)
	}

	newVideo := models.RawVideo{StorageKey: newKey, VideoURL: "/videos/2/raw"}
	if err := db.Create(&newVideo).Error; err != nil {
		t.Fatalf("สร้างวิดีโอใหม่ไม่สำเร็จ: %v", err)
	}

	customer := models.Customer{Gender: models.GenderMale, PersonalQRCode: "qr-video-retention"}
	db.Create(&customer)
	db.Create(&models.DetectedVideo{CustomerID: customer.ID, RawVideoID: oldVideo.ID, VideoURL: oldVideo.VideoURL})

	deleted, err := svc.DeleteOldRawVideos(7 * 24 * time.Hour)
	if err != nil {
		t.Fatalf("ควรผ่าน แต่ได้: %v", err)
	}
	if deleted != 1 {
		t.Fatalf("ควรลบไป 1 วิดีโอ แต่ลบไป %d", deleted)
	}

	var remainingVideos int64
	db.Model(&models.RawVideo{}).Count(&remainingVideos)
	if remainingVideos != 1 {
		t.Fatalf("ควรเหลือวิดีโอใหม่ 1 คลิป แต่เหลือ %d", remainingVideos)
	}

	var remainingTags int64
	db.Model(&models.DetectedVideo{}).Count(&remainingTags)
	if remainingTags != 0 {
		t.Fatalf("แท็กของวิดีโอเก่าต้องถูกลบไปด้วย แต่ยังเหลือ %d", remainingTags)
	}

	if _, _, err := storage.Open(ctx, MediaKindVideo, oldKey); !errors.Is(err, ErrMediaNotFound) {
		t.Fatalf("ไฟล์เก่าควรถูกลบไปจริง แต่ได้: %v", err)
	}
	if _, _, err := storage.Open(ctx, MediaKindVideo, newKey); err != nil {
		t.Fatalf("ไฟล์ใหม่ไม่ควรถูกลบ แต่ได้: %v", err)
	}
}

// ลบแท็กของตัวเองต้องไม่กระทบวิดีโอต้นฉบับหรือแท็กของนักเรียนคนอื่นในวิดีโอเดียวกัน
func TestDeleteMyVideoTag(t *testing.T) {
	db := newTestDB(t, &models.Customer{}, &models.RawVideo{}, &models.DetectedVideo{})
	svc := NewDetectedVideoService(db)

	me := models.Customer{Gender: models.GenderMale, PersonalQRCode: "qr-delete-video-tag-me"}
	db.Create(&me)
	other := models.Customer{Gender: models.GenderMale, PersonalQRCode: "qr-delete-video-tag-other"}
	db.Create(&other)

	rawVideo := models.RawVideo{VideoURL: "/videos/1/raw"}
	db.Create(&rawVideo)
	db.Create(&models.DetectedVideo{CustomerID: me.ID, RawVideoID: rawVideo.ID, VideoURL: rawVideo.VideoURL})
	db.Create(&models.DetectedVideo{CustomerID: other.ID, RawVideoID: rawVideo.ID, VideoURL: rawVideo.VideoURL})

	if err := svc.DeleteMyVideoTag(me.ID, rawVideo.ID); err != nil {
		t.Fatalf("ควรลบผ่าน แต่ได้: %v", err)
	}

	var myRemaining int64
	db.Model(&models.DetectedVideo{}).Where("customer_id = ? AND raw_video_id = ?", me.ID, rawVideo.ID).Count(&myRemaining)
	if myRemaining != 0 {
		t.Fatalf("แท็กของตัวเองต้องถูกลบไป แต่ยังเหลือ %d", myRemaining)
	}

	var otherRemaining int64
	db.Model(&models.DetectedVideo{}).Where("customer_id = ? AND raw_video_id = ?", other.ID, rawVideo.ID).Count(&otherRemaining)
	if otherRemaining != 1 {
		t.Fatalf("แท็กของนักเรียนคนอื่นไม่ควรถูกกระทบ แต่เหลือ %d", otherRemaining)
	}

	var remainingVideos int64
	db.Model(&models.RawVideo{}).Count(&remainingVideos)
	if remainingVideos != 1 {
		t.Fatalf("วิดีโอต้นฉบับไม่ควรถูกลบ แต่เหลือ %d", remainingVideos)
	}
}

// ลบโพสต์ที่ตัวเองไม่ได้ถูกแท็กอยู่ต้องได้ ErrPostNotFound กันเดา ID ของคนอื่นมาลบ
func TestDeleteMyVideoTagNotFound(t *testing.T) {
	db := newTestDB(t, &models.Customer{}, &models.RawVideo{}, &models.DetectedVideo{})
	svc := NewDetectedVideoService(db)

	me := models.Customer{Gender: models.GenderMale, PersonalQRCode: "qr-delete-video-tag-missing"}
	db.Create(&me)
	rawVideo := models.RawVideo{VideoURL: "/videos/1/raw"}
	db.Create(&rawVideo)

	err := svc.DeleteMyVideoTag(me.ID, rawVideo.ID)
	if !errors.Is(err, ErrPostNotFound) {
		t.Fatalf("ควรได้ ErrPostNotFound แต่ได้: %v", err)
	}
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
