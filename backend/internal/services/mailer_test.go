package services

import (
	"encoding/base64"
	"strings"
	"testing"
)

// เทสชุดนี้คุมรูปแบบจดหมายที่ประกอบขึ้น
//
// ⚠️ ความผิดพลาดตรงนี้ไม่ทำให้โปรแกรมพัง แต่ทำให้จดหมายตกถังขยะ
// ซึ่งแปลว่าผู้ใช้กู้รหัสผ่านไม่ได้ทั้งที่ระบบรายงานว่าส่งสำเร็จ
// ทดสอบด้วยมือก็จับยาก เพราะต้องรอดูว่าเข้ากล่องไหน

// hasEncodedWord ตรวจว่ามีข้อความที่เข้ารหัสตาม RFC 2047 อยู่หรือไม่
//
// ⚠️ ต้องไม่สนตัวพิมพ์เล็กใหญ่
//
// รูปแบบคือ =?charset?encoding?ข้อความ?= โดยตัว encoding เป็น B (base64)
// หรือ Q (quoted-printable) ซึ่งมาตรฐานระบุชัดว่าไม่สนตัวพิมพ์
// ไลบรารีของ Go ออกมาเป็น b ตัวเล็ก ส่วนไลบรารีอื่นใช้ B ตัวใหญ่
//
// เทสเดิมเช็คหา "=?UTF-8?B?" ตรง ๆ จึงพังทั้งที่โค้ดทำงานถูก
// เป็นการผูกเทสไว้กับรายละเอียดที่มาตรฐานไม่ได้บังคับ
func hasEncodedWord(s string) bool {
	return strings.Contains(strings.ToLower(s), "=?utf-8?b?") ||
		strings.Contains(strings.ToLower(s), "=?utf-8?q?")
}

func newTestMailer() *smtpMailer {
	return &smtpMailer{
		host:     "smtp.gmail.com",
		port:     "587",
		username: "sender@gmail.com",
		password: "แอบดูไม่ได้",
		from:     "Koyama Badminton <sender@gmail.com>",
	}
}

// หัวจดหมายต้องครบตามที่มาตรฐานบังคับ
func TestBuildMessageHasRequiredHeaders(t *testing.T) {
	msg := string(newTestMailer().buildMessage("someone@example.com", "หัวข้อภาษาไทย", "เนื้อความ"))

	required := []string{
		"From: ",
		"To: someone@example.com",
		"Subject: ",
		"Date: ",       // RFC 5322 บังคับ ไม่มี = จดหมายไม่สมบูรณ์
		"Message-ID: ", // ไม่มี = ดูเหมือนไม่ได้ส่งจากระบบเมลจริง
		"MIME-Version: 1.0",
	}

	for _, h := range required {
		if !strings.Contains(msg, h) {
			t.Errorf("ขาดหัวจดหมาย %q", h)
		}
	}
}

// ⚠️ เทสสำคัญ: ห้ามมีภาษาไทยดิบ ๆ อยู่ในส่วนหัวจดหมาย
//
// หัวจดหมายรองรับแค่ ASCII การใส่ภาษาไทยตรง ๆ ผิดมาตรฐาน
// ผู้รับจะเห็นตัวอักษรเพี้ยน และตัวกรองสแปมหักคะแนน
func TestBuildMessageEncodesThaiSubject(t *testing.T) {
	subject := "รหัสยืนยันสำหรับตั้งรหัสผ่านใหม่"
	msg := string(newTestMailer().buildMessage("someone@example.com", subject, "เนื้อความ"))

	head := msg
	if idx := strings.Index(msg, "\r\n\r\n"); idx >= 0 {
		head = msg[:idx]
	}

	if strings.Contains(head, subject) {
		t.Fatal("หัวจดหมายมีภาษาไทยดิบ ๆ อยู่ ต้องเข้ารหัสแบบ =?UTF-8?B?...?= ก่อน")
	}
	if !hasEncodedWord(head) {
		t.Fatal("ไม่พบการเข้ารหัสหัวข้อแบบ RFC 2047")
	}

	// ทุกตัวอักษรในส่วนหัวต้องเป็น ASCII
	for i := 0; i < len(head); i++ {
		if head[i] > 127 {
			t.Fatalf("พบไบต์ที่ไม่ใช่ ASCII ในหัวจดหมายที่ตำแหน่ง %d", i)
		}
	}
}

