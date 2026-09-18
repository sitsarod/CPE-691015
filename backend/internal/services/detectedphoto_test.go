package services

import (
	"bytes"
	"context"
	"errors"
	"testing"
	"time"

	"CPE-691015/internal/models"
)

func TestVerifyCoachOwnsRawPhoto(t *testing.T) {
	db := newTestDB(t, &models.Coach{}, &models.RawPhoto{})

	coachA := seedCoachFor(t, db, 100, "uid-photo-a")
	seedCoachFor(t, db, 200, "uid-photo-b") // โค้ชอีกคน ไม่ได้เป็นเจ้าของรูป

	owned := models.RawPhoto{PhotoURL: "http://x/a.jpg", CoachID: &coachA}
	db.Create(&owned)

	adminUploaded := models.RawPhoto{PhotoURL: "http://x/admin.jpg", CoachID: nil}
	db.Create(&adminUploaded)

	t.Run("โค้ชเจ้าของรูปเข้าถึงได้", func(t *testing.T) {
		if err := VerifyCoachOwnsRawPhoto(db, &owned, 100, "coach"); err != nil {
			t.Fatalf("ควรผ่าน แต่ได้: %v", err)
		}
	})

	t.Run("โค้ชคนอื่นเข้าถึงไม่ได้", func(t *testing.T) {
		err := VerifyCoachOwnsRawPhoto(db, &owned, 200, "coach")
		if !errors.Is(err, ErrRawPhotoForbidden) {
			t.Fatalf("ควรได้ ErrRawPhotoForbidden แต่ได้: %v", err)
		}
	})

	t.Run("แอดมินเข้าถึงได้ทุกรูป", func(t *testing.T) {
		if err := VerifyCoachOwnsRawPhoto(db, &owned, 999, "admin"); err != nil {
			t.Fatalf("แอดมินควรผ่าน แต่ได้: %v", err)
		}
	})

	t.Run("รูปที่แอดมินอัปโหลดเอง โค้ชเข้าถึงไม่ได้เลย", func(t *testing.T) {
		err := VerifyCoachOwnsRawPhoto(db, &adminUploaded, 100, "coach")
		if !errors.Is(err, ErrRawPhotoForbidden) {
			t.Fatalf("ควรได้ ErrRawPhotoForbidden แต่ได้: %v", err)
		}
	})
}

func TestVerifyCanViewRawPhoto(t *testing.T) {
	db := newTestDB(t, &models.Coach{}, &models.Customer{}, &models.RawPhoto{}, &models.DetectedPhoto{})

	coachA := seedCoachFor(t, db, 100, "uid-view-photo-a")

	tagged := models.Customer{UserID: 300, Gender: models.GenderMale, PersonalQRCode: "qr-view-photo-tagged"}
	db.Create(&tagged)
	untagged := models.Customer{UserID: 301, Gender: models.GenderMale, PersonalQRCode: "qr-view-photo-untagged"}
	db.Create(&untagged)

	rawPhoto := models.RawPhoto{PhotoURL: "/photo-posts/1/raw", CoachID: &coachA}
	db.Create(&rawPhoto)
	db.Create(&models.DetectedPhoto{CustomerID: tagged.ID, RawPhotoID: rawPhoto.ID, PhotoURL: rawPhoto.PhotoURL})

	t.Run("นักเรียนที่ถูกแท็กอยู่ในรูปดูได้", func(t *testing.T) {
		if err := VerifyCanViewRawPhoto(db, &rawPhoto, tagged.UserID, "customer"); err != nil {
			t.Fatalf("ควรผ่าน แต่ได้: %v", err)
		}
	})

	t.Run("นักเรียนที่ไม่ได้ถูกแท็กดูไม่ได้", func(t *testing.T) {
		err := VerifyCanViewRawPhoto(db, &rawPhoto, untagged.UserID, "customer")
		if !errors.Is(err, ErrRawPhotoForbidden) {
			t.Fatalf("ควรได้ ErrRawPhotoForbidden แต่ได้: %v", err)
		}
	})

	t.Run("โค้ชเจ้าของรูปดูได้ (ไม่ต้องถูกแท็ก)", func(t *testing.T) {
		if err := VerifyCanViewRawPhoto(db, &rawPhoto, 100, "coach"); err != nil {
			t.Fatalf("ควรผ่าน แต่ได้: %v", err)
		}
	})
}

