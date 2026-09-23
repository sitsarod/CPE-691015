package main

import (
	"context"
	"fmt"
	"log"
	"net/url"
	"os"
	"strings"
	"time"

	"CPE-691015/internal/config"
	"CPE-691015/internal/middlewares"
	"CPE-691015/internal/routes"
	"CPE-691015/internal/services"
	"CPE-691015/internal/token"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

// dailyMaintenanceHour = เวลารันงานดูแลระบบรายวันทั้งหมด (cleanup/sync) ที่รวบไว้รอบเดียว
// เลือกตี 5 ช่วงแทบไม่มีคนใช้งาน เพื่อปลุก Neon แค่ครั้งเดียวต่อวันในเวลาที่กระทบผู้ใช้น้อยสุด
const dailyMaintenanceHour = 5

// nextDailyMaintenanceAt คืนเวลาตี 5 ครั้งถัดไปหลังจาก now (ยึดโซนเวลาไทยเสมอ ไม่อิง TZ เครื่อง)
func nextDailyMaintenanceAt(now time.Time) time.Time {
	local := now.In(services.AppLocation())
	next := time.Date(local.Year(), local.Month(), local.Day(), dailyMaintenanceHour, 0, 0, 0, local.Location())
	if !next.After(local) {
		next = next.AddDate(0, 0, 1)
	}
	return next
}

// startDailyMaintenanceJob รวมงานดูแลระบบรายวันทั้งหมดไว้ใน scheduler เดียว รันวันละครั้งตอนตี 5
//
// เดิมแต่ละงานเป็น goroutine แยกที่ sleep 24 ชม.เอง เวลาตื่นผูกกับ "ตอน boot" เลยกระจายและ
// คุมไม่ได้ · รวบมาไว้รอบเดียวเพื่อให้ Neon ถูกปลุกครั้งเดียวต่อวันแล้วกลับไปหลับยาว ๆ
//
// รันครั้งแรกทันทีตอน boot ด้วย — ตอน boot ต่อ DB อยู่แล้วจึงไม่ได้เพิ่มรอบปลุกใหม่ และกันงาน
// ค้างบนโฮสต์ที่รีสตาร์ทบ่อยก่อนถึงตี 5 · จากนั้นตื่นตอนตี 5 ของทุกวัน
//
// ไม่รวมงานเตือนยืนยันมาเรียน (18:00 เวลามีความหมายต่อ UX) กับงาน event-driven
// (attendance auto-close / face worker) เพราะจังหวะตื่นคนละแบบ
func startDailyMaintenanceJob() {
	userService := services.NewUserService(config.DB)
	// ส่ง Cloudinary ให้ service ที่ต้องลบไฟล์แนบจริงตอนลบของเก่า (nil ได้ถ้าไม่ได้ตั้งค่า)
	autoQAService := services.NewAutoQAService(config.DB, services.NewCloudinaryService())
	billingService := services.NewBillingService(config.DB)
	mediaStorage := services.NewMediaStorage()
	photoService := services.NewDetectedPhotoService(config.DB).WithMediaStorage(mediaStorage)
	videoService := services.NewDetectedVideoService(config.DB).WithMediaStorage(mediaStorage)

	// runOnce ทำงานดูแลทั้งชุดตามลำดับ · ครอบ recover ไว้ไม่ให้ task ใด panic แล้วทำให้
	// scheduler ทั้งตัวตายจนงานรายวันหยุดถาวร (เดิมแยก goroutine เลยไม่ลามถึงกัน)
	runOnce := func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("งานดูแลระบบรายวัน panic (ข้ามรอบนี้ รอบหน้ารันต่อ): %v", r)
			}
		}()

		// 1) ปรับสถานะลูกค้า active/inactive
		if err := userService.SyncCustomerStatuses(); err != nil {
			log.Printf("ปรับสถานะลูกค้าอัตโนมัติล้มเหลว: %v", err)
		}

		// 2) ลบห้องแชทของผู้เยี่ยมชม (guest) ที่เกิน 7 วัน (เฉพาะ guest ไม่แตะห้องของผู้ล็อกอิน)
		if n, err := autoQAService.DeleteOldSessions(7 * 24 * time.Hour); err != nil {
			log.Printf("ลบแชทของผู้เยี่ยมชมที่เกิน 7 วันอัตโนมัติล้มเหลว: %v", err)
		} else if n > 0 {
			log.Printf("ลบแชทของผู้เยี่ยมชมที่เกิน 7 วันอัตโนมัติ %d ห้อง", n)
		}

		// 3) เลื่อนสถานะบิลค้างชำระที่เลยกำหนดเป็น overdue (และเลื่อนกลับถ้า due_date เป็นอนาคต)
		if n, err := billingService.MarkOverdueBillings(); err != nil {
			log.Printf("อัปเดตสถานะบิลเกินกำหนดอัตโนมัติล้มเหลว: %v", err)
		} else if n > 0 {
			log.Printf("อัปเดตสถานะบิลเกินกำหนดอัตโนมัติ %d รายการ", n)
		}

		// 4) ลบรูป/วิดีโอโพสต์ที่เกิน photoPostRetention
		if n, err := photoService.DeleteOldRawPhotos(photoPostRetention); err != nil {
			log.Printf("ลบรูปโพสต์ที่เกินกำหนดอัตโนมัติล้มเหลว: %v", err)
		} else if n > 0 {
			log.Printf("ลบรูปโพสต์ที่เกินกำหนดอัตโนมัติ %d รูป", n)
		}
		if n, err := videoService.DeleteOldRawVideos(photoPostRetention); err != nil {
			log.Printf("ลบวิดีโอโพสต์ที่เกินกำหนดอัตโนมัติล้มเหลว: %v", err)
		} else if n > 0 {
			log.Printf("ลบวิดีโอโพสต์ที่เกินกำหนดอัตโนมัติ %d คลิป", n)
		}

		// 5) ลบบัญชีที่ไม่เคยยืนยันอีเมลเกิน unverifiedUserRetention (กันอีเมลถูกจองค้างถาวร)
		if n, err := userService.DeleteUnverifiedUsers(unverifiedUserRetention); err != nil {
			log.Printf("ลบบัญชีที่ไม่เคยยืนยันอีเมลอัตโนมัติล้มเหลว: %v", err)
		} else if n > 0 {
			log.Printf("ลบบัญชีที่ไม่เคยยืนยันอีเมลอัตโนมัติ %d บัญชี", n)
		}
	}

	go func() {
		runOnce() // รอบแรกตอน boot
		for {
			time.Sleep(time.Until(nextDailyMaintenanceAt(time.Now())))
			runOnce()
		}
	}()
}

