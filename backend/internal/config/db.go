package config

import (
	"log"
	"os"
	"strconv"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"
)

// DB is the global database connection instance
var DB *gorm.DB

// defaultSlowQueryThreshold — ดีฟอลต์ GORM 200ms ต่ำเกินไป round-trip ไป Neon เปล่า ๆ ก็ ~370ms แล้ว
const defaultSlowQueryThreshold = time.Second

func slowQueryThreshold() time.Duration {
	if ms, err := strconv.Atoi(os.Getenv("DB_SLOW_QUERY_MS")); err == nil && ms > 0 {
		return time.Duration(ms) * time.Millisecond
	}
	return defaultSlowQueryThreshold
}

// ConnectDB establishes a connection to the PostgreSQL database using the DATABASE_URL environment variable
func ConnectDB() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("DATABASE_URL is not set in env")
	}

	dbLogger := gormlogger.New(
		log.New(os.Stdout, "", log.LstdFlags),
		gormlogger.Config{
			SlowThreshold:             slowQueryThreshold(),
			LogLevel:                  gormlogger.Warn,
			IgnoreRecordNotFoundError: true,
			Colorful:                  false,
		},
	)

	var err error
	DB, err = gorm.Open(postgres.New(postgres.Config{
		DSN:                  dsn,
		PreferSimpleProtocol: true, // disables implicit prepared statement usage to fix PgBouncer cache issues
	}), &gorm.Config{Logger: dbLogger})
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}

	// ตั้งค่า connection pool ให้เข้ากับ Neon (autosuspend หลัง idle 5 นาที)
	//
	// พอ Neon หลับ มันจะปิด connection ฝั่ง server ทิ้ง — connection เก่าที่ค้างในพูล
	// จะกลายเป็นของเสีย query แรกหลังตื่นจะเจอ "connection reset" ถ้าไม่รีไซเคิลก่อน
	// จึงตั้งอายุ idle/lifetime ให้สั้นกว่าหน้าต่าง autosuspend เพื่อทิ้ง connection ตายเอง
	if sqlDB, err := DB.DB(); err != nil {
		log.Fatal("Failed to access underlying sql.DB:", err)
	} else {
		sqlDB.SetMaxOpenConns(10)                  // กันเปิดทะลักตอนโหลดพุ่ง
		sqlDB.SetMaxIdleConns(2)                   // เก็บ connection ว่างไว้ไม่กี่เส้นพอ reuse
		sqlDB.SetConnMaxIdleTime(3 * time.Minute)  // < 5 นาที: ปล่อย connection ว่างหลุดก่อน Neon หลับ
		sqlDB.SetConnMaxLifetime(30 * time.Minute) // เพดานอายุ กัน connection ค้างข้ามรอบ suspend
	}
}
