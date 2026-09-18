package services

import "testing"

// TestCloudinaryAssetFromURL ตรวจการแยก public_id/resource_type ออกจาก URL ของ Cloudinary
// ซึ่งใช้ตอนลบไฟล์แนบแชทออกจาก storage จริง — parsing พลาดแปลว่าลบไฟล์ผิดตัว/ลบไม่ได้
func TestCloudinaryAssetFromURL(t *testing.T) {
	cases := []struct {
		name         string
		url          string
		wantPublicID string
		wantRT       string
		wantOK       bool
	}{
		{
			name:         "image in chat subfolder",
			url:          "https://res.cloudinary.com/demo/image/upload/v1699999999/koyama/chat/abc123.jpg",
			wantPublicID: "koyama/chat/abc123",
			wantRT:       "image",
			wantOK:       true,
		},
		{
			name:         "raw pdf",
			url:          "https://res.cloudinary.com/demo/raw/upload/v1/koyama/chat/file.pdf",
			wantPublicID: "koyama/chat/file",
			wantRT:       "raw",
			wantOK:       true,
		},
		{
			name:         "with query string is stripped",
			url:          "https://res.cloudinary.com/demo/image/upload/v123/koyama/chat/x.png?a=1",
			wantPublicID: "koyama/chat/x",
			wantRT:       "image",
			wantOK:       true,
		},
		{
			name:   "local file is not cloudinary",
			url:    "http://localhost:8000/uploads/chat/1699999999.jpg",
			wantOK: false,
		},
		{
			name:   "empty",
			url:    "",
			wantOK: false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			publicID, rt, ok := CloudinaryAssetFromURL(tc.url)
			if ok != tc.wantOK {
				t.Fatalf("ok = %v, want %v", ok, tc.wantOK)
			}
			if !tc.wantOK {
				return
			}
			if publicID != tc.wantPublicID {
				t.Errorf("publicID = %q, want %q", publicID, tc.wantPublicID)
			}
			if rt != tc.wantRT {
				t.Errorf("resourceType = %q, want %q", rt, tc.wantRT)
			}
		})
	}
}
