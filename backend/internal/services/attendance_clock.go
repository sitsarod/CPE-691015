package services

import (
	"os"
	"sync"
	"time"
	_ "time/tzdata"
)


// AppTimeZoneEnv ชื่อ env var ที่ใช้ override เขตเวลา (เผื่อย้ายสนามไปคนละประเทศ)
const AppTimeZoneEnv = "APP_TIMEZONE"

const defaultTimeZone = "Asia/Bangkok"

var (
	localLocOnce sync.Once
	localLoc     *time.Location
)

// appLocation คืนเขตเวลาของสนาม อ่านครั้งเดียวแล้ว cache ไว้
func appLocation() *time.Location {
	localLocOnce.Do(func() {
		name := os.Getenv(AppTimeZoneEnv)
		if name == "" {
			name = defaultTimeZone
		}

		loc, err := time.LoadLocation(name)
		if err != nil {

			loc = time.FixedZone("ICT", 7*60*60)
		}
		localLoc = loc
	})
	return localLoc
}

// nowLocal คือ "เดี๋ยวนี้" ตามนาฬิกาที่สนาม
func nowLocal() time.Time {
	return time.Now().In(appLocation())
}