// รูปที่ถูกแท็กเข้าโปรไฟล์มาเกิน 7 วันต้องถูกลบถาวรทั้งแถว+แท็ก+ไฟล์จริง ส่วนรูปที่เพิ่งแท็ก
// ต้องไม่โดนหางเลข (นับอายุจากตอนแท็ก ไม่ใช่ตอนอัปโหลดดิบ — ดู DeleteOldRawPhotos)
func TestDeleteOldRawPhotos(t *testing.T) {
	db := newTestDB(t, &models.RawPhoto{}, &models.DetectedPhoto{}, &models.Customer{})
	cleanupPrivateMediaRoot(t)

	storage := NewLocalMediaStorage()
	svc := NewDetectedPhotoService(db).WithMediaStorage(storage)
	ctx := context.Background()

	oldKey, err := storage.Save(ctx, MediaKindPhotoPost, bytes.NewReader([]byte("old")), ".jpg")
	if err != nil {
		t.Fatalf("เตรียมไฟล์เก่าไม่สำเร็จ: %v", err)
	}
	newKey, err := storage.Save(ctx, MediaKindPhotoPost, bytes.NewReader([]byte("new")), ".jpg")
	if err != nil {
		t.Fatalf("เตรียมไฟล์ใหม่ไม่สำเร็จ: %v", err)
	}

	oldPhoto := models.RawPhoto{StorageKey: oldKey, PhotoURL: "/photo-posts/1/raw"}
	if err := db.Create(&oldPhoto).Error; err != nil {
		t.Fatalf("สร้างรูปเก่าไม่สำเร็จ: %v", err)
	}

	newPhoto := models.RawPhoto{StorageKey: newKey, PhotoURL: "/photo-posts/2/raw"}
	if err := db.Create(&newPhoto).Error; err != nil {
		t.Fatalf("สร้างรูปใหม่ไม่สำเร็จ: %v", err)
	}

	customer := models.Customer{Gender: models.GenderMale, PersonalQRCode: "qr-retention"}
	db.Create(&customer)

	oldTag := models.DetectedPhoto{CustomerID: customer.ID, RawPhotoID: oldPhoto.ID, PhotoURL: oldPhoto.PhotoURL}
	db.Create(&oldTag)
	if err := db.Model(&oldTag).UpdateColumn("created_at", time.Now().Add(-10*24*time.Hour)).Error; err != nil {
		t.Fatalf("ปรับวันที่แท็กย้อนหลังไม่สำเร็จ: %v", err)
	}
	db.Create(&models.DetectedPhoto{CustomerID: customer.ID, RawPhotoID: newPhoto.ID, PhotoURL: newPhoto.PhotoURL})

	deleted, err := svc.DeleteOldRawPhotos(7 * 24 * time.Hour)
	if err != nil {
		t.Fatalf("ควรผ่าน แต่ได้: %v", err)
	}
	if deleted != 1 {
		t.Fatalf("ควรลบไป 1 รูป แต่ลบไป %d", deleted)
	}

	var remainingPhotos int64
	db.Model(&models.RawPhoto{}).Count(&remainingPhotos)
	if remainingPhotos != 1 {
		t.Fatalf("ควรเหลือรูปใหม่ 1 รูป แต่เหลือ %d", remainingPhotos)
	}

	var remainingTags int64
	db.Model(&models.DetectedPhoto{}).Count(&remainingTags)
	if remainingTags != 1 {
		t.Fatalf("แท็กของรูปเก่าต้องถูกลบไปด้วย เหลือแค่แท็กของรูปใหม่ แต่เหลือ %d", remainingTags)
	}

	if _, _, err := storage.Open(ctx, MediaKindPhotoPost, oldKey); !errors.Is(err, ErrMediaNotFound) {
		t.Fatalf("ไฟล์เก่าควรถูกลบไปจริง แต่ได้: %v", err)
	}
	if _, _, err := storage.Open(ctx, MediaKindPhotoPost, newKey); err != nil {
		t.Fatalf("ไฟล์ใหม่ไม่ควรถูกลบ แต่ได้: %v", err)
	}
}

