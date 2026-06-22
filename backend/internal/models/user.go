package models
import "time"

type User struct {
    ID        uint      `gorm:"primaryKey"`
    Name      string    `gorm:"type:varchar(100);not null"`
    Email     string    `gorm:"type:varchar(100);unique;not null"`
    CreatedAt time.Time
}