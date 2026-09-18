package services

import "testing"

// TestCalculateMatchScore_Thai ตรวจว่าการจับคู่รองรับภาษาไทยที่เขียนติดกันไม่มีเว้นวรรค
// ผ่านชั้น n-gram overlap และยังรักษาลำดับความสำคัญเดิม (exact/substring/keyword)
func TestCalculateMatchScore_Thai(t *testing.T) {
	// exact match มาก่อนเสมอ
	if got := calculateMatchScore("ราคาเท่าไหร่", "ราคาเท่าไหร่", ""); got != 1000 {
		t.Errorf("exact match = %d, want 1000", got)
	}

	// substring: query อยู่ในคำถาม
	if got := calculateMatchScore("มีคอร์สอะไรบ้าง", "คอร์ส", ""); got < 400 {
		t.Errorf("substring match = %d, want >= 400", got)
	}

	// keyword (| separated) ที่พบใน query → 400
	if got := calculateMatchScore("อยากรู้ค่าเทอม", "ค่าเล่าเรียน", "ค่าเทอม|ราคา|จ่ายเงิน"); got != 400 {
		t.Errorf("keyword match = %d, want 400", got)
	}

	// n-gram: ภาษาไทยไม่มีเว้นวรรค + สะกดขาดนิดหน่อย ต้องยังจับคู่ได้ (> 0)
	fuzzy := calculateMatchScore("คอสเรียนมีอะไร", "คอร์สเรียนมีอะไรบ้าง", "")
	if fuzzy <= 0 {
		t.Errorf("thai fuzzy (n-gram) = %d, want > 0", fuzzy)
	}

	// คำถามคนละเรื่องต้องไม่แมตช์ (กัน n-gram over-match)
	if got := calculateMatchScore("สวัสดีครับ", "เปิดสอนวันไหน", ""); got != 0 {
		t.Errorf("unrelated = %d, want 0", got)
	}

	// การจับคู่ที่ตรงกว่า (substring=500) ต้องชนะ n-gram (<=300) เสมอ
	strong := calculateMatchScore("ค่าเทอมเท่าไหร่", "ค่าเทอมเท่าไหร่ครับ", "")
	weak := calculateMatchScore("ค่าเทอมเท่าไหร่", "เปิดรับสมัครตอนไหน", "ค่าเทอม")
	if strong <= weak {
		t.Errorf("stronger match (%d) should beat weaker (%d)", strong, weak)
	}
}

// TestValidateChatAttachmentURL ตรวจว่าอนุญาตเฉพาะไฟล์จากระบบเรา (local/Cloudinary) เท่านั้น
func TestValidateChatAttachmentURL(t *testing.T) {
	s := &autoQAService{} // cloud = nil → ข้ามการเช็คชื่อ cloud

	ok := []string{
		"", // ไม่มีไฟล์แนบ
		"http://localhost:8000/uploads/chat/123.jpg",
		"https://res.cloudinary.com/demo/image/upload/v1/koyama/chat/abc.jpg",
	}
	for _, u := range ok {
		if err := s.validateChatAttachmentURL(u); err != nil {
			t.Errorf("expected allowed: %q, got %v", u, err)
		}
	}

	bad := []string{
		"http://evil.com/tracker.gif",                  // โฮสต์ภายนอกล้วน ๆ
		"https://example.com/uploads/chat/notours.jpg", // path คล้ายแต่คนละโฮสต์
		"notaurl",                                       // parse ไม่ได้ (ไม่มี scheme/host)
	}
	for _, u := range bad {
		if err := s.validateChatAttachmentURL(u); err == nil {
			t.Errorf("expected rejected: %q, got nil", u)
		}
	}
}
