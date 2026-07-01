package main

import (
	"log"
	"os"

	"CPE-691015/internal/config"
	"CPE-691015/internal/midlewares"
	"CPE-691015/internal/routes"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	// โหลด .env (มองหาไฟล์ .env ที่ขึ้นไป 3 ระดับจาก cmd/serve/)
	_ = godotenv.Load("../../../.env")

	// 1. เชื่อมต่อฐานข้อมูล GORM
	config.ConnectDB()

	// 2. สร้าง Gin HTTP Engine
	r := gin.Default()

	// ใช้งาน CORS Middleware ก่อนลงทะเบียน Routes เพื่อให้อนุญาตการเข้าถึงจาก Next.js
	r.Use(midlewares.CORSMiddleware())

	// 3. ตั้งค่า Routes
	routes.SetupRoutes(r)

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