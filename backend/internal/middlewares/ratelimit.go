package middlewares

import (
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// ─────────────────────────────────────────────────────────────────────────────
// จำกัดจำนวนครั้งที่ยิง endpoint อ่อนไหวได้ต่อช่วงเวลา (rate limit)
//
// ปัญหาที่แก้: endpoint ที่รับรหัสผ่าน (login, ยืนยันก่อนเปลี่ยนบัญชีธนาคาร)
// ยิงกี่ครั้งก็ได้ไม่จำกัด คนร้ายจึงเดารหัสผ่านรัว ๆ ได้จนกว่าจะถูก
// ตัวจับเวลา bcrypt ช่วยหน่วงได้บ้างแต่ไม่พอ เพราะยิงขนานกันได้
//
// ⚠️ ข้อจำกัดที่ต้องรู้ 3 ข้อ:
//
//  1. เก็บตัวนับไว้ใน memory ของโปรเซสเดียว ถ้าวันหนึ่งรันหลาย instance
//     หลังตัวกระจายโหลด แต่ละ instance จะนับแยกกัน เพดานจริงจะกลายเป็น
//     limit × จำนวน instance ตอนนั้นต้องย้ายไปเก็บที่ Redis
//
//  2. นับตาม IP ผู้เรียก คนทั้งโรงเรียนที่ออกเน็ตผ่านเราเตอร์ตัวเดียวกัน
//     จะถูกนับรวมเป็นคนเดียว ค่า default จึงตั้งให้หลวมพอที่คนใช้งานปกติ
//     พร้อมกันหลายคนจะไม่โดนบล็อก
//
//  3. นับตาม IP ไม่ได้กันการเดารหัสของบัญชีเดียวจากหลาย IP (credential stuffing)
//     ตัวที่กันเรื่องนั้นคือการล็อกบัญชีหลังเดาผิดหลายครั้ง ซึ่งยังไม่ได้ทำ
//     ถือเป็นงานต่อยอดที่ควรทำคู่กับ endpoint เปลี่ยนรหัสผ่าน
// ─────────────────────────────────────────────────────────────────────────────

// counter คือตัวนับของ key หนึ่ง ๆ ในหน้าต่างเวลาปัจจุบัน
type counter struct {
	hits    int
	resetAt time.Time
}

// limiter เก็บตัวนับของทุก key พร้อมล็อกกันหลาย request แก้พร้อมกัน
type limiter struct {
	mu     sync.Mutex
	counts map[string]*counter

	limit  int
	window time.Duration
}

// janitorInterval คือความถี่ในการกวาดตัวนับที่หมดอายุทิ้ง
//
// จำเป็นต้องมี ไม่ใช่ของแถม: ถ้าปล่อยให้ map โตไปเรื่อย ๆ คนร้ายยิงจาก IP
// เยอะ ๆ จะทำให้หน่วยความจำเซิร์ฟเวอร์เต็มได้ กลายเป็นว่าโค้ดที่เขียนมา
// กัน DoS เปิดช่อง DoS เสียเอง
const janitorInterval = 5 * time.Minute

func newLimiter(limit int, window time.Duration) *limiter {
	l := &limiter{
		counts: make(map[string]*counter),
		limit:  limit,
		window: window,
	}

	go l.janitor()
	return l
}

// janitor ลบตัวนับที่พ้นหน้าต่างเวลาไปแล้วออกจาก map เป็นระยะ
func (l *limiter) janitor() {
	ticker := time.NewTicker(janitorInterval)
	defer ticker.Stop()

	for range ticker.C {
		now := time.Now()
		l.mu.Lock()
		for key, c := range l.counts {
			if now.After(c.resetAt) {
				delete(l.counts, key)
			}
		}
		l.mu.Unlock()
	}
}

// allow บันทึกหนึ่งครั้งของ key แล้วบอกว่าเกินเพดานหรือยัง
// ถ้าเกิน จะคืนเวลาที่ต้องรอก่อนยิงใหม่ได้ด้วย
func (l *limiter) allow(key string) (bool, time.Duration) {
	now := time.Now()

	l.mu.Lock()
	defer l.mu.Unlock()

	c, found := l.counts[key]
	if !found || now.After(c.resetAt) {
		// เริ่มหน้าต่างใหม่
		l.counts[key] = &counter{hits: 1, resetAt: now.Add(l.window)}
		return true, 0
	}

	if c.hits >= l.limit {
		return false, time.Until(c.resetAt)
	}

	c.hits++
	return true, 0
}

// RateLimit คืน middleware ที่จำกัดจำนวน request ต่อ IP ในหน้าต่างเวลาที่กำหนด
//
// สร้าง limiter หนึ่งตัวต่อการเรียกหนึ่งครั้ง แปลว่าแต่ละ endpoint ที่ผูก
// middleware นี้จะมีโควตาแยกกัน — โค้ชที่ยืนยันรหัสผ่านผิดจนโดนบล็อก
// จะไม่พาให้ล็อกอินของคนอื่นโดนบล็อกไปด้วย
func RateLimit(limit int, window time.Duration) gin.HandlerFunc {
	l := newLimiter(limit, window)

	return func(c *gin.Context) {
		ok, retryAfter := l.allow(c.ClientIP())
		if !ok {
			seconds := int(retryAfter.Seconds()) + 1
			c.Header("Retry-After", strconv.Itoa(seconds))

			// ต้องเป็น 429 ห้ามใช้ 401 เด็ดขาด
			// SessionGuard ฝั่งหน้าเว็บเด้งผู้ใช้ออกจากระบบทุกครั้งที่เจอ 401
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error": "พยายามหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่อีกครั้ง",
			})
			c.Abort()
			return
		}

		c.Next()
	}
}