// รูปที่อัปโหลดมานานแล้วแต่เพิ่งถูกโค้ชตรวจทาน+แท็กเข้าโปรไฟล์เมื่อไม่นานมานี้ ต้องไม่ถูกลบ
// (นักเรียนเพิ่งเห็นรูป ควรได้เวลาดาวน์โหลดเต็ม 7 วันนับจากตอนนั้น ไม่ใช่โดนหักเวลาที่โค้ชกว่าจะ
// มาตรวจทานไปแล้ว) ส่วนรูปที่ไม่เคยถูกแท็กเลยยังใช้เวลาอัปโหลดดิบเป็นเกณฑ์เหมือนเดิม
func TestDeleteOldRawPhotosCountsFromTagTimeNotUpload(t *testing.T) {
	db := newTestDB(t, &models.RawPhoto{}, &models.DetectedPhoto{}, &models.Customer{})
	cleanupPrivateMediaRoot(t)

	storage := NewLocalMediaStorage()
	svc := NewDetectedPhotoService(db).WithMediaStorage(storage)
	ctx := context.Background()

	recentlyTaggedKey, err := storage.Save(ctx, MediaKindPhotoPost, bytes.NewReader([]byte("recently-tagged")), ".jpg")
	if err != nil {
		t.Fatalf("เตรียมไฟล์ไม่สำเร็จ: %v", err)
	}
	neverTaggedKey, err := storage.Save(ctx, MediaKindPhotoPost, bytes.NewReader([]byte("never-tagged")), ".jpg")
	if err != nil {
		t.Fatalf("เตรียมไฟล์ไม่สำเร็จ: %v", err)
	}

	// อัปโหลดมา 30 วันแล้ว แต่โค้ชเพิ่งมาตรวจทาน+แท็กเมื่อวานนี้เอง
	recentlyTagged := models.RawPhoto{StorageKey: recentlyTaggedKey, PhotoURL: "/photo-posts/1/raw"}
	db.Create(&recentlyTagged)
	if err := db.Model(&recentlyTagged).UpdateColumn("created_at", time.Now().Add(-30*24*time.Hour)).Error; err != nil {
		t.Fatalf("ปรับวันที่อัปโหลดย้อนหลังไม่สำเร็จ: %v", err)
	}
	customer := models.Customer{Gender: models.GenderMale, PersonalQRCode: "qr-tag-recent"}
	db.Create(&customer)
	db.Create(&models.DetectedPhoto{CustomerID: customer.ID, RawPhotoID: recentlyTagged.ID, PhotoURL: recentlyTagged.PhotoURL})

	// อัปโหลดมา 30 วันแล้ว ไม่เคยมีใครถูกแท็กเลย (AI หาไม่เจอ/โค้ชยังไม่ตรวจทาน)
	neverTagged := models.RawPhoto{StorageKey: neverTaggedKey, PhotoURL: "/photo-posts/2/raw"}
	db.Create(&neverTagged)
	if err := db.Model(&neverTagged).UpdateColumn("created_at", time.Now().Add(-30*24*time.Hour)).Error; err != nil {
		t.Fatalf("ปรับวันที่อัปโหลดย้อนหลังไม่สำเร็จ: %v", err)
	}

	deleted, err := svc.DeleteOldRawPhotos(7 * 24 * time.Hour)
	if err != nil {
		t.Fatalf("ควรผ่าน แต่ได้: %v", err)
	}
	if deleted != 1 {
		t.Fatalf("ควรลบแค่รูปที่ไม่เคยถูกแท็กเลย 1 รูป แต่ลบไป %d", deleted)
	}

	if _, _, err := storage.Open(ctx, MediaKindPhotoPost, recentlyTaggedKey); err != nil {
		t.Fatalf("รูปที่เพิ่งแท็กไม่ควรถูกลบ แต่ได้: %v", err)
	}
	if _, _, err := storage.Open(ctx, MediaKindPhotoPost, neverTaggedKey); !errors.Is(err, ErrMediaNotFound) {
		t.Fatalf("รูปที่ไม่เคยถูกแท็กเลยและอัปโหลดมานานแล้วควรถูกลบ แต่ได้: %v", err)
	}
}

// ยังไม่ได้ผูก MediaStorage ต้องข้ามไปเงียบๆ ไม่ error (เหมือน worker อื่นที่พึ่งพา dependency ภายนอก)
func TestDeleteOldRawPhotosSkipsWhenMediaStorageMissing(t *testing.T) {
	db := newTestDB(t, &models.RawPhoto{}, &models.DetectedPhoto{}, &models.Customer{})
	svc := NewDetectedPhotoService(db)

	deleted, err := svc.DeleteOldRawPhotos(7 * 24 * time.Hour)
	if err != nil {
		t.Fatalf("ไม่ควร error: %v", err)
	}
	if deleted != 0 {
		t.Fatalf("ควรได้ 0 แต่ได้ %d", deleted)
	}
}

