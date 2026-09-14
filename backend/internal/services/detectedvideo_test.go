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

// วิดีโอที่ถูกแท็กเข้าโปรไฟล์มาเกิน 7 วันต้องถูกลบถาวรทั้งแถว+แท็ก+ไฟล์จริง ส่วนที่เพิ่งแท็ก
// ต้องไม่โดนหางเลข (นับอายุจากตอนแท็ก ไม่ใช่ตอนอัปโหลดดิบ — ดู DeleteOldRawVideos)
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

	newVideo := models.RawVideo{StorageKey: newKey, VideoURL: "/videos/2/raw"}
	if err := db.Create(&newVideo).Error; err != nil {
		t.Fatalf("สร้างวิดีโอใหม่ไม่สำเร็จ: %v", err)
	}

	customer := models.Customer{Gender: models.GenderMale, PersonalQRCode: "qr-video-retention"}
	db.Create(&customer)

	oldTag := models.DetectedVideo{CustomerID: customer.ID, RawVideoID: oldVideo.ID, VideoURL: oldVideo.VideoURL}
	db.Create(&oldTag)
	if err := db.Model(&oldTag).UpdateColumn("created_at", time.Now().Add(-10*24*time.Hour)).Error; err != nil {
		t.Fatalf("ปรับวันที่แท็กย้อนหลังไม่สำเร็จ: %v", err)
	}
	db.Create(&models.DetectedVideo{CustomerID: customer.ID, RawVideoID: newVideo.ID, VideoURL: newVideo.VideoURL})

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
	if remainingTags != 1 {
		t.Fatalf("แท็กของวิดีโอเก่าต้องถูกลบไปด้วย เหลือแค่แท็กของวิดีโอใหม่ แต่เหลือ %d", remainingTags)
	}

	if _, _, err := storage.Open(ctx, MediaKindVideo, oldKey); !errors.Is(err, ErrMediaNotFound) {
		t.Fatalf("ไฟล์เก่าควรถูกลบไปจริง แต่ได้: %v", err)
	}
	if _, _, err := storage.Open(ctx, MediaKindVideo, newKey); err != nil {
		t.Fatalf("ไฟล์ใหม่ไม่ควรถูกลบ แต่ได้: %v", err)
	}
}

// วิดีโอที่อัปโหลดมานานแล้วแต่เพิ่งถูกโค้ชตรวจทาน+แท็กเข้าโปรไฟล์เมื่อไม่นานมานี้ ต้องไม่ถูกลบ
// ส่วนวิดีโอที่ไม่เคยถูกแท็กเลยยังใช้เวลาอัปโหลดดิบเป็นเกณฑ์เหมือนเดิม (เหตุผลเดียวกับฝั่งรูป)
func TestDeleteOldRawVideosCountsFromTagTimeNotUpload(t *testing.T) {
	db := newTestDB(t, &models.RawVideo{}, &models.DetectedVideo{}, &models.Customer{})
	cleanupPrivateMediaRoot(t)

	storage := NewLocalMediaStorage()
	svc := NewDetectedVideoService(db).WithMediaStorage(storage)
	ctx := context.Background()

	recentlyTaggedKey, err := storage.Save(ctx, MediaKindVideo, bytes.NewReader([]byte("recently-tagged")), ".mp4")
	if err != nil {
		t.Fatalf("เตรียมไฟล์ไม่สำเร็จ: %v", err)
	}
	neverTaggedKey, err := storage.Save(ctx, MediaKindVideo, bytes.NewReader([]byte("never-tagged")), ".mp4")
	if err != nil {
		t.Fatalf("เตรียมไฟล์ไม่สำเร็จ: %v", err)
	}

	recentlyTagged := models.RawVideo{StorageKey: recentlyTaggedKey, VideoURL: "/videos/1/raw"}
	db.Create(&recentlyTagged)
	if err := db.Model(&recentlyTagged).UpdateColumn("created_at", time.Now().Add(-30*24*time.Hour)).Error; err != nil {
		t.Fatalf("ปรับวันที่อัปโหลดย้อนหลังไม่สำเร็จ: %v", err)
	}
	customer := models.Customer{Gender: models.GenderMale, PersonalQRCode: "qr-video-tag-recent"}
	db.Create(&customer)
	db.Create(&models.DetectedVideo{CustomerID: customer.ID, RawVideoID: recentlyTagged.ID, VideoURL: recentlyTagged.VideoURL})

	neverTagged := models.RawVideo{StorageKey: neverTaggedKey, VideoURL: "/videos/2/raw"}
	db.Create(&neverTagged)
	if err := db.Model(&neverTagged).UpdateColumn("created_at", time.Now().Add(-30*24*time.Hour)).Error; err != nil {
		t.Fatalf("ปรับวันที่อัปโหลดย้อนหลังไม่สำเร็จ: %v", err)
	}

	deleted, err := svc.DeleteOldRawVideos(7 * 24 * time.Hour)
	if err != nil {
		t.Fatalf("ควรผ่าน แต่ได้: %v", err)
	}
	if deleted != 1 {
		t.Fatalf("ควรลบแค่วิดีโอที่ไม่เคยถูกแท็กเลย 1 คลิป แต่ลบไป %d", deleted)
	}

	if _, _, err := storage.Open(ctx, MediaKindVideo, recentlyTaggedKey); err != nil {
		t.Fatalf("วิดีโอที่เพิ่งแท็กไม่ควรถูกลบ แต่ได้: %v", err)
	}
	if _, _, err := storage.Open(ctx, MediaKindVideo, neverTaggedKey); !errors.Is(err, ErrMediaNotFound) {
		t.Fatalf("วิดีโอที่ไม่เคยถูกแท็กเลยและอัปโหลดมานานแล้วควรถูกลบ แต่ได้: %v", err)
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
