package services

import (
	"errors"
	"testing"

	"CPE-691015/internal/dto"
)

// unit test สำหรับ logic ล้วน ๆ ที่ไม่แตะ DB — รันได้ด้วย:
//   go test ./internal/services/ -run 'TestIsValidDayOfWeek|TestTimeToMinutesWS|TestValidateAvailabilities' -v

func TestIsValidDayOfWeek(t *testing.T) {
	valid := []string{"Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"}
	for _, d := range valid {
		if !isValidDayOfWeek(d) {
			t.Errorf("expected %q to be valid", d)
		}
	}

	invalid := []string{"monday", "MON", "จันทร์", "", "Funday"}
	for _, d := range invalid {
		if isValidDayOfWeek(d) {
			t.Errorf("expected %q to be invalid", d)
		}
	}
}

func TestTimeToMinutesWS(t *testing.T) {
	ok := map[string]int{
		"00:00":    0,
		"09:30":    570,
		"23:59":    1439,
		"09:00:00": 540, // รูปแบบ time ของ Postgres มีวินาที — ต้องยังแปลงถูก
	}
	for in, want := range ok {
		got, err := timeToMinutesWS(in)
		if err != nil {
			t.Errorf("%q: unexpected error %v", in, err)
			continue
		}
		if got != want {
			t.Errorf("%q: got %d want %d", in, got, want)
		}
	}

	bad := []string{"9", "24:00", "12:60", "ab:cd", ""}
	for _, in := range bad {
		if _, err := timeToMinutesWS(in); err == nil {
			t.Errorf("%q: expected error, got nil", in)
		}
	}
}

func TestValidateAvailabilities(t *testing.T) {
	// ชุดที่ถูกต้อง: วันเดียวกันหลายช่วงแบบไม่ซ้อน + คนละวันเวลาเดียวกันได้
	valid := []dto.AvailabilityDetail{
		{DayOfWeek: "Monday", StartTime: "09:00", EndTime: "12:00"},
		{DayOfWeek: "Monday", StartTime: "13:00", EndTime: "15:00"},
		{DayOfWeek: "Tuesday", StartTime: "09:00", EndTime: "12:00"},
	}
	if err := validateAvailabilities(valid); err != nil {
		t.Errorf("expected valid set, got %v", err)
	}

	bad := map[string][]dto.AvailabilityDetail{
		"วันไม่ถูกต้อง":     {{DayOfWeek: "monday", StartTime: "09:00", EndTime: "10:00"}},
		"เวลาผิดรูปแบบ":      {{DayOfWeek: "Monday", StartTime: "9am", EndTime: "10:00"}},
		"start >= end":       {{DayOfWeek: "Monday", StartTime: "10:00", EndTime: "10:00"}},
		"ซ้อนทับในวันเดียว": {
			{DayOfWeek: "Monday", StartTime: "09:00", EndTime: "12:00"},
			{DayOfWeek: "Monday", StartTime: "11:00", EndTime: "13:00"},
		},
	}
	for name, items := range bad {
		err := validateAvailabilities(items)
		if err == nil {
			t.Errorf("%s: expected error, got nil", name)
			continue
		}
		if !errors.Is(err, ErrInvalidAvailability) {
			t.Errorf("%s: expected ErrInvalidAvailability, got %v", name, err)
		}
	}
}