// ลบแท็กของตัวเองต้องไม่กระทบรูปต้นฉบับหรือแท็กของนักเรียนคนอื่นในรูปกลุ่มเดียวกัน
func TestDeleteMyPhotoTag(t *testing.T) {
	db := newTestDB(t, &models.Customer{}, &models.RawPhoto{}, &models.DetectedPhoto{})
	svc := NewDetectedPhotoService(db)

	me := models.Customer{Gender: models.GenderMale, PersonalQRCode: "qr-delete-tag-me"}
	db.Create(&me)
	other := models.Customer{Gender: models.GenderMale, PersonalQRCode: "qr-delete-tag-other"}
	db.Create(&other)

	rawPhoto := models.RawPhoto{PhotoURL: "/photo-posts/1/raw"}
	db.Create(&rawPhoto)
	db.Create(&models.DetectedPhoto{CustomerID: me.ID, RawPhotoID: rawPhoto.ID, PhotoURL: rawPhoto.PhotoURL})
	db.Create(&models.DetectedPhoto{CustomerID: other.ID, RawPhotoID: rawPhoto.ID, PhotoURL: rawPhoto.PhotoURL})

	if err := svc.DeleteMyPhotoTag(me.ID, rawPhoto.ID); err != nil {
		t.Fatalf("ควรลบผ่าน แต่ได้: %v", err)
	}

	var myRemaining int64
	db.Model(&models.DetectedPhoto{}).Where("customer_id = ? AND raw_photo_id = ?", me.ID, rawPhoto.ID).Count(&myRemaining)
	if myRemaining != 0 {
		t.Fatalf("แท็กของตัวเองต้องถูกลบไป แต่ยังเหลือ %d", myRemaining)
	}

	var otherRemaining int64
	db.Model(&models.DetectedPhoto{}).Where("customer_id = ? AND raw_photo_id = ?", other.ID, rawPhoto.ID).Count(&otherRemaining)
	if otherRemaining != 1 {
		t.Fatalf("แท็กของนักเรียนคนอื่นไม่ควรถูกกระทบ แต่เหลือ %d", otherRemaining)
	}

	var remainingPhotos int64
	db.Model(&models.RawPhoto{}).Count(&remainingPhotos)
	if remainingPhotos != 1 {
		t.Fatalf("รูปต้นฉบับไม่ควรถูกลบ แต่เหลือ %d", remainingPhotos)
	}
}

// ลบโพสต์ที่ตัวเองไม่ได้ถูกแท็กอยู่ (คนละ raw_photo_id หรือคนละ customer) ต้องได้ ErrPostNotFound กันเดา ID ของคนอื่นมาลบ
func TestDeleteMyPhotoTagNotFound(t *testing.T) {
	db := newTestDB(t, &models.Customer{}, &models.RawPhoto{}, &models.DetectedPhoto{})
	svc := NewDetectedPhotoService(db)

	me := models.Customer{Gender: models.GenderMale, PersonalQRCode: "qr-delete-tag-missing"}
	db.Create(&me)
	rawPhoto := models.RawPhoto{PhotoURL: "/photo-posts/1/raw"}
	db.Create(&rawPhoto)

	err := svc.DeleteMyPhotoTag(me.ID, rawPhoto.ID)
	if !errors.Is(err, ErrPostNotFound) {
		t.Fatalf("ควรได้ ErrPostNotFound แต่ได้: %v", err)
	}
}

func TestAssignStudentsToPhotoFiltersConsent(t *testing.T) {
	db := newTestDB(t, &models.Customer{}, &models.RawPhoto{}, &models.DetectedPhoto{})

	granted := models.Customer{Gender: models.GenderMale, PersonalQRCode: "qr-photo-granted", FaceConsentStatus: models.FaceConsentGranted}
	db.Create(&granted)
	notGranted := models.Customer{Gender: models.GenderMale, PersonalQRCode: "qr-photo-none", FaceConsentStatus: models.FaceConsentDeclined}
	db.Create(&notGranted)

	rawPhoto := models.RawPhoto{PhotoURL: "http://x/p.jpg"}
	db.Create(&rawPhoto)

	svc := NewDetectedPhotoService(db)
	assigned, skipped, err := svc.AssignStudentsToPhoto(rawPhoto.ID, rawPhoto.PhotoURL, []uint{granted.ID, notGranted.ID})
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
