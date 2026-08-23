package services

import (
	"errors"
	"os"
	"sync"
	"time"
	_ "time/tzdata"
)

// ErrInvalidDateFormat ถูกคืนเมื่อวันที่ที่ส่งมาไม่ใช่รูปแบบ YYYY-MM-DD
var ErrInvalidDateFormat = errors.New("รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)")

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

// localDayRange แปลง "YYYY-MM-DD" เป็นช่วงของวันนั้นตามนาฬิกาที่สนาม แบบ [from, to)
//
// ⚠️ ต้องใช้ ParseInLocation ไม่ใช่ time.Parse
//
// time.Parse ตีความว่าเป็น UTC แต่เวลาที่ระบบบันทึกเป็น ICT (คอลัมน์ timestamptz)
// ช่วงที่ได้จึงเลื่อนไป 7 ชั่วโมง กลายเป็น 07:00 ของวันที่ขอ ถึง 07:00 ของวันถัดไป
// ผลคือคาบก่อน 07:00 ถูกนับเป็นของเมื่อวาน และคาบ 00:00–07:00 ของวันถัดไปโผล่ปนเข้ามา
func localDayRange(date string) (from, to time.Time, err error) {
	from, err = time.ParseInLocation("2006-01-02", date, appLocation())
	if err != nil {
		return time.Time{}, time.Time{}, ErrInvalidDateFormat
	}
	return from, from.AddDate(0, 0, 1), nil
}