// startAttendanceAutoCloseJob ปิดรอบเช็คชื่อที่ลืมกดปิด (ดู AutoCloseStaleSessions)
func startAttendanceAutoCloseJob() {
	attendanceService := services.NewAttendanceService(config.DB)
	go func() {
		timer := time.NewTimer(0)
		defer timer.Stop()

		for {
			select {
			case <-services.WaitForAttendanceSessionOpened():
			case <-timer.C:
			}

			if n, err := attendanceService.AutoCloseStaleSessions(); err != nil {
				log.Printf("ปิดรอบเช็คชื่อที่ค้างอัตโนมัติล้มเหลว: %v", err)
			} else if n > 0 {
				log.Printf("ปิดรอบเช็คชื่อที่เลยเวลาแล้วอัตโนมัติ %d รอบ", n)
			}

			// ตั้ง timer เฉพาะตอนมีรอบเปิดค้างจริง — ถ้าไม่มีรอบเปิดเลยไม่ตั้ง จะได้นอนรอ
			// สัญญาณเปิดรอบใหม่อย่างเดียว ช่วงว่างไม่แตะฐาน ให้ Neon idle แล้วหลับ
			timer.Stop()
			if wait, ok := attendanceService.NextAutoCloseWait(); ok {
				timer.Reset(wait)
			}
		}
	}()
}

// startClassConfirmReminderJob เตือนนักเรียนที่ยังไม่ยืนยันคาบของวันพรุ่งนี้ วันละครั้งตามเวลาที่กำหนด
// (ดู NotifyPendingConfirmations) · สตาร์ทหลังเวลาเตือนของวันนี้จะส่งทันที กันซ้ำด้วย signature ต่อคนต่อวัน
func startClassConfirmReminderJob() {
	confirmationService := services.NewClassConfirmationService(config.DB)
	run := func() {
		if err := confirmationService.NotifyPendingConfirmations(); err != nil {
			log.Printf("เตือนยืนยันมาเรียนอัตโนมัติล้มเหลว: %v", err)
		}
	}

	go func() {
		if services.ConfirmReminderPassedToday(time.Now()) {
			run()
		}
		for {
			time.Sleep(time.Until(services.NextConfirmReminderAt(time.Now())))
			run()
		}
	}()
}

// photoPostRetention คือระยะเวลาที่รูป/วิดีโอโพสต์ (RawPhoto/RawVideo) จะถูกเก็บไว้ก่อนลบถาวร
// ให้เวลาผู้ถูกแท็กดาวน์โหลดเก็บไว้เองก่อน (ปุ่มดาวน์โหลดอยู่ที่แท็บ Posts ในโปรไฟล์)
const photoPostRetention = 7 * 24 * time.Hour

