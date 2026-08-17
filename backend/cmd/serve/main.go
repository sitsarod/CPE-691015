package main

import (
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