package services

import (
	"errors"
	"testing"

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