// เนื้อความต้องถอดกลับมาได้ตรงกับต้นฉบับ
func TestBuildMessageBodyRoundTrips(t *testing.T) {
	body := "รหัสยืนยันของท่านคือ\n\n        482913\n"
	msg := string(newTestMailer().buildMessage("someone@example.com", "หัวข้อ", body))

	idx := strings.Index(msg, "\r\n\r\n")
	if idx < 0 {
		t.Fatal("ไม่พบเส้นแบ่งระหว่างหัวจดหมายกับเนื้อความ")
	}

	if !strings.Contains(msg[:idx], "Content-Transfer-Encoding: base64") {
		t.Fatal("ต้องประกาศว่าเนื้อความเข้ารหัสแบบ base64")
	}

	encoded := strings.ReplaceAll(msg[idx+4:], "\r\n", "")
	decoded, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		t.Fatalf("ถอดรหัสเนื้อความไม่ได้: %v", err)
	}
	if string(decoded) != body {
		t.Fatalf("เนื้อความไม่ตรงกับต้นฉบับ\nได้: %q\nควรเป็น: %q", decoded, body)
	}
}

// ⚠️ เทสสำคัญที่สุดของไฟล์นี้
//
// อีเมลใน From ต้องเป็นบัญชีที่ล็อกอิน SMTP เสมอ
// ถ้าไม่ตรง Gmail ถือว่าปลอมตัวผู้ส่งแล้วโยนลงถังขยะทันที
func TestFromHeaderAlwaysUsesAuthenticatedAddress(t *testing.T) {
	cases := []struct {
		name string
		from string
		want string
	}{
		{"ตั้งชื่อแสดงพร้อมอีเมลที่ตรงกัน", "Koyama Badminton <sender@gmail.com>", "sender@gmail.com"},
		{"ตั้งอีเมลอื่นมาก็ต้องไม่ใช้", "Koyama <someone-else@gmail.com>", "sender@gmail.com"},
		{"ตั้งเป็นอีเมลเปล่า", "someone-else@gmail.com", "sender@gmail.com"},
		{"ไม่ได้ตั้งอะไรเลย", "", "sender@gmail.com"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			m := newTestMailer()
			m.from = tc.from

			got := m.fromHeader()
			if !strings.Contains(got, tc.want) {
				t.Fatalf("From ต้องมี %q แต่ได้ %q", tc.want, got)
			}
			if strings.Contains(got, "someone-else@gmail.com") {
				t.Fatalf("From ใช้อีเมลที่ไม่ได้ล็อกอิน SMTP: %q", got)
			}
		})
	}
}

// ชื่อผู้ส่งภาษาไทยต้องถูกเข้ารหัสด้วย
func TestFromHeaderEncodesThaiDisplayName(t *testing.T) {
	m := newTestMailer()
	m.from = "โรงเรียนแบดมินตันโคยามะ <sender@gmail.com>"

	got := m.fromHeader()
	if strings.Contains(got, "โรงเรียน") {
		t.Fatal("ชื่อผู้ส่งภาษาไทยต้องเข้ารหัสก่อนใส่ในหัวจดหมาย")
	}
	if !hasEncodedWord(got) {
		t.Fatalf("ไม่พบการเข้ารหัสชื่อผู้ส่ง: %q", got)
	}
}

// ไม่ตั้งค่า SMTP ต้องถอยไปใช้ logMailer ไม่ใช่พังหรือส่งจริง
func TestNewMailerFallsBackWhenUnconfigured(t *testing.T) {
	t.Setenv("SMTP_HOST", "")
	t.Setenv("SMTP_USERNAME", "")
	t.Setenv("SMTP_PASSWORD", "")

	if _, ok := NewMailer().(*logMailer); !ok {
		t.Fatal("ตั้งค่าไม่ครบต้องถอยไปใช้ logMailer")
	}
}

func TestNewMailerUsesSMTPWhenConfigured(t *testing.T) {
	t.Setenv("SMTP_HOST", "smtp.gmail.com")
	t.Setenv("SMTP_USERNAME", "sender@gmail.com")
	t.Setenv("SMTP_PASSWORD", "app-password")

	m, ok := NewMailer().(*smtpMailer)
	if !ok {
		t.Fatal("ตั้งค่าครบแล้วต้องใช้ smtpMailer")
	}
	if m.port != "587" {
		t.Fatalf("ไม่ได้ตั้ง SMTP_PORT ควรใช้ 587 แต่ได้ %s", m.port)
	}
}
