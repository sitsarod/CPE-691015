package services

import (
	"encoding/base64"
	"fmt"
	"log"
	"mime"
	"net/smtp"
	"os"
	"strings"
	"time"
)

// ─────────────────────────────────────────────────────────────────────────────
// การส่งอีเมล
//
// ทำเป็น interface เพราะสามเหตุผล:
//
//  1. เทสได้จริง — เทสใช้ตัวปลอมที่เก็บอีเมลไว้ในหน่วยความจำ
//     ไม่ต้องต่อเน็ตและไม่ส่งอีเมลจริงหาใคร
//
//  2. ระบบยังทำงานได้แม้ยังไม่ได้ตั้งค่า SMTP — ถอยไปพิมพ์ลง log แทน
//     ทำให้ทีมพัฒนาต่อได้โดยไม่ต้องรอให้ใครไปสมัครบริการอีเมลก่อน
//
//  3. เปลี่ยนผู้ให้บริการทีหลังได้โดยไม่ต้องแตะโค้ดที่เรียกใช้
// ─────────────────────────────────────────────────────────────────────────────

// Mailer คือสิ่งที่ส่งอีเมลได้
type Mailer interface {
	Send(to, subject, body string) error
}

// NewMailer เลือกตัวส่งอีเมลตามค่าที่ตั้งไว้ใน .env
//
//	SMTP_HOST=smtp.gmail.com
//	SMTP_PORT=587
//	SMTP_USERNAME=koyama@gmail.com
//	SMTP_PASSWORD=<App Password 16 หลัก ไม่ใช่รหัสผ่านบัญชี>
//	SMTP_FROM=Koyama Badminton <koyama@gmail.com>
//
// ⚠️ ถ้าใช้ Gmail ต้องเปิด 2FA แล้วสร้าง "App Password" เฉพาะกิจ
// ห้ามใส่รหัสผ่านบัญชีจริงลงไป เพราะถ้า .env รั่วคนจะได้ทั้งบัญชีอีเมล
//
// ไม่ได้ตั้งค่า = ถอยไปใช้ logMailer ซึ่งพิมพ์ OTP ลง console แทนการส่งจริง
func NewMailer() Mailer {
	host := strings.TrimSpace(os.Getenv("SMTP_HOST"))
	user := strings.TrimSpace(os.Getenv("SMTP_USERNAME"))
	pass := os.Getenv("SMTP_PASSWORD")

	if host == "" || user == "" || pass == "" {
		log.Println("[mail] ยังไม่ได้ตั้งค่า SMTP — อีเมลจะถูกพิมพ์ลง console แทนการส่งจริง")
		return &logMailer{}
	}

	port := strings.TrimSpace(os.Getenv("SMTP_PORT"))
	if port == "" {
		port = "587"
	}

	from := strings.TrimSpace(os.Getenv("SMTP_FROM"))
	if from == "" {
		from = user
	}

	log.Printf("[mail] ส่งอีเมลผ่าน %s:%s", host, port)
	return &smtpMailer{host: host, port: port, username: user, password: pass, from: from}
}

// ─── ตัวส่งจริงผ่าน SMTP ───

type smtpMailer struct {
	host     string
	port     string
	username string
	password string
	from     string
}

// encodeHeader แปลงข้อความภาษาไทยให้ใส่ในหัวจดหมายได้
//
// ⚠️ หัวจดหมายตามมาตรฐานรองรับแค่ ASCII เท่านั้น
//
// การใส่ภาษาไทยดิบ ๆ ลงไปตรง ๆ ผิดมาตรฐาน RFC 5322 ผลคือผู้รับบางราย
// เห็นเป็นตัวอักษรเพี้ยน และตัวกรองสแปมหักคะแนนให้ด้วย เพราะจดหมายที่
// ผิดมาตรฐานมักมาจากเครื่องมือส่งสแปมที่เขียนลวก ๆ
//
// mime.BEncoding แปลงเป็นรูปแบบ =?UTF-8?B?...?= ซึ่งเป็นวิธีมาตรฐาน
func encodeHeader(s string) string {
	return mime.BEncoding.Encode("UTF-8", s)
}