// ─── ค่าเพดานเริ่มต้น ───
//
// ตั้งให้หลวมพอที่คนใช้งานปกติจะไม่โดน แต่แน่นพอที่การเดารหัสผ่านจะช้า
// จนไม่คุ้ม เพราะทั้งโรงเรียนอาจใช้ IP เดียวกัน (ดูข้อจำกัดข้อ 2 ด้านบน)
//
// ปรับได้ผ่าน .env โดยไม่ต้องแก้โค้ด:
//
//	RATE_LIMIT_LOGIN=30        # ครั้งต่อหน้าต่างเวลา
//	RATE_LIMIT_SENSITIVE=10
//	RATE_LIMIT_WINDOW_MINUTES=15
// 60 ครั้งต่อ 15 นาที = 4 ครั้งต่อนาที ซึ่งช้าจนเดารหัสผ่านไม่ไหวแน่นอน
// แต่ยังรองรับคนทั้งโรงเรียนที่ล็อกอินพร้อมกันตอนเริ่มคลาสผ่านเน็ตเส้นเดียวกันได้
const (
	defaultLoginLimit     = 60
	defaultSensitiveLimit = 10
	defaultChatLimit      = 60
	defaultWindowMinutes  = 15
)

// LoginRateLimit ใช้กับ endpoint ที่รับอีเมล+รหัสผ่านเพื่อออก token
func LoginRateLimit() gin.HandlerFunc {
	return RateLimit(envInt("RATE_LIMIT_LOGIN", defaultLoginLimit), rateWindow())
}

// SensitiveRateLimit ใช้กับ action ที่ต้องยืนยันรหัสผ่านซ้ำ เช่น เปลี่ยนบัญชีรับเงิน
//
// เพดานต่ำกว่า login เพราะคนปกติทำรายการพวกนี้นาน ๆ ครั้ง
// ถ้ามีใครยิงถี่กว่านี้แปลว่าไม่ใช่การใช้งานปกติแน่นอน
func SensitiveRateLimit() gin.HandlerFunc {
	return RateLimit(envInt("RATE_LIMIT_SENSITIVE", defaultSensitiveLimit), rateWindow())
}

// PublicChatRateLimit ใช้กับ endpoint แชทสาธารณะ (สร้าง session / ถามคำถาม)
// ที่เปิดให้ผู้ไม่ล็อกอินเรียกและเขียนลงฐานข้อมูล — กันการยิงสแปมสร้างข้อมูลขยะ/PII
// ท่วมฐานข้อมูล ตั้งเพดานให้หลวมพอที่การสนทนาปกติ (ถามหลายข้อความต่อ session) จะไม่โดนบล็อก
func PublicChatRateLimit() gin.HandlerFunc {
	return RateLimit(envInt("RATE_LIMIT_CHAT", defaultChatLimit), rateWindow())
}

func rateWindow() time.Duration {
	return time.Duration(envInt("RATE_LIMIT_WINDOW_MINUTES", defaultWindowMinutes)) * time.Minute
}

// envInt อ่านค่าตัวเลขจาก env ถ้าไม่มีหรือค่าไม่ถูกต้อง (เช่น 0 หรือติดลบ)
// จะใช้ค่า fallback แทน — กันตั้งค่าผิดแล้วกลายเป็นปิดการป้องกันไปเลย
func envInt(key string, fallback int) int {
	raw := os.Getenv(key)
	if raw == "" {
		return fallback
	}

	v, err := strconv.Atoi(raw)
	if err != nil || v <= 0 {
		return fallback
	}
	return v
}