// unverifiedUserRetention คือเวลาที่บัญชีที่สมัครไว้แต่ไม่เคยยืนยันอีเมลเลยจะถูกเก็บไว้ก่อนลบถาวร
//
// เผื่อคนพิมพ์อีเมลผิด/ปลอมตอนสมัคร แล้ว "ไม่กลับมาสมัครซ้ำเลย" ทิ้งบัญชีขยะที่จองอีเมลนั้น
// ไว้ถาวร (login ก็ไม่ได้ ลบเองก็ไม่ได้) OTP หมดอายุแค่ 10 นาที (ดู otpTTL) ชั่วโมงเดียว
// จึงเผื่อเวลาให้พอเกินกว่าจะกดขอรหัสใหม่/ลองใหม่ได้สบาย ๆ โดยไม่เสี่ยงไปลบคนที่กำลังยืนยันอยู่จริง
const unverifiedUserRetention = 1 * time.Hour

// startFaceEmbeddingWorker สร้าง embedding ให้รูปใบหน้าที่อัปโหลดเข้ามา
//
// ⚠️ ขับด้วยสัญญาณ (NotifyFaceImageQueued) ไม่ poll — ตอนไม่มีรูปรอจะหลับยาว
// เพื่อให้ Neon idle แล้ว scale-to-zero ได้ ไม่ยิง query ทิ้งทุกไม่กี่วินาที
//
// ⚠️ ต่างจาก job อื่นข้างบนตรงที่ใช้ context ไม่ใช่ time.Sleep
// เพื่อให้หยุดได้ตอนปิดเซิร์ฟเวอร์ แทนที่จะค้างเป็น goroutine ผี
//
// ไม่ตั้งค่า face-service ไว้ worker จะไม่เริ่มเลยและ log บอก — รูปค้างที่ pending
// ส่วนเช็คชื่อด้วย QR ยังทำงานปกติ
func startFaceEmbeddingWorker(ctx context.Context) {
	worker := services.NewFaceEmbeddingWorker(
		config.DB,
		services.NewHTTPFaceEngine(),
		services.NewCloudinaryService(),
	)
	go worker.Run(ctx)
}

// sensitiveQueryKeys คือ query param ที่ห้ามให้ค่าจริงโผล่ใน access log
// (token = JWT ที่ SSE ส่งมาทาง query เพราะ EventSource ตั้ง header Authorization ไม่ได้)
var sensitiveQueryKeys = []string{"token"}

// sanitizedLogFormatter จัดรูปแบบ access log เหมือน Logger ดีฟอลต์ของ Gin
// แต่ปกปิดค่าของ query param อ่อนไหว (เช่น ?token=...) ไม่ให้ค่าจริงถูกเขียนลง log
// ตั้งใจไม่ใส่สี ANSI เพื่อให้ log ที่ไป stdout/ไฟล์อ่านง่ายและ grep ได้สะดวก
func sanitizedLogFormatter(p gin.LogFormatterParams) string {
	latency := p.Latency
	// connection ยาว ๆ (เช่น SSE) ตัดเศษวินาทีทิ้งให้อ่านง่าย เหมือน Logger ดีฟอลต์
	if latency > time.Minute {
		latency = latency.Truncate(time.Second)
	}
	return fmt.Sprintf("[GIN] %s | %3d | %13v | %15s | %-7s %#v\n",
		p.TimeStamp.Format("2006/01/02 - 15:04:05"),
		p.StatusCode,
		latency,
		p.ClientIP,
		p.Method,
		redactSensitiveQuery(p.Path),
	)
}

// redactSensitiveQuery แทนค่าของ query param อ่อนไหวใน path ด้วย [redacted]
// ถ้า path ไม่มี query หรือไม่มี key อ่อนไหวก็คืนค่าเดิม (parse ไม่ได้ = ตัดทั้งก้อนทิ้งกันหลุด)
func redactSensitiveQuery(path string) string {
	base, rawQuery, found := strings.Cut(path, "?")
	if !found {
		return path
	}
	values, err := url.ParseQuery(rawQuery)
	if err != nil {
		return base + "?[redacted]"
	}
	redacted := false
	for _, key := range sensitiveQueryKeys {
		if values.Has(key) {
			values.Set(key, "[redacted]")
			redacted = true
		}
	}
	if !redacted {
		return path
	}
	return base + "?" + values.Encode()
}

