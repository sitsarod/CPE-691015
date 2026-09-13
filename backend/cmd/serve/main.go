package main

import (
	"context"
	"log"
	"os"
	"time"

	"CPE-691015/internal/config"
	"CPE-691015/internal/middlewares"
	"CPE-691015/internal/routes"
	"CPE-691015/internal/services"
	"CPE-691015/internal/token"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

// startCustomerStatusJob รันงานปรับสถานะลูกค้า (active/inactive) แบบอัตโนมัติทุกวัน
// รันครั้งแรกทันทีตอนสตาร์ท แล้วทำซ้ำทุก 24 ชั่วโมง
func startCustomerStatusJob() {
	userService := services.NewUserService(config.DB)
	go func() {
		for {
			if err := userService.SyncCustomerStatuses(); err != nil {
				log.Printf("ปรับสถานะลูกค้าอัตโนมัติล้มเหลว: %v", err)
			}
			time.Sleep(24 * time.Hour)
		}
	}()
}

// startAnnouncementCleanupJob ลบประกาศที่พ้นวันสิ้นสุดแล้วอัตโนมัติ
// รันครั้งแรกทันทีตอนสตาร์ท แล้วทำซ้ำทุก 1 ชั่วโมง (เบา ไม่หนัก DB)
func startAnnouncementCleanupJob() {
	announcementService := services.NewAnnouncementService(config.DB)
	go func() {
		for {
			if n, err := announcementService.DeleteExpiredAnnouncements(); err != nil {
				log.Printf("ลบประกาศที่หมดอายุอัตโนมัติล้มเหลว: %v", err)
			} else if n > 0 {
				log.Printf("ลบประกาศที่หมดอายุอัตโนมัติ %d รายการ", n)
			}
			time.Sleep(1 * time.Hour)
		}
	}()
}

// startChatCleanupJob ลบห้องแชทของผู้เยี่ยมชม (guest) ที่สร้างมานานเกิน 7 วันอัตโนมัติ
// (เฉพาะ guest — ห้องแชทของผู้ใช้ที่ล็อกอินแล้วจะไม่ถูกลบ) พร้อม log ข้อความ
// ตรงกับข้อความต้อนรับที่แจ้งผู้ใช้ว่า "แชทนี้จะยังคงอยู่ภายใน 7 วัน"
// รันครั้งแรกทันทีตอนสตาร์ท แล้วทำซ้ำทุก 6 ชั่วโมง
func startChatCleanupJob() {
	autoQAService := services.NewAutoQAService(config.DB)
	go func() {
		for {
			if n, err := autoQAService.DeleteOldSessions(7 * 24 * time.Hour); err != nil {
				log.Printf("ลบแชทของผู้เยี่ยมชมที่เกิน 7 วันอัตโนมัติล้มเหลว: %v", err)
			} else if n > 0 {
				log.Printf("ลบแชทของผู้เยี่ยมชมที่เกิน 7 วันอัตโนมัติ %d ห้อง", n)
			}
			time.Sleep(6 * time.Hour)
		}
	}()
}

// startAttendanceAutoCloseJob ปิดรอบเช็คชื่อที่ลืมกดปิด (ดู AutoCloseStaleSessions)
// รันครั้งแรกทันทีตอนสตาร์ท แล้วทำซ้ำทุก 15 นาที
//
// ถี่กว่างานอื่นเพราะ markAbsentees อ่านรายชื่อ ณ ตอนปิด ยิ่งทิ้งไว้นานรายชื่อยิ่งเพี้ยน
func startAttendanceAutoCloseJob() {
	attendanceService := services.NewAttendanceService(config.DB)
	go func() {
		for {
			if n, err := attendanceService.AutoCloseStaleSessions(); err != nil {
				log.Printf("ปิดรอบเช็คชื่อที่ค้างอัตโนมัติล้มเหลว: %v", err)
			} else if n > 0 {
				log.Printf("ปิดรอบเช็คชื่อที่เลยเวลาแล้วอัตโนมัติ %d รอบ", n)
			}
			time.Sleep(15 * time.Minute)
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

// startBillingOverdueJob เลื่อนสถานะบิล unfunded ที่เลยวันครบกำหนดเป็น overdue อัตโนมัติ
// (และเลื่อนกลับถ้า due_date ถูกแก้เป็นอนาคต) รันครั้งแรกทันทีตอนสตาร์ท แล้วทำซ้ำทุก 1 ชั่วโมง
func startBillingOverdueJob() {
	billingService := services.NewBillingService(config.DB)
	go func() {
		for {
			if n, err := billingService.MarkOverdueBillings(); err != nil {
				log.Printf("อัปเดตสถานะบิลเกินกำหนดอัตโนมัติล้มเหลว: %v", err)
			} else if n > 0 {
				log.Printf("อัปเดตสถานะบิลเกินกำหนดอัตโนมัติ %d รายการ", n)
			}
			time.Sleep(1 * time.Hour)
		}
	}()
}

// photoPostRetention คือระยะเวลาที่รูป/วิดีโอโพสต์ (RawPhoto/RawVideo) จะถูกเก็บไว้ก่อนลบถาวร
// ให้เวลาผู้ถูกแท็กดาวน์โหลดเก็บไว้เองก่อน (ปุ่มดาวน์โหลดอยู่ที่แท็บ Posts ในโปรไฟล์)
const photoPostRetention = 7 * 24 * time.Hour

// startPhotoPostCleanupJob ลบรูป/วิดีโอโพสต์ที่เกิน photoPostRetention อัตโนมัติ
// รันครั้งแรกทันทีตอนสตาร์ท แล้วทำซ้ำทุก 6 ชั่วโมง (ความถี่เดียวกับลบห้องแชทเก่า)
func startPhotoPostCleanupJob() {
	mediaStorage := services.NewMediaStorage()
	photoService := services.NewDetectedPhotoService(config.DB).WithMediaStorage(mediaStorage)
	videoService := services.NewDetectedVideoService(config.DB).WithMediaStorage(mediaStorage)

	go func() {
		for {
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
			time.Sleep(6 * time.Hour)
		}
	}()
}

// startFaceEmbeddingWorker สร้าง embedding ให้รูปใบหน้าที่รออยู่ ทุก 10 วินาที
//
// ⚠️ ต่างจาก job อื่นข้างบนตรงที่ใช้ ticker + context ไม่ใช่ time.Sleep
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
	r := gin.Default()

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

	// 3.1 เริ่ม background job ปรับสถานะลูกค้า active/inactive อัตโนมัติ (รายวัน)
	startCustomerStatusJob()

	// 3.2 ลบประกาศที่หมดอายุ + ลบห้องแชทที่ปิดเกิน 7 วัน อัตโนมัติ
	startAnnouncementCleanupJob()
	startChatCleanupJob()

	// 3.3 ปิดรอบเช็คชื่อที่ลืมกดปิด แล้วมาร์คคนที่ไม่มาเป็นขาดเรียน
	startAttendanceAutoCloseJob()

	// 3.3.1 เตือนนักเรียนที่ยังไม่ยืนยันมาเรียนก่อนปิดรับ
	startClassConfirmReminderJob()

	// 3.4 เลื่อนสถานะบิลค้างชำระที่เลยวันครบกำหนดเป็นเกินกำหนด (overdue) อัตโนมัติ
	startBillingOverdueJob()

	// 3.4.1 ลบรูป/วิดีโอโพสต์ที่เกิน 7 วันอัตโนมัติ
	startPhotoPostCleanupJob()

	// 3.5 สร้าง embedding ให้รูปใบหน้าที่อัปโหลดเข้ามา (pending → awaiting_review/rejected)
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
