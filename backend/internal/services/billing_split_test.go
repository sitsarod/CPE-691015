package services

import "testing"

// splitPerHead ต้องปัดยอดหารต่อคน "ขึ้น" เป็นจำนวนเต็มบาทเสมอ
// เพื่อให้ยอดเก็บรวม ≥ ต้นทุนจริง (สถาบันรับส่วนต่างจากการปัด ไม่มีทางเก็บขาด)
func TestSplitPerHead(t *testing.T) {
	cases := []struct {
		name  string
		total float64
		heads int
		want  float64
	}{
		{"1000 หาร 3 → 334", 1000, 3, 334},
		{"1000 หาร 4 → 250 (ลงตัว)", 1000, 4, 250},
		{"100 หาร 3 → 34", 100, 3, 34},
		{"999 หาร 2 → 500", 999, 2, 500},
		{"หารลงตัวไม่ปัดเกิน (900/3=300)", 900, 3, 300},
		{"heads = 0 → 0 (กันหารด้วยศูนย์)", 1000, 0, 0},
		{"total = 0 → 0", 0, 5, 0},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := splitPerHead(c.total, c.heads)
			if got != c.want {
				t.Fatalf("splitPerHead(%v, %d) = %v, want %v", c.total, c.heads, got, c.want)
			}
			// ยอดเก็บรวมต้องไม่น้อยกว่าต้นทุน (ยกเว้นกรณี heads=0 ที่ไม่มีการเก็บ)
			if c.heads > 0 && got*float64(c.heads) < c.total {
				t.Fatalf("ยอดเก็บรวม %v น้อยกว่าต้นทุน %v (เก็บขาด)", got*float64(c.heads), c.total)
			}
		})
	}
}
