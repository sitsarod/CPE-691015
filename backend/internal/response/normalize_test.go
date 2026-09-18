package response

import (
	"encoding/json"
	"testing"
)

type inner struct {
	Tags []string `json:"tags"`
}

type outer struct {
	Items   []inner  `json:"items"`
	Names   []string `json:"names"`
	Nested  *inner   `json:"nested"`
	Comment string   `json:"comment"`
}

// marshal ช่วยตรวจผลลัพธ์จริงหลัง json.Marshal (สิ่งที่ frontend ได้รับ)
func marshal(t *testing.T, v any) string {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("marshal ล้มเหลว: %v", err)
	}
	return string(b)
}

func TestNormalize_TopLevelNilSlice(t *testing.T) {
	var s []int
	got := marshal(t, Normalize(s))
	if got != "[]" {
		t.Fatalf("nil slice ระดับบนสุดควรได้ [] แต่ได้ %s", got)
	}
}

func TestNormalize_NilSliceInStruct(t *testing.T) {
	got := marshal(t, Normalize(outer{Comment: "hi"}))
	want := `{"items":[],"names":[],"nested":null,"comment":"hi"}`
	if got != want {
		t.Fatalf("struct: got %s want %s", got, want)
	}
}

func TestNormalize_NestedSliceInsideSliceElems(t *testing.T) {
	o := outer{Items: []inner{{Tags: nil}, {Tags: []string{"a"}}}}
	got := marshal(t, Normalize(o))
	want := `{"items":[{"tags":[]},{"tags":["a"]}],"names":[],"nested":null,"comment":""}`
	if got != want {
		t.Fatalf("nested: got %s want %s", got, want)
	}
}

func TestNormalize_PointerFieldNormalized(t *testing.T) {
	o := outer{Nested: &inner{Tags: nil}}
	got := marshal(t, Normalize(o))
	want := `{"items":[],"names":[],"nested":{"tags":[]},"comment":""}`
	if got != want {
		t.Fatalf("pointer: got %s want %s", got, want)
	}
}

func TestNormalize_GinHLikeMap(t *testing.T) {
	// เลียนแบบ gin.H{"data": <slice ว่าง>} ที่ controller ใช้บ่อยที่สุด
	m := map[string]any{"data": []inner(nil), "message": "ok"}
	got := marshal(t, Normalize(m))
	want := `{"data":[],"message":"ok"}`
	if got != want {
		t.Fatalf("map: got %s want %s", got, want)
	}
}

func TestNormalize_PreservesNonNilAndValues(t *testing.T) {
	o := outer{Items: []inner{{Tags: []string{"x", "y"}}}, Names: []string{"n"}, Comment: "c"}
	got := marshal(t, Normalize(o))
	want := `{"items":[{"tags":["x","y"]}],"names":["n"],"nested":null,"comment":"c"}`
	if got != want {
		t.Fatalf("preserve: got %s want %s", got, want)
	}
}
