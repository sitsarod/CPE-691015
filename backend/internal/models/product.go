package models
import "time"

type Product struct {
    ID          uint      `gorm:"primaryKey"`
    Title       string    `gorm:"type:varchar(200);not null"`
    Price       float64   `gorm:"type:numeric(10,2);not null"`
    Stock       int       `gorm:"default:0"`
    CreatedAt   time.Time
}