// buildMessage ประกอบจดหมายให้ครบตามมาตรฐาน
//
// หัวจดหมายที่ขาดไม่ได้ (ขาดแล้วโดนมองว่าเป็นสแปมทันที):
//
//	Date       — RFC 5322 บังคับ ไม่มีถือว่าจดหมายไม่สมบูรณ์
//	Message-ID — ใช้ระบุจดหมายแต่ละฉบับ ไม่มีแปลว่าไม่ได้ส่งจากระบบเมลจริง
//	From       — ต้องตรงกับบัญชีที่ล็อกอิน SMTP ไม่งั้นถือว่าปลอมตัวผู้ส่ง
func (m *smtpMailer) buildMessage(to, subject, body string) []byte {
	// ตั้ง Message-ID ด้วยโดเมนของผู้ส่ง ให้ดูสมเหตุสมผลกับที่อยู่ต้นทาง
	domain := "localhost"
	if at := strings.LastIndex(m.username, "@"); at >= 0 {
		domain = m.username[at+1:]
	}
	messageID := fmt.Sprintf("<%d.%d@%s>", time.Now().UnixNano(), os.Getpid(), domain)

	headers := []string{
		"From: " + m.fromHeader(),
		"To: " + to,
		"Subject: " + encodeHeader(subject),
		"Date: " + time.Now().Format(time.RFC1123Z),
		"Message-ID: " + messageID,
		"MIME-Version: 1.0",
		`Content-Type: text/plain; charset="UTF-8"`,
		"Content-Transfer-Encoding: base64",

		// บอกว่าเป็นจดหมายอัตโนมัติ ไม่ควรมีใครตอบกลับ
		// และไม่ควรถูกตอบด้วยข้อความ "ไม่อยู่ออฟฟิศ" อัตโนมัติ
		"Auto-Submitted: auto-generated",
	}

	// เข้ารหัสเนื้อความเป็น base64
	//
	// เนื้อหาภาษาไทยเป็นไบต์ที่เกิน 7 บิต ซึ่งเซิร์ฟเวอร์เมลรุ่นเก่าบางตัว
	// ตัดทิ้งหรือทำเพี้ยน base64 ทำให้ผ่านได้ทุกเส้นทางอย่างปลอดภัย
	encoded := base64.StdEncoding.EncodeToString([]byte(body))

	// ตัดเป็นบรรทัดละ 76 ตัวอักษรตามมาตรฐาน MIME
	var wrapped strings.Builder
	for i := 0; i < len(encoded); i += 76 {
		end := i + 76
		if end > len(encoded) {
			end = len(encoded)
		}
		wrapped.WriteString(encoded[i:end])
		wrapped.WriteString("\r\n")
	}

	return []byte(strings.Join(headers, "\r\n") + "\r\n\r\n" + wrapped.String())
}

// fromHeader คืนค่า From ที่เข้ารหัสชื่อผู้ส่งแล้ว
//
// ⚠️ ที่อยู่อีเมลใน From ต้องตรงกับบัญชีที่ใช้ล็อกอิน SMTP
//
// ถ้าไม่ตรง Gmail จะถือว่าเป็นการปลอมตัวผู้ส่ง แล้วโยนลงถังขยะของผู้รับ
// ตรงนี้จึงบังคับใช้อีเมลของบัญชีที่ล็อกอินเสมอ ส่วน SMTP_FROM เอาไว้
// ตั้ง "ชื่อที่แสดง" อย่างเดียว
func (m *smtpMailer) fromHeader() string {
	name := strings.TrimSpace(m.from)

	// ตัดเอาเฉพาะชื่อ ถ้าตั้งมาในรูปแบบ ชื่อ <อีเมล>
	if open := strings.Index(name, "<"); open >= 0 {
		name = strings.TrimSpace(name[:open])
	}
	// ถ้าตั้งมาเป็นอีเมลเปล่า ๆ ก็ไม่ต้องมีชื่อแสดง
	if strings.Contains(name, "@") {
		name = ""
	}

	if name == "" {
		return m.username
	}
	return fmt.Sprintf("%s <%s>", encodeHeader(name), m.username)
}

func (m *smtpMailer) Send(to, subject, body string) error {
	auth := smtp.PlainAuth("", m.username, m.password, m.host)

	addr := m.host + ":" + m.port
	msg := m.buildMessage(to, subject, body)

	if err := smtp.SendMail(addr, auth, m.username, []string{to}, msg); err != nil {
		return fmt.Errorf("ส่งอีเมลไม่สำเร็จ: %w", err)
	}
	return nil
}

// ─── ตัวสำรองตอนยังไม่ได้ตั้งค่า SMTP ───

type logMailer struct{}

// Send พิมพ์อีเมลลง console แทนการส่งจริง
//
// ⚠️ ห้ามใช้ตอนขึ้นใช้งานจริงเด็ดขาด เพราะ OTP จะไปโผล่ใน log ของเซิร์ฟเวอร์
// ซึ่งแปลว่าใครที่อ่าน log ได้ก็ยึดบัญชีของใครก็ได้
//
// มีไว้เพื่อให้ทีมพัฒนาต่อได้ระหว่างที่ยังไม่ได้ตั้งค่าอีเมลเท่านั้น
func (m *logMailer) Send(to, subject, body string) error {
	log.Printf("\n[mail] ───── ยังไม่ได้ตั้งค่า SMTP จึงไม่ได้ส่งจริง ─────\nถึง: %s\nเรื่อง: %s\n\n%s\n[mail] ────────────────────────────────────────\n",
		to, subject, body)
	return nil
}
