package config

import (
	"log"
	"os"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// DB is the global database connection instance
var DB *gorm.DB

// ConnectDB establishes a connection to the PostgreSQL database using the DATABASE_URL environment variable
func ConnectDB() {

	
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("DATABASE_URL is not set in env")
	}

	var err error
	DB, err = gorm.Open(postgres.New(postgres.Config{
		DSN:                  dsn,
		PreferSimpleProtocol: true, // disables implicit prepared statement usage to fix PgBouncer cache issues
	}), &gorm.Config{})
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}
}