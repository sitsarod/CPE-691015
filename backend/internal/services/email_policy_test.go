package services

import (
	"errors"
	"testing"

	"CPE-691015/internal/models"
)

// ทุกบทบาทต้องใช้อีเมลอะไรก็ได้ เมื่อไม่ได้ตั้ง ADMIN_EMAIL_DOMAINS
//
// ของเดิมบังคับ @gmail.com ทำให้ผู้ปกครองที่ใช้ hotmail หรืออีเมลบริษัท
// สมัครเรียนไม่ได้เลย ทั้งที่ไม่มีเหตุผลด้านความปลอดภัยรองรับ
func TestEmailPolicyAllowsAnyDomainByDefault(t *testing.T) {
	t.Setenv("ADMIN_EMAIL_DOMAINS", "")

	emails := []string{
		"parent@gmail.com",
		"parent@hotmail.com",
		"parent@outlook.co.th",
		"someone@mycompany.co.th",
		"koyama@gmail.com",
	}

	roles := []models.UserRole{models.CustomerRole, models.CoachRole, models.AdminRole}

	for _, email := range emails {
		for _, role := range roles {
			if err := ValidateEmailForRole(email, role); err != nil {
				t.Errorf("%s (%s) ควรผ่าน แต่ได้ error: %v", email, role, err)
			}
		}
	}
}

// พอตั้ง ADMIN_EMAIL_DOMAINS แล้ว แอดมินต้องถูกบังคับตามนั้น
//
// เป็นทางที่จะใช้วันที่โรงเรียนมีโดเมนของตัวเอง โดยไม่ต้องกลับมาแก้โค้ด
func TestEmailPolicyEnforcesAdminDomainWhenConfigured(t *testing.T) {
	t.Setenv("ADMIN_EMAIL_DOMAINS", "koyama.ac.th")

	if err := ValidateEmailForRole("admin@koyama.ac.th", models.AdminRole); err != nil {
		t.Errorf("โดเมนที่อนุญาตควรผ่าน แต่ได้: %v", err)
	}

	err := ValidateEmailForRole("admin@gmail.com", models.AdminRole)
	if !errors.Is(err, ErrAdminEmailDomain) {
		t.Errorf("โดเมนนอกรายการควรถูกปฏิเสธ แต่ได้: %v", err)
	}
}

// การบังคับโดเมนต้องมีผลกับแอดมินเท่านั้น ผู้เรียนกับโค้ชต้องไม่ถูกกระทบ
//
// ถ้าเทสนี้พัง = วันที่โรงเรียนเปิดใช้โดเมน นักเรียนทั้งโรงเรียนจะสมัครไม่ได้ทันที
func TestEmailPolicyDomainRuleAppliesToAdminOnly(t *testing.T) {
	t.Setenv("ADMIN_EMAIL_DOMAINS", "koyama.ac.th")

	for _, role := range []models.UserRole{models.CustomerRole, models.CoachRole} {
		if err := ValidateEmailForRole("student@gmail.com", role); err != nil {
			t.Errorf("%s ไม่ควรถูกบังคับโดเมน แต่ได้: %v", role, err)
		}
	}
}

// ตั้งหลายโดเมนได้ คั่นด้วยจุลภาค
func TestEmailPolicyAcceptsMultipleAdminDomains(t *testing.T) {
	t.Setenv("ADMIN_EMAIL_DOMAINS", "koyama.ac.th, koyama.com")

	for _, email := range []string{"a@koyama.ac.th", "b@koyama.com"} {
		if err := ValidateEmailForRole(email, models.AdminRole); err != nil {
			t.Errorf("%s ควรผ่าน แต่ได้: %v", email, err)
		}
	}
}

// รูปแบบอีเมลที่ใช้ไม่ได้ต้องถูกปฏิเสธทุกบทบาท
func TestEmailPolicyRejectsMalformed(t *testing.T) {
	bad := []string{
		"",
		"noatsign",
		"@nolocal.com",
		"nodomain@",
		"no-dot@localhost",
	}

	for _, email := range bad {
		for _, role := range []models.UserRole{models.CustomerRole, models.AdminRole} {
			if err := ValidateEmailForRole(email, role); err == nil {
				t.Errorf("%q (%s) ควรถูกปฏิเสธ แต่ผ่านไปได้", email, role)
			}
		}
	}
}

// ตัวพิมพ์ใหญ่และช่องว่างต้องถูกจัดรูปแบบก่อนเทียบ
func TestNormalizeEmail(t *testing.T) {
	if got := NormalizeEmail("  Admin@Gmail.COM "); got != "admin@gmail.com" {
		t.Fatalf("ควรได้ admin@gmail.com แต่ได้ %q", got)
	}
}

// อีเมลที่พิมพ์เป็นตัวใหญ่ต้องถูกจับได้หลังผ่าน NormalizeEmail
func TestEmailPolicyMatchesDomainCaseInsensitively(t *testing.T) {
	t.Setenv("ADMIN_EMAIL_DOMAINS", "koyama.ac.th")

	email := NormalizeEmail("Admin@KOYAMA.AC.TH")
	if err := ValidateEmailForRole(email, models.AdminRole); err != nil {
		t.Fatalf("ต้องผ่านแม้พิมพ์เป็นตัวใหญ่ แต่ได้: %v", err)
	}
}