func main() {
	// โหลด .env (มองหาไฟล์ .env ที่ขึ้นไป 3 ระดับจาก cmd/serve/)
	_ = godotenv.Load("../../../.env")

	// ตรวจว่าตั้ง JWT_SECRET แล้วตั้งแต่ startup (fail fast) — กันไม่ให้เซิร์ฟเวอร์
	// สตาร์ทขึ้นมาโดยไม่มี secret แล้วทุก request ที่ต้องยืนยันตัวตนพังตอน runtime
	if err := token.Validate(); err != nil {
		log.Fatalf("การตั้งค่าไม่ถูกต้อง: %v", err)
	}

	// 1. เชื่อมต่อฐานข้อมูล GORM
	config.ConnectDB()

	// 2. สร้าง Gin HTTP Engine
	//
	// ใช้ gin.New() + ประกอบ middleware เองแทน gin.Default() เพราะ Logger ดีฟอลต์
	// เขียน path พร้อม query string ดิบลง log ทำให้ ?token=<JWT> ของ SSE (/notifications/stream)
	// หลุดเข้า access log ตรง ๆ — ใครเข้าถึง log ได้ก็เห็น token จริง ใช้สวมสิทธิ์ได้จน token หมดอายุ
	// จึงใส่ formatter ที่ปกปิดค่า query param อ่อนไหวก่อน แล้วคง Recovery ไว้เหมือน gin.Default()
	r := gin.New()
	r.Use(gin.LoggerWithFormatter(sanitizedLogFormatter))
	r.Use(gin.Recovery())

	// ⚠️ ต้องตั้งก่อนใช้ rate limit ที่นับตาม IP
	//
	// โดยดีฟอลต์ Gin เชื่อ header X-Forwarded-For จากใครก็ได้ แปลว่า c.ClientIP()
	// คืนค่าที่ผู้เรียกใส่มาเองได้ คนร้ายจึงเปลี่ยน IP ปลอมทุก request
	// แล้วยิงเดารหัสผ่านได้ไม่จำกัด ทั้งที่มี rate limit อยู่
	//
	// SetTrustedProxies(nil) = ไม่เชื่อ proxy ใครเลย ให้ใช้ IP จริงของ TCP connection
	// ถ้าวันหนึ่งเอา nginx/cloudflare มาคั่นหน้า ต้องกลับมาใส่ IP ของตัวนั้นตรงนี้
	// ไม่งั้น request ทุกอันจะกลายเป็น IP ของ proxy ตัวเดียว แล้วคนทั้งระบบโดนบล็อกพร้อมกัน
	if err := r.SetTrustedProxies(nil); err != nil {
		log.Fatalf("ตั้งค่า trusted proxies ไม่สำเร็จ: %v", err)
	}

	// ใช้งาน CORS Middleware ก่อนลงทะเบียน Routes เพื่อให้อนุญาตการเข้าถึงจาก Next.js
	r.Use(middlewares.CORSMiddleware())

	// 3. ตั้งค่า Routes
	routes.SetupRoutes(r)

	// 3.1 งานดูแลระบบรายวันทั้งหมด (ปรับสถานะลูกค้า / ลบแชท-รูป-โพสต์เก่า / บิลเกินกำหนด /
	// ลบบัญชีที่ไม่ยืนยันอีเมล) รวบไว้ scheduler เดียว รันวันละครั้งตอนตี 5 ปลุก Neon ครั้งเดียวต่อวัน
	// หมายเหตุ: เลิกลบประกาศที่หมดอายุอัตโนมัติแล้ว — "หมดอายุ" = ซ่อนจากฟีด (กรองด้วยวันที่ใน
	// GetActiveAnnouncements) แต่ record ยังอยู่ เพื่อให้ฟีเจอร์ "บันทึกไว้อ่านทีหลัง" เปิดดูย้อนหลังได้
	startDailyMaintenanceJob()

	// 3.2 ปิดรอบเช็คชื่อที่ลืมกดปิด แล้วมาร์คคนที่ไม่มาเป็นขาดเรียน (event-driven ตื่นเมื่อมีรอบเปิด)
	startAttendanceAutoCloseJob()

	// 3.3 เตือนนักเรียนที่ยังไม่ยืนยันมาเรียนก่อนปิดรับ (ทุกวันเวลา 18:00)
	startClassConfirmReminderJob()

	// 3.4 สร้าง embedding ให้รูปใบหน้าที่อัปโหลดเข้ามา (pending → awaiting_review/rejected)
	workerCtx, stopWorker := context.WithCancel(context.Background())
	defer stopWorker()
	startFaceEmbeddingWorker(workerCtx)

	// 4. เริ่มสตาร์ทเซิร์ฟเวอร์หลัก (serve)
	port := os.Getenv("PORT")
	if port == "" {
		port = "8000"
	}

	log.Printf("เซิร์ฟเวอร์หลักเริ่มต้นที่พอร์ต %s...", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("ไม่สามารถสตาร์ทเซิร์ฟเวอร์ได้: %v", err)
	}
}
